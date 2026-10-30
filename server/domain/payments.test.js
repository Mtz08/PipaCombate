// Testes do fluxo de pagamento: deposito via webhook idempotente, devolucao (MED),
// saque com aprovacao, estorno so em recusa definitiva, rollover e CPF unico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Charges, Withdrawals, Users } from '../db/repos.js';
import { makeUser, balanceOf, cpfValido } from '../db/testing.js';
import { CONFIG } from '../config.js';
import * as mock from '../payments/mock.js';
import {
  createDeposit, confirmDeposit, refundDeposit, requestWithdrawal, approveWithdrawal, rejectWithdrawal, reviewQueue, confirmTransfer,
} from './payments.js';
import { isValidCpf } from '../util/validate.js';

const CPF_OK = '52998224725'; // CPF de exemplo valido (digitos verificadores)
const ADMIN = { id: null };   // so o id do ator vai para a auditoria
const saque = (u, amountCents, extra = {}) => requestWithdrawal(u.id, { amountCents, pixKey: 'ana@exemplo.com', cpf: cpfValido(u.phone), ...extra });

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

test('saque fica na fila, debita e nao devolve o CPF ao jogador', async () => {
  const u = await makeUser('1177770003', 50000);
  const r = await requestWithdrawal(u.id, { amountCents: 20000, pixKey: 'fulano@exemplo.com', cpf: CPF_OK });
  assert.equal(r.withdrawal.status, 'review');
  assert.equal(r.balanceCents, 30000);
  assert.equal(JSON.stringify(r).includes(CPF_OK), false);
  assert.equal(r.withdrawal.pixKeyMask, 'fu***om');
});

test('webhook de transferencia antiga estorna uma vez so', async () => {
  const u = await makeUser('1177770004', 50000);
  const w = await Withdrawals.create(db, {
    userId: u.id, amountCents: 20000, pixKey: 'ana@exemplo.com', pixKeyMask: 'an***om', provider: 'manual', status: 'processing',
  });
  assert.equal((await confirmTransfer({ withdrawalId: w.id, status: 'failed' })).changed, true);
  assert.equal((await confirmTransfer({ withdrawalId: w.id, status: 'failed' })).changed, false);
  assert.equal(await balanceOf(u.id), 70000);
  assert.equal((await confirmTransfer({ withdrawalId: w.id, status: 'paid' })).changed, false);
});

test('saque acima do limite automatico espera aprovacao; aprovado vira pago', async () => {
  const u = await makeUser('1177770005', 50000);
  const r = await saque(u, 20000);
  assert.equal(r.withdrawal.status, 'review');
  assert.equal(await balanceOf(u.id), 30000); // ja debitado
  const row = await Withdrawals.get(db, r.withdrawal.id);
  assert.ok(row.cpfEnc && !row.cpfEnc.includes(cpfValido(u.phone))); // CPF so cifrado
  assert.ok((await reviewQueue()).some((w) => w.id === r.withdrawal.id));

  const fila = await reviewQueue();
  const item = fila.find((w) => w.id === r.withdrawal.id);
  assert.equal(item.pixKey, 'ana@exemplo.com');
  assert.equal(item.cpf, cpfValido(u.phone));
  assert.equal(item.userPhone, u.phone);

  const a = await approveWithdrawal(ADMIN, r.withdrawal.id);
  assert.equal(a.withdrawal.status, 'paid');
  const done = await Withdrawals.get(db, r.withdrawal.id);
  assert.ok(done.cpfEnc); // permanece para o registro do pagamento manual
  assert.equal(done.pixKey, 'ana@exemplo.com');
  await assert.rejects(() => approveWithdrawal(ADMIN, r.withdrawal.id), (e) => e.code === 'NOT_IN_REVIEW');
  await assert.rejects(() => approveWithdrawal({ id: u.id }, r.withdrawal.id), (e) => e.code === 'NOT_IN_REVIEW');
});

