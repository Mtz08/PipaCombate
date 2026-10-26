// Fluxo de deposito e saque, no formato que um PSP real exige.
//
// DEPOSITO: cria cobranca (pending) -> PSP gera o PIX -> jogador paga ->
// PSP chama o webhook -> confirmDeposit credita. O credito acontece SO no
// webhook e e idempotente (o PSP pode reenviar o mesmo evento).
//
// SAQUE: valida -> debita e registra o pedido na mesma transacao ->
// pede a transferencia ao PSP (FORA da transacao: chamada externa lenta nao
// segura trava no banco) -> pago, ou estorna se o PSP recusar.

import { db, tx, withUserLock, isUuid } from '../db/index.js';
import { Charges, Withdrawals, Users } from '../db/repos.js';
import { CONFIG } from '../config.js';
import { getProvider } from '../payments/index.js';
import { assertCentsInRange, domainError } from '../util/money.js';
import { assertCpf, normalizePixKey, maskPixKey } from '../util/validate.js';
import { applyCredit, applyDebit } from './wallet.js';

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
    const balanceCents = await applyCredit(t, user, charge.amountCents, 'deposit', { chargeId: charge.id });
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

export async function requestWithdrawal(userId, { amountCents, pixKey, cpf }) {
  const key = normalizePixKey(pixKey);
  const doc = assertCpf(cpf); // usado so na chamada ao PSP; NAO persiste (LGPD)
  assertCentsInRange(amountCents, CONFIG.limits.withdrawMinCents, CONFIG.limits.withdrawMaxCents, 'saque');

  const { withdrawal, balanceCents } = await withUserLock(userId, async (t, user) => {
    const w = await Withdrawals.create(t, {
      userId, amountCents, pixKey: key, pixKeyMask: maskPixKey(key), provider: CONFIG.payments.provider,
    });
    const bal = await applyDebit(t, user, amountCents, 'withdraw', { withdrawalId: w.id, pixKeyMask: w.pixKeyMask });
    return { withdrawal: w, balanceCents: bal };
  });

  let result;
  try {
    result = await getProvider().sendPixTransfer({ withdrawalId: withdrawal.id, amountCents, pixKey: key, cpf: doc });
  } catch {
    // PSP recusou ou falhou: estorna o saldo na hora.
    const bal = await withUserLock(userId, async (t, user) => {
      await Withdrawals.finish(t, withdrawal.id, { status: 'failed' });
      return applyCredit(t, user, amountCents, 'withdraw_reversal', { withdrawalId: withdrawal.id });
    });
    throw Object.assign(domainError('WITHDRAW_FAILED', 'Saque nao processado. Valor devolvido ao saldo.', 502), { balanceCents: bal });
  }

  // 'paid' ou 'processing' (aguarda webhook do PSP)
  const done = await tx((t) => Withdrawals.finish(t, withdrawal.id, { status: result.status, providerRef: result.providerRef }));
  return { withdrawal: viewWithdrawal(done), balanceCents };
}

function viewWithdrawal(w) {
  return { id: w.id, amountCents: w.amountCents, status: w.status, pixKeyMask: w.pixKeyMask };
}
