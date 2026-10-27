// Testes do fluxo de pagamento: deposito via webhook idempotente, devolucao (MED),
// saque com aprovacao, estorno so em recusa definitiva, rollover e CPF unico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Charges, Withdrawals, Users } from '../db/repos.js';
import { makeUser, balanceOf, cpfValido } from '../db/testing.js';
import { CONFIG } from '../config.js';
import * as mock from '../payments/mock.js';
import { providers } from '../payments/index.js';
import {
  createDeposit, confirmDeposit, refundDeposit, requestWithdrawal, approveWithdrawal, rejectWithdrawal, reviewQueue, confirmTransfer,
} from './payments.js';
import { isValidCpf } from '../util/validate.js';

const CPF_OK = '52998224725'; // CPF de exemplo valido (digitos verificadores)
const ADMIN = { id: null };   // so o id do ator vai para a auditoria
const saque = (u, amountCents, extra = {}) => requestWithdrawal(u.id, { amountCents, pixKey: 'ana@exemplo.com', cpf: cpfValido(u.phone), ...extra });

/** Saque direto ao PSP (sem fila de aprovacao). */
async function autoWithdraw(fn) {
  const before = CONFIG.limits.withdrawAutoMaxCents;
  CONFIG.limits.withdrawAutoMaxCents = 10_000_000;
  try { return await fn(); } finally { CONFIG.limits.withdrawAutoMaxCents = before; }
}

async function withoutAutoConfirm(fn) {
  CONFIG.payments.mockAutoConfirm = false;
  try { await fn(); } finally { CONFIG.payments.mockAutoConfirm = true; }
}

test('deposito fica pendente ate o webhook e webhook repetido nao credita 2x', () => withoutAutoConfirm(async () => {
  const u = await makeUser('1177770001');
  const c = await createDeposit(u.id, 5000);
  assert.equal(c.status, 'pending');
  assert.equal(await balanceOf(u.id), 0);

  const ref = (await Charges.get(db, c.id)).providerRef;
  await confirmDeposit({ providerRef: ref, amountCents: 5000 });
  const again = await confirmDeposit({ providerRef: ref, amountCents: 5000 });
  assert.equal(again.duplicate, true);
  assert.equal(await balanceOf(u.id), 5000);
  assert.equal((await confirmDeposit({ providerRef: 'nao-existe', amountCents: 1 })).ignored, true);
}));

test('valor pago diferente do cobrado vai para revisao, sem credito', () => withoutAutoConfirm(async () => {
  const u = await makeUser('1177770002');
  const c = await createDeposit(u.id, 5000);
  const r = await confirmDeposit({ providerRef: (await Charges.get(db, c.id)).providerRef, amountCents: 100 });
  assert.equal(r.review, true);
  assert.equal(await balanceOf(u.id), 0);
}));

test('saque direto: debita, nao devolve CPF e mascara a chave', () => autoWithdraw(async () => {
  const u = await makeUser('1177770003', 50000);
  const r = await requestWithdrawal(u.id, { amountCents: 20000, pixKey: 'fulano@exemplo.com', cpf: CPF_OK });
  assert.equal(r.withdrawal.status, 'paid');
  assert.equal(r.balanceCents, 30000);
  assert.equal(JSON.stringify(r).includes(CPF_OK), false);
  assert.equal(r.withdrawal.pixKeyMask, 'fu***om');
}));

test('recusa DEFINITIVA do PSP estorna; erro incerto (timeout) NAO estorna e espera o webhook', (t) => autoWithdraw(async () => {
  const u = await makeUser('1177770004', 50000);
  const psp = t.mock.method(providers.mock, 'sendPixTransfer', async () => { throw Object.assign(new Error('chave invalida'), { definitive: true }); });
  await assert.rejects(() => saque(u, 20000), (e) => e.code === 'WITHDRAW_FAILED' && e.balanceCents === 50000);
  assert.equal(await balanceOf(u.id), 50000);

  psp.mock.mockImplementation(async () => { throw new Error('ETIMEDOUT'); });
  const r = await saque(u, 20000);
  assert.equal(r.withdrawal.status, 'processing');
  assert.equal(await balanceOf(u.id), 30000); // nao estornou: o PIX pode ter saido

  // o webhook decide; repetido nao estorna duas vezes
  assert.equal((await confirmTransfer({ withdrawalId: r.withdrawal.id, status: 'failed' })).changed, true);
  assert.equal((await confirmTransfer({ withdrawalId: r.withdrawal.id, status: 'failed' })).changed, false);
  assert.equal(await balanceOf(u.id), 50000);
  assert.equal((await confirmTransfer({ withdrawalId: r.withdrawal.id, status: 'paid' })).changed, false); // ja falhou
}));

