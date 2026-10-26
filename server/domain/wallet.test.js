// Testes do nucleo financeiro (node --test). Focam nos cenarios de falha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Ledger } from '../db/repos.js';
import { makeUser, balanceOf } from '../db/testing.js';
import { credit, debit } from './wallet.js';

test('credito e debito mantem saldo em centavos inteiros', async () => {
  const u = await makeUser('1199990001');
  await credit(u.id, 10000, 'deposit');
  assert.equal(await balanceOf(u.id), 10000);
  await debit(u.id, 2500, 'bet');
  assert.equal(await balanceOf(u.id), 7500);
});

test('debito acima do saldo e rejeitado e nao altera saldo', async () => {
  const u = await makeUser('1199990002');
  await credit(u.id, 1000, 'deposit');
  await assert.rejects(() => debit(u.id, 5000, 'bet'), /insuficiente/i);
  assert.equal(await balanceOf(u.id), 1000);
});

test('debitos concorrentes nao causam double-spend (trava por usuario)', async () => {
  const u = await makeUser('1199990003');
  await credit(u.id, 1000, 'deposit'); // saldo so para UM debito de 1000
  const results = await Promise.allSettled([
    debit(u.id, 1000, 'bet'),
    debit(u.id, 1000, 'bet'),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.equal(ok, 1); // exatamente um passou
  assert.equal(await balanceOf(u.id), 0);
});

test('valor nao-inteiro de centavos e rejeitado', async () => {
  const u = await makeUser('1199990004');
  await assert.rejects(() => credit(u.id, 10.5, 'deposit'), /invalido/i);
});

test('extrato nao perde linhas antigas e a soma bate com o saldo', async () => {
  const u = await makeUser('1199990005');
  for (let i = 0; i < 250; i++) await credit(u.id, 100, 'deposit');
  const all = await Ledger.recent(db, u.id, 1000);
  assert.equal(all.length, 250);
  assert.equal(all.reduce((s, l) => s + l.deltaCents, 0), await balanceOf(u.id));
});
