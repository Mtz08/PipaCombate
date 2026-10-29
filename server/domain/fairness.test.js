// Testes do provably fair: determinismo, compromisso do hash, troca de seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Rounds } from '../db/repos.js';
import { makeUser } from '../db/testing.js';
import { windPoint, sha256, status, rotate, setClientSeed, verify } from './fairness.js';
import { start, lose, history } from './game.js';
import { CONFIG } from '../config.js';

const SEED = 'a'.repeat(64);

test('vento e deterministico, >= RTP (ex.: 0,25x) e <= teto de 50x', () => {
  assert.equal(windPoint(SEED, 'abc', 0), windPoint(SEED, 'abc', 0));
  for (let i = 0; i < 5000; i++) {
    const w = windPoint(SEED, 'abc', i);
    assert.ok(w >= CONFIG.game.rtpBps / 100 && w <= CONFIG.game.maxMultX100);
  }
});

test('verificador aceita RTP 0% e 100% (mesma faixa do painel)', () => {
  const v = verify({ serverSeed: SEED, clientSeed: 'abc', nonce: 0, rtpBps: 10000, maxMultX100: 5000 });
  assert.equal(v.windX100, windPoint(SEED, 'abc', 0, 10000, 5000));
  const zero = verify({ serverSeed: SEED, clientSeed: 'abc', nonce: 0, rtpBps: 0, maxMultX100: 5000 });
  assert.equal(zero.windX100, 0);
  assert.throws(() => verify({ serverSeed: SEED, clientSeed: 'abc', nonce: 0, rtpBps: -1 }), (e) => e.code === 'INVALID_RTP');
});

test('status nunca expoe a server seed ativa', async () => {
  const u = await makeUser('1155550001');
  const s = await status(u.id);
  assert.match(s.active.serverSeedHash, /^[0-9a-f]{64}$/);
  assert.equal(s.active.serverSeed, undefined);
});

test('vento dos rounds bate com o verificador apos revelar a seed', async () => {
  const u = await makeUser('1155550002', 100000);
  const before = await status(u.id);
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const { round } = await start(u.id, { betCents: 500 });
    ids.push(round.id);
    await lose(u.id, round.id);
  }
  const { revealed } = await rotate(u.id);
  assert.equal(sha256(revealed.serverSeed), before.active.serverSeedHash);
  for (const id of ids) {
    const r = await Rounds.get(db, id);
    assert.equal(verify({ serverSeed: revealed.serverSeed, clientSeed: revealed.clientSeed, nonce: r.nonce }).windX100, r.ceilingX100);
  }
  const h = await history(u.id);
  assert.ok(h.rounds.every((r) => r.serverSeed === revealed.serverSeed));
});

test('nao troca seed com round aberto; seed invalida recusada', async () => {
  const u = await makeUser('1155550003', 100000);
  const { round } = await start(u.id, { betCents: 500 });
  await assert.rejects(() => rotate(u.id), (e) => e.code === 'ROUND_OPEN');
  await lose(u.id, round.id);
  await assert.rejects(() => setClientSeed(u.id, '<x>'), (e) => e.code === 'INVALID_CLIENT_SEED');
  await setClientSeed(u.id, 'minha-seed');
  assert.equal((await status(u.id)).active.clientSeed, 'minha-seed');
});