test('saque acima do limite automatico espera aprovacao; aprovado vira pago', async () => {
  const u = await makeUser('1177770005', 50000);
  const r = await saque(u, 20000);
  assert.equal(r.withdrawal.status, 'review');
  assert.equal(await balanceOf(u.id), 30000); // ja debitado
  const row = await Withdrawals.get(db, r.withdrawal.id);
  assert.ok(row.cpfEnc && !row.cpfEnc.includes(cpfValido(u.phone))); // CPF so cifrado
  assert.ok((await reviewQueue()).some((w) => w.id === r.withdrawal.id));

  const a = await approveWithdrawal(ADMIN, r.withdrawal.id);
  assert.equal(a.withdrawal.status, 'paid');
  const done = await Withdrawals.get(db, r.withdrawal.id);
  assert.equal(done.cpfEnc, null); // apagado ao finalizar
  assert.equal(done.pixKey, null);
  await assert.rejects(() => approveWithdrawal(ADMIN, r.withdrawal.id), (e) => e.code === 'NOT_IN_REVIEW');
  await assert.rejects(() => approveWithdrawal({ id: u.id }, r.withdrawal.id), (e) => e.code === 'SELF_ACTION');
});

test('saque recusado pelo admin estorna (mesma transacao) e exige motivo', async () => {
  const u = await makeUser('1177770006', 50000);
  const r = await saque(u, 20000);
  await assert.rejects(() => rejectWithdrawal(ADMIN, r.withdrawal.id, { note: '' }), (e) => e.code === 'REASON_REQUIRED');
  const x = await rejectWithdrawal(ADMIN, r.withdrawal.id, { note: 'chave PIX de terceiro' });
  assert.equal(x.withdrawal.status, 'rejected');
  assert.equal(await balanceOf(u.id), 50000);
  assert.equal((await Withdrawals.get(db, r.withdrawal.id)).cpfEnc, null);
  await assert.rejects(() => rejectWithdrawal(ADMIN, r.withdrawal.id, { note: 'de novo agora' }), (e) => e.code === 'NOT_IN_REVIEW');
  assert.equal(await balanceOf(u.id), 50000); // nada de estorno em dobro
});

test('um saque em andamento por vez, CPF fixo do titular e CPF unico entre contas', async () => {
  const u = await makeUser('1177770007', 90000);
  await saque(u, 20000);
  await assert.rejects(() => saque(u, 20000), (e) => e.code === 'WITHDRAW_PENDING');
  assert.equal(await balanceOf(u.id), 70000);

  const v = await makeUser('1177770008', 90000);
  await autoWithdraw(() => saque(v, 10000));
  await assert.rejects(() => saque(v, 10000, { cpf: CPF_OK }), (e) => e.code === 'CPF_MISMATCH');
  assert.equal(await balanceOf(v.id), 80000);

  // o CPF de v nao pode ser usado por outra conta (multi-conta para comissao)
  const w = await makeUser('1177770009', 90000);
  await assert.rejects(() => saque(w, 10000, { cpf: cpfValido(v.phone) }), (e) => e.code === 'CPF_IN_USE');
  assert.equal(await balanceOf(w.id), 90000);
});

test('rollover: deposito precisa ser apostado antes de sacar', async () => {
  const u = await makeUser('1177770010');
  await createDeposit(u.id, 20000); // mock confirma na hora
  assert.equal((await Users.getById(db, u.id)).wagerRequiredCents, 20000);
  await assert.rejects(() => saque(u, 10000), (e) => e.code === 'ROLLOVER_PENDING');
  await db.query('UPDATE users SET wager_required_cents = 0 WHERE id = $1', [u.id]); // (apostou)
  assert.equal((await saque(u, 10000)).withdrawal.status, 'review');
});

test('devolucao do PIX (MED): debita o que der, bloqueia a conta e e idempotente', async () => {
  const u = await makeUser('1177770011');
  const c = await createDeposit(u.id, 20000);
  const ref = (await Charges.get(db, c.id)).providerRef;
  await db.query('UPDATE users SET balance_cents = 5000 WHERE id = $1', [u.id]); // (gastou parte)
  const r = await refundDeposit({ providerRef: ref, amountCents: 20000 });
  assert.equal(r.debitado, 5000);
  assert.equal(r.faltou, 15000);
  assert.equal(await balanceOf(u.id), 0);
  assert.ok((await Users.getById(db, u.id)).blockedAt);
  assert.equal((await refundDeposit({ providerRef: ref, amountCents: 20000 })).duplicate, true);
  await assert.rejects(() => createDeposit(u.id, 5000), (e) => e.code === 'ACCOUNT_BLOCKED');
});

test('CPF validado por digito verificador', () => {
  assert.equal(isValidCpf(CPF_OK), true);
  assert.equal(isValidCpf('11111111111'), false);
  assert.equal(isValidCpf('52998224724'), false);
});

test('webhook: aceita assinatura correta e rejeita adulterada', () => {
  const body = Buffer.from(JSON.stringify({ type: 'charge.paid', providerRef: 'x', amountCents: 1 }));
  assert.ok(mock.parseWebhook(body, { 'x-signature': mock.sign(body) }));
  assert.equal(mock.parseWebhook(body, { 'x-signature': 'f'.repeat(64) }), null);
});
