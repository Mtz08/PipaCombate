// Testes do painel (parametros editaveis) e do jogo responsavel.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Rounds } from '../db/repos.js';
import { makeUser } from '../db/testing.js';
import { CONFIG } from '../config.js';
import { createDeposit } from './payments.js';
import { start, lose, history } from './game.js';
import { windPoint } from './fairness.js';
import { setSetting } from './settings.js';
import { setDepositLimit, selfExclude, status } from './responsible.js';

CONFIG.game.minCutIntervalMs = 0;
after(async () => { await setSetting('jogo', null, null); await setSetting('limites', null, null); });

test('parametros do jogo pelo painel: a rodada guarda o RTP com que foi sorteada', async () => {
  await setSetting('jogo', { rtpBps: 9200, maxMultX100: 3000 }, null);
  const u = await makeUser('1155550001', 100000);
  const { round } = await start(u.id, { betCents: 1000 });
  const r = await Rounds.get(db, round.id);
  assert.equal(r.rtpBps, 9200);
  assert.equal(r.maxMultX100, 3000);
  await lose(u.id, round.id, { reason: 'cut' });

  await setSetting('jogo', { rtpBps: 9800 }, null); // mudar depois nao afeta a verificacao
  const h = (await history(u.id)).rounds[0];
  assert.equal(h.rtpBps, 9200);
  const seed = (await db.query('SELECT server_seed FROM fair_seeds WHERE id = $1', [r.seedId]))[0].server_seed;
  assert.equal(windPoint(seed, h.clientSeed, h.nonce, h.rtpBps, h.maxMultX100), r.ceilingX100);
});

test('limites de aposta e deposito vem do painel; configuracao invalida e recusada', async () => {
  await setSetting('jogo', { betMinCents: 2000, betMaxCents: 5000 }, null);
  const u = await makeUser('1155550002', 100000);
  await assert.rejects(() => start(u.id, { betCents: 1000 }), (e) => e.code === 'OUT_OF_RANGE');
  await setSetting('limites', { depositMinCents: 5000 }, null);
  await assert.rejects(() => createDeposit(u.id, 3000), (e) => e.code === 'OUT_OF_RANGE');
  await assert.rejects(() => setSetting('jogo', { rtpBps: 10000 }, null), (e) => e.code === 'INVALID_SETTING');
  await assert.rejects(() => setSetting('limites', { withdrawMinCents: 9000, withdrawMaxCents: 100 }, null), (e) => e.code === 'INVALID_SETTING');
  await setSetting('jogo', null, null); await setSetting('limites', null, null);
});

test('limite de deposito: reduzir vale na hora, aumentar so em 24h', async () => {
  const u = await makeUser('1155550003');
  assert.equal((await setDepositLimit(u.id, { cents: 10000, period: 'dia' })).aplicado, 'agora');
  await createDeposit(u.id, 6000);
  await assert.rejects(() => createDeposit(u.id, 5000), (e) => e.code === 'DEPOSIT_LIMIT');
  await createDeposit(u.id, 4000); // fecha exatamente no limite

  const r = await setDepositLimit(u.id, { cents: 50000, period: 'dia' });
  assert.equal(r.aplicado, 'em24h');
  await assert.rejects(() => createDeposit(u.id, 2500), (e) => e.code === 'DEPOSIT_LIMIT');
  const s = await status(u.id);
  assert.equal(s.limite.cents, 10000);
  assert.equal(s.limiteAgendado.cents, 50000);

  // passadas as 24h, o aumento vale
  await db.query("UPDATE users SET dep_limit_next_at = now() - interval '1 minute' WHERE id = $1", [u.id]);
  await createDeposit(u.id, 2500);
  assert.equal((await status(u.id)).limite.cents, 50000);
});

test('autoexclusao bloqueia aposta e deposito e nao pode ser encurtada', async () => {
  const u = await makeUser('1155550004', 100000);
  const p = await selfExclude(u.id, { dias: 7 });
  await assert.rejects(() => start(u.id, { betCents: 1000 }), (e) => e.code === 'SELF_EXCLUDED');
  await assert.rejects(() => createDeposit(u.id, 5000), (e) => e.code === 'SELF_EXCLUDED');
  const q = await selfExclude(u.id, { dias: 1 });
  assert.equal(q.pausadoAte, p.pausadoAte);
  await assert.rejects(() => selfExclude(u.id, { dias: 2 }), (e) => e.code === 'INVALID_PERIOD');
});
