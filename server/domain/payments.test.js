// Testes do fluxo de pagamento (deposito via webhook idempotente, saque com estorno).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Charges } from '../db/repos.js';
import { makeUser, balanceOf } from '../db/testing.js';
import { CONFIG } from '../config.js';
import * as mock from '../payments/mock.js';
import { providers } from '../payments/index.js';
import { createDeposit, confirmDeposit, requestWithdrawal } from './payments.js';
import { isValidCpf } from '../util/validate.js';

const CPF_OK = '52998224725'; // CPF de exemplo valido (digitos verificadores)

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

test('saque: debita, nao devolve CPF e mascara a chave', async () => {
  const u = await makeUser('1177770003', 50000);
  const r = await requestWithdrawal(u.id, { amountCents: 20000, pixKey: 'fulano@exemplo.com', cpf: CPF_OK });
  assert.equal(r.withdrawal.status, 'paid');
  assert.equal(r.balanceCents, 30000);
  assert.equal(JSON.stringify(r).includes(CPF_OK), false);
  assert.equal(r.withdrawal.pixKeyMask, 'fu***om');
});

test('saque recusado pelo PSP estorna o saldo', async (t) => {
  const u = await makeUser('1177770004', 50000);
  t.mock.method(providers.mock, 'sendPixTransfer', async () => { throw new Error('PSP fora'); });
  await assert.rejects(
    () => requestWithdrawal(u.id, { amountCents: 20000, pixKey: CPF_OK, cpf: CPF_OK }),
    (e) => e.code === 'WITHDRAW_FAILED' && e.balanceCents === 50000,
  );
  assert.equal(await balanceOf(u.id), 50000);
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
