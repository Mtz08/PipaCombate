// Fluxo de deposito e saque, no formato que um PSP real exige.
//
// DEPOSITO: cria cobranca (pending) -> PSP gera o PIX -> jogador paga ->
// PSP chama o webhook -> confirmDeposit credita. O credito acontece SO no
// webhook e e idempotente (o PSP pode reenviar o mesmo evento).
//
// SAQUE: valida -> debita e registra o pedido na mesma transacao. Acima de
// CONFIG.limits.withdrawAutoMaxCents o pedido fica em 'review' ate o admin
// aprovar (ou recusar, com estorno). Aprovado, pede a transferencia ao PSP
// (FORA da transacao: chamada externa lenta nao segura trava no banco) ->
// pago, ou estorna se o PSP recusar.
//
// Um saque em andamento por vez. O CPF do primeiro saque fica vinculado a
// conta (so o hash): os proximos precisam ser do mesmo titular.

import { db, tx, withUserLock, isUuid } from '../db/index.js';
import { Charges, Withdrawals, Users } from '../db/repos.js';
import { CONFIG } from '../config.js';
import { getProvider } from '../payments/index.js';
import { assertCentsInRange, domainError } from '../util/money.js';
import { assertCpf, normalizePixKey, maskPixKey } from '../util/validate.js';
import { seal, open, cpfHash } from '../util/crypto.js';
import { audit } from './audit.js';
import { applyCredit, applyDebit } from './wallet.js';
import * as Affiliates from './affiliates.js';

// ---------- Deposito ----------

export async function createDeposit(userId, amountCents) {
  assertCentsInRange(amountCents, CONFIG.limits.depositMinCents, CONFIG.limits.depositMaxCents, 'deposito');
  if (!(await Users.getById(db, userId))) throw domainError('NOT_FOUND', 'Usuario inexistente', 404);

  const provider = getProvider();
  const expiresAt = Date.now() + CONFIG.payments.chargeTtlMs;
  const created = await tx((t) => Charges.create(t, { userId, amountCents, provider: CONFIG.payments.provider, expiresAt }));

  const pix = await provider.createPixCharge({ chargeId: created.id, amountCents, expiresAt });
  let charge = await tx((t) => Charges.attachPix(t, created.id, pix));

  // Mock: simula o PSP confirmando o pagamento imediatamente.
  if (CONFIG.payments.provider === 'mock' && CONFIG.payments.mockAutoConfirm) {
    ({ charge } = await confirmDeposit({ providerRef: pix.providerRef, amountCents }));
  }
  return viewCharge(charge);
}

export async function getDeposit(userId, chargeId) {
  const charge = isUuid(chargeId) ? await Charges.get(db, chargeId) : null;
  if (!charge || charge.userId !== userId) throw domainError('NOT_FOUND', 'Deposito inexistente', 404);
  return viewCharge(charge);
}

/**
 * Confirma o pagamento vindo do PSP. Idempotente: evento repetido nao credita
 * duas vezes. Valor divergente vai para revisao manual em vez de creditar.
 */
export async function confirmDeposit({ providerRef, amountCents }) {
  const found = await Charges.getByRef(db, String(providerRef ?? ''));
  if (!found) throw domainError('NOT_FOUND', 'Cobranca inexistente', 404);

  return withUserLock(found.userId, async (t, user) => {
    // rele com a trava: outro webhook simultaneo pode ter confirmado antes
    const charge = await Charges.getByRef(t, providerRef, { forUpdate: true });
    if (charge.status === 'paid') return { charge, duplicate: true };
    if (amountCents !== charge.amountCents) {
      return { charge: await Charges.setStatus(t, charge.id, 'review'), review: true };
    }
    const first = !(await Charges.hasPaid(t, charge.userId));
    const balanceCents = await applyCredit(t, user, charge.amountCents, 'deposit', { chargeId: charge.id });
    await Affiliates.onDeposit(t, user, { amountCents: charge.amountCents, chargeId: charge.id, first });
    return { charge: await Charges.setStatus(t, charge.id, 'paid'), balanceCents };
  });
}

export function viewCharge(c) {
  const expired = c.status === 'pending' && Date.now() > c.expiresAt;
  return {
    id: c.id, amountCents: c.amountCents,
    status: expired ? 'expired' : c.status,
    copyPaste: c.copyPaste ?? null, qrCodeBase64: c.qrCodeBase64 ?? null,
    expiresAt: c.expiresAt,
  };
}

// ---------- Saque ----------

