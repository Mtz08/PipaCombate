// Logica de carteira. Toda alteracao de saldo passa por aqui.
//
// Dois niveis:
//  - credit/debit: abrem a propria transacao com o usuario travado.
//  - applyCredit/applyDebit: rodam DENTRO de uma transacao ja aberta por quem
//    chama (game.js, payments.js), compondo varias mudancas numa unica operacao
//    atomica. Recebem o executor `t` e o usuario ja travado (FOR UPDATE).

import { db, withUserLock } from '../db/index.js';
import { Users, Ledger, Withdrawals, Charges } from '../db/repos.js';
import { domainError } from '../util/money.js';

const viewWithdrawalRow = (w) => ({ id: w.id, amountCents: w.amountCents, status: w.status, pixKeyMask: w.pixKeyMask, createdAt: w.createdAt, note: w.reviewNote });

function assertAmount(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw domainError('INVALID_AMOUNT', 'Valor invalido');
  }
}

/** Credita com a transacao ja aberta. Atualiza user.balanceCents e retorna o saldo. */
export async function applyCredit(t, user, amountCents, type, meta = {}) {
  assertAmount(amountCents);
  user.balanceCents = await Users.addBalance(t, user.id, amountCents);
  await Ledger.append(t, { userId: user.id, type, deltaCents: amountCents, balanceAfter: user.balanceCents, meta });
  return user.balanceCents;
}

/** Debita com a transacao ja aberta. Rejeita saldo insuficiente sem alterar nada. */
export async function applyDebit(t, user, amountCents, type, meta = {}) {
  assertAmount(amountCents);
  if (user.balanceCents < amountCents) {
    throw domainError('INSUFFICIENT_FUNDS', 'Saldo insuficiente');
  }
  user.balanceCents = await Users.addBalance(t, user.id, -amountCents);
  await Ledger.append(t, { userId: user.id, type, deltaCents: -amountCents, balanceAfter: user.balanceCents, meta });
  return user.balanceCents;
}

export async function credit(userId, amountCents, type, meta = {}) {
  assertAmount(amountCents);
  return withUserLock(userId, (t, user) => applyCredit(t, user, amountCents, type, meta));
}

export async function debit(userId, amountCents, type, meta = {}) {
  assertAmount(amountCents);
  return withUserLock(userId, (t, user) => applyDebit(t, user, amountCents, type, meta));
}

export async function snapshot(userId) {
  const user = await Users.getById(db, userId);
  if (!user) throw domainError('NOT_FOUND', 'Usuario inexistente', 404);
  return {
    balanceCents: user.balanceCents,
    ledger: await Ledger.recent(db, userId, 20), // mais recentes primeiro
    // pedidos com status (aguardando aprovacao, pago, recusado...) para o extrato
    withdrawals: (await Withdrawals.recentByUser(db, userId, 20)).map(viewWithdrawalRow),
    deposits: (await Charges.recentByUser(db, userId, 20)).map((c) => ({
      id: c.id, amountCents: c.amountCents, createdAt: c.createdAt,
      status: c.status === 'pending' && Date.now() > c.expiresAt ? 'expired' : c.status,
    })),
  };
}
