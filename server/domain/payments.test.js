// Testes do fluxo de pagamento (deposito via webhook idempotente, saque com estorno).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Charges, Withdrawals } from '../db/repos.js';
import { makeUser, balanceOf } from '../db/testing.js';
import { CONFIG } from '../config.js';
import * as mock from '../payments/mock.js';
import { providers } from '../payments/index.js';
import { createDeposit, confirmDeposit, requestWithdrawal, approveWithdrawal, rejectWithdrawal, reviewQueue } from './payments.js';
import { isValidCpf } from '../util/validate.js';

const CPF_OK = '52998224725'; // CPF de exemplo valido (digitos verificadores)

const CPF_OUTRO = '11144477735';
const ADMIN = { id: null }; // so o id do ator vai para a auditoria

/** Saque direto ao PSP (sem fila de aprovacao). */
async function autoWithdraw(fn) {
  const before = CONFIG.limits.withdrawAutoMaxCents;
  CONFIG.limits.withdrawAutoMaxCents = 10_000_000;
  try { await fn(); } finally { CONFIG.limits.withdrawAutoMaxCents = before; }
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
}));

test('valor pago diferente do cobrado vai para revisao, sem credito', () => withoutAutoConfirm(async () => {
  const u = await makeUser('1177770002');
  const c = await createDeposit(u.id, 5000);
  const r = await confirmDeposit({ providerRef: (await Charges.get(db, c.id)).providerRef, amountCents: 100 });
  assert.equal(r.review, true);
  assert.equal(await balanceOf(u.id), 0);
}));

test('saque: debita, nao devolve CPF e mascara a chave', () => autoWithdraw(async () => {
  const u = await makeUser('1177770003', 50000);
  const r = await requestWithdrawal(u.id, { amountCents: 20000, pixKey: 'fulano@exemplo.com', cpf: CPF_OK });
  assert.equal(r.withdrawal.status, 'paid');
  assert.equal(r.balanceCents, 30000);
  assert.equal(JSON.stringify(r).includes(CPF_OK), false);
  assert.equal(r.withdrawal.pixKeyMask, 'fu***om');
}));

test('saque recusado pelo PSP estorna o saldo', (t) => autoWithdraw(async () => {
  const u = await makeUser('1177770004', 50000);
  t.mock.method(providers.mock, 'sendPixTransfer', async () => { throw new Error('PSP fora'); });
  await assert.rejects(
    () => requestWithdrawal(u.id, { amountCents: 20000, pixKey: CPF_OK, cpf: CPF_OK }),
    (e) => e.code === 'WITHDRAW_FAILED' && e.balanceCents === 50000,
  );
  assert.equal(await balanceOf(u.id), 50000);
}));

test('saque acima do limite automatico espera aprovacao; aprovado vira pago', async () => {
  const u = await makeUser('1177770005', 50000);
  const r = await requestWithdrawal(u.id, { amountCents: 20000, pixKey: 'ana@exemplo.com', cpf: CPF_OK });
  assert.equal(r.withdrawal.status, 'review');
  assert.equal(await balanceOf(u.id), 30000); // ja debitado
  const row = await Withdrawals.get(db, r.withdrawal.id);
  assert.ok(row.cpfEnc && !row.cpfEnc.includes(CPF_OK)); // CPF so cifrado
  assert.ok((await reviewQueue()).some((w) => w.id === r.withdrawal.id));

  const a = await approveWithdrawal(ADMIN, r.withdrawal.id);
  assert.equal(a.withdrawal.status, 'paid');
  const done = await Withdrawals.get(db, r.withdrawal.id);
  assert.equal(done.cpfEnc, null); // apagado ao finalizar
  assert.equal(done.pixKey, null);
  await assert.rejects(() => approveWithdrawal(ADMIN, r.withdrawal.id), (e) => e.code === 'NOT_IN_REVIEW');
});

test('saque recusado pelo admin estorna e exige motivo', async () => {
  const u = await makeUser('1177770006', 50000);
  const r = await requestWithdrawal(u.id, { amountCents: 20000, pixKey: 'ana@exemplo.com', cpf: CPF_OK });
  await assert.rejects(() => rejectWithdrawal(ADMIN, r.withdrawal.id, { note: '' }), (e) => e.code === 'REASON_REQUIRED');
  const x = await rejectWithdrawal(ADMIN, r.withdrawal.id, { note: 'chave PIX de terceiro' });
  assert.equal(x.withdrawal.status, 'rejected');
  assert.equal(await balanceOf(u.id), 50000);
  assert.equal((await Withdrawals.get(db, r.withdrawal.id)).cpfEnc, null);
});

test('um saque em andamento por vez e CPF fixo do titular', async () => {
  const u = await makeUser('1177770007', 90000);
  await requestWithdrawal(u.id, { amountCents: 20000, pixKey: 'ana@exemplo.com', cpf: CPF_OK });
  await assert.rejects(
    () => requestWithdrawal(u.id, { amountCents: 20000, pixKey: 'ana@exemplo.com', cpf: CPF_OK }),
    (e) => e.code === 'WITHDRAW_PENDING',
  );
  assert.equal(await balanceOf(u.id), 70000);

  const v = await makeUser('1177770008', 90000);
  await autoWithdraw(() => requestWithdrawal(v.id, { amountCents: 10000, pixKey: 'bia@exemplo.com', cpf: CPF_OK }));
  await assert.rejects(
    () => requestWithdrawal(v.id, { amountCents: 10000, pixKey: 'bia@exemplo.com', cpf: CPF_OUTRO }),
    (e) => e.code === 'CPF_MISMATCH',
  );
  assert.equal(await balanceOf(v.id), 80000);
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
