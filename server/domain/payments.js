// Fluxo de deposito e saque, no formato que um PSP real exige.
//
// DEPOSITO: cria cobranca (pending) -> PSP gera o PIX -> jogador paga ->
// PSP chama o webhook -> confirmDeposit credita. O credito acontece SO no
// webhook e e idempotente (o PSP pode reenviar o mesmo evento). Devolucao do
// PIX (MED/chargeback) debita o que der, estorna comissoes e bloqueia a conta.
//
// SAQUE: valida -> debita e registra o pedido na mesma transacao. Acima de
// CONFIG.limits.withdrawAutoMaxCents o pedido fica em 'review' ate o admin
// aprovar (ou recusar, com estorno). Aprovado, pede a transferencia ao PSP
// (FORA da transacao: chamada externa lenta nao segura trava no banco).
// Estorno SO com recusa definitiva do PSP: timeout/erro de rede fica em
// 'processing' ate o webhook (ou a conciliacao) dizer se o PIX saiu.
//
// Regras: um saque em andamento por vez; CPF do titular vinculado a conta
// (hash, unico entre contas); rollover do deposito antes de sacar; toda
// mudanca de status e condicional ao status anterior (sem estorno em dobro).

import { db, tx, withUserLock, isUuid, isUniqueViolation } from '../db/index.js';
import { Charges, Withdrawals, Users } from '../db/repos.js';
import { CONFIG } from '../config.js';
import { getProvider } from '../payments/index.js';
import { assertCentsInRange, domainError } from '../util/money.js';
import { assertCpf, normalizePixKey, maskPixKey } from '../util/validate.js';
import { seal, open, cpfHash } from '../util/crypto.js';
import { audit } from './audit.js';
import { applyCredit, applyDebit } from './wallet.js';
import * as Affiliates from './affiliates.js';
import { getSetting } from './settings.js';
import { assertCanDeposit, assertNotBlocked } from './responsible.js';
import { log } from '../util/log.js';

const reais = (c) => (c / 100).toFixed(2).replace('.', ',');

// ---------- Deposito ----------

