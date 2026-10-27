// Testes do indique e ganhe: comissao por deposito, CPA e revshare em 3 niveis,
// saque de comissao e validacao da configuracao.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { Users } from '../db/repos.js';
import { CONFIG } from '../config.js';
import { createDeposit, requestWithdrawal, rejectWithdrawal } from './payments.js';
import { start, cut, lose, cashout } from './game.js';
import { balanceOf, info } from './affiliates.js';
import { setSetting, SCHEMAS } from './settings.js';

CONFIG.game.minCutIntervalMs = 0;
const CPF_OK = '52998224725';
let seq = 0;
const user = (referredBy = null) => Users.create(db, {
  name: 'Afiliado Teste', phone: `1166${String(++seq).padStart(7, '0')}`, passwordHash: 'x', ref: null,
  referralCode: randomUUID().slice(0, 8), referredBy, termsVersion: 't',
});
/** A indica B, B indica C, C indica D. */
async function cadeia() {
  const a = await user(), b = await user(a.id), c = await user(b.id), d = await user(c.id);
  return { a, b, c, d };
}
const config = (v) => setSetting('afiliados', { ...SCHEMAS.afiliados.padrao, ...v }, null);
after(() => config({}));

test('modelo deposito: % de cada deposito em 3 niveis', async () => {
  await config({ modelo: 'deposito', niveisPct: [10, 5, 3] });
  const { a, b, c, d } = await cadeia();
  await createDeposit(d.id, 10000);
  await createDeposit(d.id, 10000);
  assert.equal(await balanceOf(db, c.id), 2000);
  assert.equal(await balanceOf(db, b.id), 1000);
  assert.equal(await balanceOf(db, a.id), 600);
  const i = await info(c);
  assert.equal(i.indicados.n1, 1);
  assert.equal(i.ganhoCents, 2000);
});

test('modelo CPA: paga uma vez, no 1o deposito acima do minimo', async () => {
  await config({ modelo: 'cpa', cpaCents: [1500, 500, 0], cpaDepositoMinCents: 3000 });
  const { b, c, d } = await cadeia();
  await createDeposit(d.id, 2500); // abaixo do minimo: nao conta e ja nao e o 1o
  await createDeposit(d.id, 5000);
  assert.equal(await balanceOf(db, c.id), 0);

  const e = await user(c.id);
  await createDeposit(e.id, 5000);
  await createDeposit(e.id, 5000);
  assert.equal(await balanceOf(db, c.id), 1500);
  assert.equal(await balanceOf(db, b.id), 500);
});

test('modelo revshare: % do resultado da casa, negativo quando o indicado ganha', async () => {
  await config({ modelo: 'revshare', niveisPct: [10, 0, 0] });
  const { c, d } = await cadeia();
  await createDeposit(d.id, 50000);
  const r1 = await start(d.id, { betCents: 1000 });
  await lose(d.id, r1.round.id, { reason: 'cut' });
  assert.equal(await balanceOf(db, c.id), 100);

  let esperado = 100;
  for (;;) { // uma rodada vencedora: aposta 1000, recolhe com +100% (premio 2000)
    const { round } = await start(d.id, { betCents: 1000 });
    const k = await cut(d.id, round.id, { kind: 'chefe' });
    if (k.wind) { esperado += 100; continue; } // vento virou: casa ganhou 1000
    await cashout(d.id, round.id);
    esperado -= 100; // casa perdeu 1000
    break;
  }
  assert.equal(await balanceOf(db, c.id), esperado);
  assert.equal((await info(c)).saldoCents, Math.max(0, esperado));
});

test('saque de comissao: debita o saldo de comissao, recusa estorna, sem saldo nao saca', async () => {
  await config({ modelo: 'deposito', niveisPct: [50, 0, 0], saqueMinCents: 3000 });
  const { c, d } = await cadeia();
  await createDeposit(d.id, 20000); // c ganha 10000
  await assert.rejects(() => requestWithdrawal(c.id, { amountCents: 2000, pixKey: 'c@exemplo.com', cpf: CPF_OK, source: 'affiliate' }), (e) => e.code === 'OUT_OF_RANGE');
  await assert.rejects(() => requestWithdrawal(c.id, { amountCents: 20000, pixKey: 'c@exemplo.com', cpf: CPF_OK, source: 'affiliate' }), (e) => e.code === 'INSUFFICIENT_FUNDS');

  const r = await requestWithdrawal(c.id, { amountCents: 6000, pixKey: 'c@exemplo.com', cpf: CPF_OK, source: 'affiliate' });
  assert.equal(r.withdrawal.status, 'review');
  assert.equal(r.withdrawal.source, 'affiliate');
  assert.equal(await balanceOf(db, c.id), 4000);
  assert.equal((await Users.getById(db, c.id)).balanceCents, 0); // saldo de jogo intocado

  await rejectWithdrawal({ id: null }, r.withdrawal.id, { note: 'conferencia de cadastro' });
  assert.equal(await balanceOf(db, c.id), 10000);
});

test('configuracao invalida e recusada', async () => {
  await assert.rejects(() => config({ modelo: 'pirâmide' }), (e) => e.code === 'INVALID_SETTING');
  await assert.rejects(() => config({ niveisPct: [40, 20, 10] }), (e) => e.code === 'INVALID_SETTING');
  await assert.rejects(() => config({ saqueMinCents: 5000, saqueMaxCents: 1000 }), (e) => e.code === 'INVALID_SETTING');
});