/** source: 'balance' (saldo de jogo) ou 'affiliate' (saldo de comissao). */
export async function requestWithdrawal(userId, { amountCents, pixKey, cpf, source = 'balance' }) {
  const key = normalizePixKey(pixKey);
  const doc = assertCpf(cpf); // nunca em claro no banco (LGPD): so cifrado enquanto espera aprovacao
  const fromAff = source === 'affiliate';
  if (!fromAff) assertCentsInRange(amountCents, CONFIG.limits.withdrawMinCents, CONFIG.limits.withdrawMaxCents, 'saque');
  else if (!Number.isInteger(amountCents) || amountCents <= 0) throw domainError('INVALID_AMOUNT', 'Valor invalido');
  const review = amountCents > CONFIG.limits.withdrawAutoMaxCents;

  const { withdrawal, balanceCents } = await withUserLock(userId, async (t, user) => {
    if (await Withdrawals.pendingByUser(t, userId)) {
      throw domainError('WITHDRAW_PENDING', 'Voce ja tem um saque em andamento. Aguarde ele terminar.', 409);
    }
    const h = cpfHash(doc);
    if (user.cpfHash && user.cpfHash !== h) {
      throw domainError('CPF_MISMATCH', 'O CPF precisa ser o do titular da conta (o mesmo do primeiro saque).');
    }
    if (!user.cpfHash) await Users.setCpfHash(t, userId, h);
    const w = await Withdrawals.create(t, {
      userId, amountCents, pixKey: key, pixKeyMask: maskPixKey(key), provider: CONFIG.payments.provider,
      status: review ? 'review' : 'processing', cpfEnc: review ? seal(doc) : null, source: fromAff ? 'affiliate' : 'balance',
    });
    const meta = { withdrawalId: w.id, pixKeyMask: w.pixKeyMask };
    if (fromAff) {
      const affiliateBalanceCents = await Affiliates.debitForWithdraw(t, userId, amountCents, meta);
      return { withdrawal: w, balanceCents: user.balanceCents, affiliateBalanceCents };
    }
    return { withdrawal: w, balanceCents: await applyDebit(t, user, amountCents, 'withdraw', meta) };
  });

  const extra = fromAff ? { affiliateBalanceCents: (await Affiliates.balanceOf(db, userId)) } : {};
  if (review) return { withdrawal: viewWithdrawal(withdrawal), balanceCents, ...extra };
  const done = await sendToPsp(withdrawal, key, doc);
  return { withdrawal: viewWithdrawal(done), balanceCents, ...extra };
}

/** Devolve o valor de um saque que nao saiu, para o saldo de onde veio. */
async function refund(t, user, w, meta) {
  if (w.source === 'affiliate') { await Affiliates.refundWithdraw(t, w.userId, w.amountCents, meta); return user.balanceCents; }
  return applyCredit(t, user, w.amountCents, 'withdraw_reversal', meta);
}

/** Pede a transferencia ao PSP; se recusar, marca 'failed' e estorna. */
async function sendToPsp(withdrawal, pixKey, cpf) {
  let result;
  try {
    result = await getProvider().sendPixTransfer({ withdrawalId: withdrawal.id, amountCents: withdrawal.amountCents, pixKey, cpf });
  } catch {
    const bal = await withUserLock(withdrawal.userId, async (t, user) => {
      await Withdrawals.finish(t, withdrawal.id, { status: 'failed' });
      return refund(t, user, withdrawal, { withdrawalId: withdrawal.id });
    });
    throw Object.assign(domainError('WITHDRAW_FAILED', 'Saque nao processado. Valor devolvido ao saldo.', 502), { balanceCents: bal });
  }
  // 'paid' ou 'processing' (aguarda webhook do PSP)
  return tx((t) => Withdrawals.finish(t, withdrawal.id, { status: result.status, providerRef: result.providerRef }));
}

/** Admin aprova um saque em 'review': envia ao PSP. */
export async function approveWithdrawal(admin, withdrawalId, ip) {
  const w = await claimForReview(admin, withdrawalId, 'processing');
  await audit(null, { userId: w.userId, actorId: admin.id, action: 'withdraw_approved', meta: { withdrawalId: w.id, amountCents: w.amountCents }, ip });
  const done = await sendToPsp(w, w.pixKey, open(w.cpfEnc));
  return { withdrawal: viewWithdrawal(done) };
}

/** Admin recusa um saque em 'review': estorna o valor ao saldo do jogador. */
export async function rejectWithdrawal(admin, withdrawalId, { note } = {}, ip) {
  const why = String(note ?? '').trim().slice(0, 200);
  if (why.length < 5) throw domainError('REASON_REQUIRED', 'Informe o motivo (min. 5 caracteres)');
  const w = await claimForReview(admin, withdrawalId, 'rejected', why);
  const balanceCents = await withUserLock(w.userId, (t, user) => refund(t, user, w, { withdrawalId: w.id, reason: why }));
  await audit(null, { userId: w.userId, actorId: admin.id, action: 'withdraw_rejected', meta: { withdrawalId: w.id, amountCents: w.amountCents, reason: why }, ip });
  return { withdrawal: viewWithdrawal({ ...w, status: 'rejected', reviewNote: why }), balanceCents };
}

/** Tira o saque da fila com trava: dois admins nao analisam o mesmo pedido. */
async function claimForReview(admin, withdrawalId, nextStatus, note = null) {
  const found = isUuid(withdrawalId) ? await Withdrawals.get(db, withdrawalId) : null;
  if (!found) throw domainError('NOT_FOUND', 'Saque inexistente', 404);
  return withUserLock(found.userId, async (t) => {
    const w = await Withdrawals.get(t, withdrawalId, { forUpdate: true });
    if (w.status !== 'review') throw domainError('NOT_IN_REVIEW', 'Este saque ja foi analisado', 409);
    await Withdrawals.markReviewed(t, w.id, { by: admin.id, note });
    // chave e CPF seguem so em memoria para o envio; no banco somem aqui
    await Withdrawals.finish(t, w.id, { status: nextStatus });
    return w;
  });
}

/** Fila do admin (telefone mascarado). */
export async function reviewQueue() {
  const rows = await Withdrawals.reviewQueue(db);
  return rows.map((w) => ({
    ...viewWithdrawal(w), userId: w.userId, userName: w.userName,
    userPhone: w.userPhone ? `${w.userPhone.slice(0, 4)}*****${w.userPhone.slice(-2)}` : '',
    userBalanceCents: w.userBalanceCents, userSince: w.userSince,
  }));
}

export function viewWithdrawal(w) {
  return { id: w.id, amountCents: w.amountCents, status: w.status, pixKeyMask: w.pixKeyMask, createdAt: w.createdAt ?? null, note: w.reviewNote ?? null, source: w.source || 'balance' };
}