export async function createDeposit(userId, amountCents) {
  const lim = await getSetting('limites');
  assertCentsInRange(amountCents, lim.depositMinCents, lim.depositMaxCents, 'deposito');

  const provider = getProvider();
  const expiresAt = Date.now() + CONFIG.payments.chargeTtlMs;
  // trava o jogador: o limite de deposito conta as cobrancas pendentes
  const created = await withUserLock(userId, async (t, user) => {
    assertNotBlocked(user);
    await assertCanDeposit(t, user, amountCents);
    return Charges.create(t, { userId, amountCents, provider: CONFIG.payments.provider, expiresAt });
  });

  const payer = await Users.getById(db, userId);
  let pix;
  try {
    pix = await provider.createPixCharge({
      chargeId: created.id, amountCents, expiresAt,
      payer: payer ? { name: payer.name, phone: payer.phone } : null,
    });
  } catch (err) {
    // cobranca sem PIX nao pode continuar contando no limite de deposito
    await tx((t) => t.query(`UPDATE charges SET expires_at = now() WHERE id = $1 AND status = 'pending'`, [created.id]));
    log('error', 'psp_charge_failed', { chargeId: created.id, err: String(err?.message || err).slice(0, 200) });
    throw domainError('PIX_UNAVAILABLE', 'Nao foi possivel gerar o PIX agora. Tente de novo em instantes.', 502);
  }
  let charge = await tx((t) => Charges.attachPix(t, created.id, pix));

  // Mock: simula o PSP confirmando o pagamento imediatamente (nunca em producao: ver config.js).
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
 * Cobranca desconhecida: { ignored } (o webhook responde 200 e registra).
 */
export async function confirmDeposit({ providerRef, amountCents }) {
  const found = await Charges.getByRef(db, String(providerRef ?? ''));
  if (!found) return { ignored: true };

  return withUserLock(found.userId, async (t, user) => {
    // rele com a trava: outro webhook simultaneo pode ter confirmado antes
    const charge = await Charges.getByRef(t, providerRef, { forUpdate: true });
    if (charge.status !== 'pending') return { charge, duplicate: true };
    if (amountCents !== charge.amountCents) {
      return { charge: await Charges.setStatus(t, charge.id, 'review'), review: true };
    }
    const first = !(await Charges.hasPaid(t, charge.userId));
    // zerou a banca: o rollover que sobrou de depositos/bonus anteriores nao fica pendurado
    if (user.balanceCents < 100) await t.query('UPDATE users SET wager_required_cents = 0 WHERE id = $1', [user.id]);
    let balanceCents = await applyCredit(t, user, charge.amountCents, 'deposit', { chargeId: charge.id });
    // rollover: o deposito precisa ser apostado (x %) antes de poder sacar
    const { rolloverPct } = await getSetting('limites', t);
    let wager = Math.floor((charge.amountCents * rolloverPct) / 100);
    // bonus de 1o deposito (se ligado no painel): entra no saldo e soma bonus x rolloverX ao rollover
    const bonus = first ? await bonusFor(t, charge.amountCents) : null;
    if (bonus) {
      balanceCents = await applyCredit(t, user, bonus.cents, 'bonus', { chargeId: charge.id, motivo: 'primeiro deposito', rolloverX: bonus.rolloverX });
      wager += bonus.cents * bonus.rolloverX;
    }
    if (wager > 0) await t.query('UPDATE users SET wager_required_cents = wager_required_cents + $2 WHERE id = $1', [user.id, wager]);
    await Affiliates.onDeposit(t, user, { amountCents: charge.amountCents, chargeId: charge.id, first });
    return { charge: await Charges.setStatus(t, charge.id, 'paid'), balanceCents, bonusCents: bonus?.cents || 0 };
  });
}

/** Valor do bonus de 1o deposito para este deposito, ou null (desligado / abaixo do minimo). */
async function bonusFor(t, amountCents) {
  const b = await getSetting('bonus', t);
  if (!b.ativo || amountCents < b.minDepositoCents) return null;
  const cents = Math.min(Math.floor((amountCents * b.pct) / 100), b.maxCents);
  return cents > 0 ? { cents, rolloverX: b.rolloverX } : null;
}

/** Oferta mostrada na tela de deposito (so para quem ainda nao depositou). */
export async function bonusOffer(userId) {
  const b = await getSetting('bonus');
  if (!b.ativo || (await Charges.hasPaid(db, userId))) return null;
  return { pct: b.pct, maxCents: b.maxCents, minDepositoCents: b.minDepositoCents, rolloverX: b.rolloverX };
}

/**
 * Devolucao do PIX ja creditado (MED/chargeback). Debita o que houver de saldo,
 * estorna as comissoes geradas por esse deposito e bloqueia a conta para analise.
 */
export async function refundDeposit({ providerRef, amountCents }) {
  const found = await Charges.getByRef(db, String(providerRef ?? ''));
  if (!found) return { ignored: true };
  return withUserLock(found.userId, async (t, user) => {
    const charge = await Charges.getByRef(t, providerRef, { forUpdate: true });
    if (charge.status !== 'paid') return { charge, duplicate: charge.status === 'refunded' };
    const valor = Math.min(Number(amountCents) || charge.amountCents, charge.amountCents);
    const [bon] = await t.query("SELECT COALESCE(SUM(delta_cents), 0) AS s FROM ledger WHERE user_id = $1 AND type = 'bonus' AND meta->>'chargeId' = $2", [user.id, charge.id]);
    const devolver = valor + Number(bon.s); // deposito devolvido + bonus que ele gerou
    const debit = Math.min(devolver, user.balanceCents);
    if (debit > 0) await applyDebit(t, user, debit, 'chargeback', { chargeId: charge.id, devolvido: valor });
    await Affiliates.reverseCharge(t, charge.id);
    await t.query('UPDATE users SET blocked_at = now(), blocked_reason = $2 WHERE id = $1 AND blocked_at IS NULL',
      [user.id, `Devolucao (MED) do deposito de R$ ${reais(valor)}`]);
    await audit(t, { userId: user.id, action: 'deposit_refunded', meta: { chargeId: charge.id, valor, bonus: Number(bon.s), debitado: debit, faltou: devolver - debit } });
    return { charge: await Charges.setStatus(t, charge.id, 'refunded'), debitado: debit, faltou: devolver - debit };
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
export async function requestWithdrawal(userId, { amountCents, pixKey, cpf, source = 'balance', clientIp = null }) {
  const key = normalizePixKey(pixKey);
  const doc = assertCpf(cpf); // nunca em claro no banco (LGPD): so cifrado enquanto espera aprovacao
  const fromAff = source === 'affiliate';
  const lim = await getSetting('limites');
  if (!fromAff) assertCentsInRange(amountCents, lim.withdrawMinCents, lim.withdrawMaxCents, 'saque');
  else if (!Number.isInteger(amountCents) || amountCents <= 0) throw domainError('INVALID_AMOUNT', 'Valor invalido');
  const review = amountCents > lim.withdrawAutoMaxCents;

  let result;
  try {
    result = await withUserLock(userId, async (t, user) => {
      assertNotBlocked(user);
      if (!fromAff && user.wagerRequiredCents > 0) {
        throw domainError('ROLLOVER_PENDING', `Para sacar, aposte mais R$ ${reais(user.wagerRequiredCents)} (o deposito precisa ser jogado antes do saque).`, 403);
      }
      if (await Withdrawals.pendingByUser(t, userId)) {
        throw domainError('WITHDRAW_PENDING', 'Voce ja tem um saque em andamento. Aguarde ele terminar.', 409);
      }
      const h = cpfHash(doc);
      if (user.cpfHash && user.cpfHash !== h) {
        throw domainError('CPF_MISMATCH', 'O CPF precisa ser o do titular da conta (o mesmo do primeiro saque).');
      }
      if (!user.cpfHash) await Users.setCpfHash(t, userId, h); // UNIQUE: o CPF nao pode estar em outra conta
      const w = await Withdrawals.create(t, {
        userId, amountCents, pixKey: key, pixKeyMask: maskPixKey(key), provider: CONFIG.payments.provider,
        status: review ? 'review' : 'processing', cpfEnc: review ? seal(doc) : null, source: fromAff ? 'affiliate' : 'balance',
        clientIp,
      });
      const meta = { withdrawalId: w.id, pixKeyMask: w.pixKeyMask };
      if (fromAff) {
        const affiliateBalanceCents = await Affiliates.debitForWithdraw(t, userId, amountCents, meta);
        return { withdrawal: w, balanceCents: user.balanceCents, affiliateBalanceCents, ownerName: user.name };
      }
      const balanceCents = await applyDebit(t, user, amountCents, 'withdraw', meta);
      await Affiliates.onWithdrawal(t, user, { amountCents, withdrawalId: w.id }); // devolve a comissao do que saiu
      return { withdrawal: w, balanceCents, ownerName: user.name };
    });
  } catch (err) {
    if (isUniqueViolation(err, 'users_cpf_hash_uniq')) throw domainError('CPF_IN_USE', 'Este CPF ja esta vinculado a outra conta.', 409);
    throw err;
  }

  const { withdrawal, balanceCents, ownerName } = result;
  const extra = fromAff ? { affiliateBalanceCents: (await Affiliates.balanceOf(db, userId)) } : {};
  if (review) return { withdrawal: viewWithdrawal(withdrawal), balanceCents, ...extra };
  const done = await sendToPsp(withdrawal, key, doc, { ownerName, clientIp });
  return { withdrawal: viewWithdrawal(done), balanceCents, ...extra };
}

/** Devolve o valor de um saque que nao saiu, para o saldo de onde veio (na transacao `t`). */
async function refund(t, user, w, meta) {
  if (w.source === 'affiliate') { await Affiliates.refundWithdraw(t, w.userId, w.amountCents, meta); return user.balanceCents; }
  await Affiliates.onWithdrawalRefund(t, w.id);
  return applyCredit(t, user, w.amountCents, 'withdraw_reversal', meta);
}

/** Muda o status SO a partir do esperado; estorna SO se a mudanca aconteceu. */
async function failAndRefund(w, nextStatus, from, meta) {
  return withUserLock(w.userId, async (t, user) => {
    const changed = await Withdrawals.finish(t, w.id, { status: nextStatus, from });
    if (!changed) return null;
    return refund(t, user, w, meta);
  });
}

/**
 * Pede a transferencia ao PSP. Recusa definitiva (err.definitive) estorna; erro
 * ambiguo (timeout/rede) NAO estorna: o PIX pode ter saido. Fica 'processing'.
 */
async function sendToPsp(withdrawal, pixKey, cpf, owner = {}) {
  let result;
  try {
    result = await getProvider().sendPixTransfer({
      withdrawalId: withdrawal.id, amountCents: withdrawal.amountCents, pixKey, cpf,
      ownerName: owner.ownerName, clientIp: owner.clientIp,
    });
  } catch (err) {
    if (err && err.definitive) {
      const bal = await failAndRefund(withdrawal, 'failed', ['processing'], { withdrawalId: withdrawal.id });
      await audit(null, { userId: withdrawal.userId, action: 'withdraw_failed', meta: { withdrawalId: withdrawal.id, motivo: String(err.message || '').slice(0, 120) } });
      throw Object.assign(domainError('WITHDRAW_FAILED', 'Saque nao processado. Valor devolvido ao saldo.', 502), { balanceCents: bal });
    }
    log('error', 'psp_transfer_ambiguous', { withdrawalId: withdrawal.id, err: String(err?.message || err) });
    await audit(null, { userId: withdrawal.userId, action: 'withdraw_unknown', meta: { withdrawalId: withdrawal.id } });
    return { ...withdrawal, status: 'processing' };
  }
  const done = await tx((t) => Withdrawals.finish(t, withdrawal.id, {
    status: result.status, providerRef: result.providerRef, webhookToken: result.webhookToken || null, from: ['processing'],
  }));
  if (done && done.status === 'paid') await audit(null, { userId: withdrawal.userId, action: 'withdraw_paid', meta: { withdrawalId: withdrawal.id, amountCents: withdrawal.amountCents } });
  return done || (await Withdrawals.get(db, withdrawal.id));
}

/** Webhook do PSP sobre a transferencia: 'paid' conclui, 'failed' estorna (uma vez so). */
export async function confirmTransfer({ withdrawalId, providerRef, status }) {
  const w = isUuid(withdrawalId) ? await Withdrawals.get(db, withdrawalId) : (providerRef ? await Withdrawals.getByRef(db, String(providerRef)) : null);
  if (!w) return { ignored: true };
  if (status === 'paid') {
    const done = await tx((t) => Withdrawals.finish(t, w.id, { status: 'paid', providerRef, from: ['processing'] }));
    if (done) await audit(null, { userId: w.userId, action: 'withdraw_paid', meta: { withdrawalId: w.id, amountCents: w.amountCents } });
    return { withdrawal: viewWithdrawal(done || w), changed: !!done };
  }
  if (status === 'failed') {
    const bal = await failAndRefund(w, 'failed', ['processing'], { withdrawalId: w.id });
    if (bal != null) await audit(null, { userId: w.userId, action: 'withdraw_failed', meta: { withdrawalId: w.id, via: 'webhook' } });
    return { changed: bal != null };
  }
  return { ignored: true };
}

/** Admin aprova um saque em 'review': envia ao PSP. */
export async function approveWithdrawal(admin, withdrawalId, ip) {
  const w = await claimForReview(admin, withdrawalId, 'processing');
  await audit(null, { userId: w.userId, actorId: admin.id, action: 'withdraw_approved', meta: { withdrawalId: w.id, amountCents: w.amountCents }, ip });
  const owner = await Users.getById(db, w.userId);
  const done = await sendToPsp(w, w.pixKey, open(w.cpfEnc), { ownerName: owner?.name, clientIp: w.clientIp });
  return { withdrawal: viewWithdrawal(done) };
}

/** Admin recusa um saque em 'review': marca e estorna NA MESMA transacao. */
export async function rejectWithdrawal(admin, withdrawalId, { note } = {}, ip) {
  const why = String(note ?? '').trim().slice(0, 200);
  if (why.length < 5) throw domainError('REASON_REQUIRED', 'Informe o motivo (min. 5 caracteres)');
  const found = await findForReview(admin, withdrawalId);
  const balanceCents = await withUserLock(found.userId, async (t, user) => {
    const w = await Withdrawals.get(t, withdrawalId, { forUpdate: true });
    if (w.status !== 'review') throw domainError('NOT_IN_REVIEW', 'Este saque ja foi analisado', 409);
    await Withdrawals.markReviewed(t, w.id, { by: admin.id, note: why });
    await Withdrawals.finish(t, w.id, { status: 'rejected', from: ['review'] });
    const bal = await refund(t, user, w, { withdrawalId: w.id, reason: why });
    await audit(t, { userId: w.userId, actorId: admin.id, action: 'withdraw_rejected', meta: { withdrawalId: w.id, amountCents: w.amountCents, reason: why }, ip });
    return bal;
  });
  return { withdrawal: viewWithdrawal({ ...found, status: 'rejected', reviewNote: why }), balanceCents };
}

async function findForReview(admin, withdrawalId) {
  const found = isUuid(withdrawalId) ? await Withdrawals.get(db, withdrawalId) : null;
  if (!found) throw domainError('NOT_FOUND', 'Saque inexistente', 404);
  if (admin.id && found.userId === admin.id) throw domainError('SELF_ACTION', 'Admin nao analisa o proprio saque: peca a outro admin', 403);
  return found;
}

/** Tira o saque da fila com trava: dois admins nao analisam o mesmo pedido. */
async function claimForReview(admin, withdrawalId, nextStatus, note = null) {
  const found = await findForReview(admin, withdrawalId);
  return withUserLock(found.userId, async (t) => {
    const w = await Withdrawals.get(t, withdrawalId, { forUpdate: true });
    if (w.status !== 'review') throw domainError('NOT_IN_REVIEW', 'Este saque ja foi analisado', 409);
    await Withdrawals.markReviewed(t, w.id, { by: admin.id, note });
    // chave e CPF seguem so em memoria para o envio; no banco o CPF some aqui
    await Withdrawals.finish(t, w.id, { status: nextStatus, from: ['review'] });
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