test('saque recusado pelo admin estorna (mesma transacao) e exige motivo', async () => {
  const u = await makeUser('1177770006', 50000);
  const r = await saque(u, 20000);
  await assert.rejects(() => rejectWithdrawal(ADMIN, r.withdrawal.id, { note: '' }), (e) => e.code === 'REASON_REQUIRED');
  const x = await rejectWithdrawal(ADMIN, r.withdrawal.id, { note: 'chave PIX de terceiro' });
  assert.equal(x.withdrawal.status, 'rejected');
  assert.equal(await balanceOf(u.id), 50000);
  assert.ok((await Withdrawals.get(db, r.withdrawal.id)).cpfEnc);
  await assert.rejects(() => rejectWithdrawal(ADMIN, r.withdrawal.id, { note: 'de novo agora' }), (e) => e.code === 'NOT_IN_REVIEW');
  assert.equal(await balanceOf(u.id), 50000); // nada de estorno em dobro
});

test('um saque em andamento por vez, CPF fixo do titular e CPF unico entre contas', async () => {
  const u = await makeUser('1177770007', 90000);
  await saque(u, 20000);
  await assert.rejects(() => saque(u, 20000), (e) => e.code === 'WITHDRAW_PENDING');
  assert.equal(await balanceOf(u.id), 70000);

  const v = await makeUser('1177770008', 90000);
  const primeiro = await saque(v, 10000);
  await approveWithdrawal(ADMIN, primeiro.withdrawal.id);
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

test('bonus de 1o deposito: desligado por padrao; ligado credita, soma rollover e so vale uma vez', async () => {
  const { setSetting } = await import('./settings.js');
  const semBonus = await makeUser('1177770012');
  await createDeposit(semBonus.id, 5000);
  assert.equal(await balanceOf(semBonus.id), 5000); // desligado: nada de bonus

  await setSetting('bonus', { ativo: true, pct: 100, maxCents: 10000, minDepositoCents: 1000, rolloverX: 10 }, null);
  try {
    const u = await makeUser('1177770013');
    await createDeposit(u.id, 5000);
    assert.equal(await balanceOf(u.id), 10000); // R$ 50 + R$ 50 de bonus
    // rollover = deposito (100%) + bonus x 10
    assert.equal((await Users.getById(db, u.id)).wagerRequiredCents, 5000 + 50000);
    await createDeposit(u.id, 5000);
    assert.equal(await balanceOf(u.id), 15000); // 2o deposito: sem bonus

    const teto = await makeUser('1177770014');
    await createDeposit(teto.id, 50000);
    assert.equal(await balanceOf(teto.id), 60000); // bonus limitado a R$ 100

    const pouco = await makeUser('1177770015');
    await createDeposit(pouco.id, 500 + 500); // R$ 10: no limite minimo do bonus
    assert.equal(await balanceOf(pouco.id), 2000);

    // devolucao (MED) leva o deposito e o bonus que ele gerou
    const med = await makeUser('1177770016');
    const c = await createDeposit(med.id, 5000);
    const r = await refundDeposit({ providerRef: (await Charges.get(db, c.id)).providerRef, amountCents: 5000 });
    assert.equal(r.debitado, 10000);
    assert.equal(await balanceOf(med.id), 0);
  } finally {
    await setSetting('bonus', null, null);
  }
});

test('zerou a banca: rollover antigo nao fica pendurado no proximo deposito', async () => {
  const u = await makeUser('1177770017');
  await createDeposit(u.id, 5000);
  await db.query('UPDATE users SET balance_cents = 50 WHERE id = $1', [u.id]); // (perdeu quase tudo)
  await createDeposit(u.id, 2000);
  assert.equal((await Users.getById(db, u.id)).wagerRequiredCents, 2000); // so o deposito novo
});

test('deposito com CPF vincula o titular e recusa outro documento', async () => {
  const u = await makeUser('1177770018');
  const cpf = cpfValido(u.phone);
  await createDeposit(u.id, 5000, { cpf });
  await assert.rejects(() => createDeposit(u.id, 5000, { cpf: CPF_OK }), (e) => e.code === 'CPF_MISMATCH');
});

test('sigilopay recusa deposito sem CPF', async () => {
  const antes = CONFIG.payments.provider;
  CONFIG.payments.provider = 'sigilopay';
  try {
    const u = await makeUser('1177770019');
    await assert.rejects(() => createDeposit(u.id, 5000), (e) => e.code === 'INVALID_CPF');
  } finally {
    CONFIG.payments.provider = antes;
  }
});
