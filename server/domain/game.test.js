// Testes do modo Combate: multiplicador por corte, vento vira, RTP, estados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, balanceOf } from '../db/testing.js';
import { db } from '../db/index.js';
import { Rounds } from '../db/repos.js';
import { CONFIG } from '../config.js';
import { windPoint } from './fairness.js';
import { start, cut, cashout, lose, lobby, publicName } from './game.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
CONFIG.game.minCutIntervalMs = 0; // testes cortam em sequencia

test('RTP teorico: sacar em m tem retorno P(vento > m) * m ~= RTP configurado', () => {
  const N = 50000;
  for (const m of [110, 150, 200, 500]) {
    let ok = 0;
    for (let i = 0; i < N; i++) if (windPoint('a'.repeat(64), 'rtp', i) > m) ok++;
    const rtp = (ok / N) * (m / 100);
    const alvo = CONFIG.game.rtpBps / 10000;
    assert.ok(Math.abs(rtp - alvo) < 0.03, `m=${m} rtp=${rtp} alvo=${alvo}`);
  }
});

test('corte soma ao multiplicador e cashout paga aposta x multiplicador', async () => {
  const u = await makeUser('1188880001', 100000);
  for (;;) {
    const { round } = await start(u.id, { betCents: 1000 });
    const r = await cut(u.id, round.id, { kind: 'moleque' });
    if (r.wind) continue; // vento virou no 1o corte (raro): tenta de novo
    assert.equal(r.round.multiplier, 1.1);
    const before = await balanceOf(u.id);
    const c = await cashout(u.id, round.id);
    assert.equal(c.prizeCents, 1100);
    assert.equal(await balanceOf(u.id), before + 1100);
    assert.ok(c.round.wind > 1.1); // vento revelado no fim
    return;
  }
});

test('vento vira quando o multiplicador alcanca o ponto sorteado', async () => {
  const u = await makeUser('1188880002', 100000);
  const { round } = await start(u.id, { betCents: 500 });
  const { ceilingX100 } = await Rounds.get(db, round.id);
  let r;
  do { r = await cut(u.id, round.id, { kind: 'chefe' }); } while (!r.wind);
  assert.equal(r.round.endReason, 'wind');
  assert.equal(r.round.wind, ceilingX100 / 100);
  await assert.rejects(() => cashout(u.id, round.id), (e) => e.status === 409);
});

test('tipo invalido, sem corte e round alheio sao recusados', async () => {
  const a = await makeUser('1188880003', 100000);
  const b = await makeUser('1188880004', 100000);
  const { round } = await start(a.id, { betCents: 500 });
  await assert.rejects(() => cut(a.id, round.id, { kind: 'hack' }), (e) => e.code === 'INVALID_KIND');
  await assert.rejects(() => cashout(a.id, round.id), (e) => e.code === 'NO_CUTS');
  await assert.rejects(() => cut(b.id, round.id, { kind: 'moleque' }), (e) => e.status === 404);
  await assert.rejects(() => start(a.id, { betCents: 500 }), (e) => e.code === 'ROUND_OPEN');
  const l = await lose(a.id, round.id, { reason: 'cut' });
  assert.equal(l.round.endReason, 'cut');
});

test('cortes rapidos demais sao recusados', async () => {
  CONFIG.game.minCutIntervalMs = 200;
  try {
    const u = await makeUser('1188880005', 100000);
    const { round } = await start(u.id, { betCents: 500 });
    const r = await cut(u.id, round.id, { kind: 'aparar' });
    if (!r.wind) await assert.rejects(() => cut(u.id, round.id, { kind: 'aparar' }), (e) => e.code === 'TOO_FAST');
    await wait(1);
  } finally { CONFIG.game.minCutIntervalMs = 0; }
});

test('cashout duplicado concorrente paga uma unica vez', async () => {
  const u = await makeUser('1188880006', 100000);
  let round;
  for (;;) {
    ({ round } = await start(u.id, { betCents: 1000 }));
    if (!(await cut(u.id, round.id, { kind: 'moleque' })).wind) break;
  }
  const before = await balanceOf(u.id);
  const res = await Promise.allSettled([cashout(u.id, round.id), cashout(u.id, round.id)]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await balanceOf(u.id), before + 1100);
});

test('ranking: so saques com lucro, maior lucro primeiro e nome abreviado', async () => {
  const u = await makeUser('1188880099', 100000);
  let lucro = 0;
  while (!lucro) {
    const { round } = await start(u.id, { betCents: 1000 });
    const r = await cut(u.id, round.id, { kind: 'chefe' });
    if (r.wind) continue;
    lucro = (await cashout(u.id, round.id)).prizeCents - 1000;
  }
  const { top } = await lobby();
  assert.ok(top.length >= 1);
  for (let i = 1; i < top.length; i++) {
    assert.ok(top[i - 1].prizeCents - top[i - 1].betCents >= top[i].prizeCents - top[i].betCents);
  }
  assert.ok(top.every((t) => t.prizeCents > t.betCents));
  assert.ok(top.some((t) => t.prizeCents - t.betCents === lucro));
  assert.equal(publicName('Ana Maria Souza'), 'Ana S.');
  assert.equal(publicName('Caio'), 'Caio');
  assert.equal(publicName('  '), 'Jogador');
});

test('modo teste (so desenvolvimento): vento nunca vira e fica fora do ranking; em producao e ignorado', async () => {
  const u = await makeUser('1188880077', 1000000);
  await db.query('UPDATE users SET test_always_win = true WHERE id = $1', [u.id]);
  const { round } = await start(u.id, { betCents: 1000 });
  for (let i = 0; i < 60; i++) assert.equal((await cut(u.id, round.id, { kind: 'chefe' })).wind, false); // passa do teto de 50x sem virar
  const c = await cashout(u.id, round.id);
  assert.equal(c.prizeCents, 1000 * CONFIG.game.maxMultX100 / 100);
  assert.equal((await Rounds.get(db, round.id)).teste, true);
  assert.ok(!(await lobby()).top.some((t) => t.prizeCents === c.prizeCents && t.name === 'Teste'));

  CONFIG.isProd = true; // em producao a flag nao vale
  try {
    const { round: r2 } = await start(u.id, { betCents: 1000 });
    assert.equal((await Rounds.get(db, r2.id)).teste, false);
    await lose(u.id, r2.id, { reason: 'cut' });
  } finally { CONFIG.isProd = false; }
});
