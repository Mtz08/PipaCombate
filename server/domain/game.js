// Logica do jogo: Combate de pipas (acao em tempo real) no modelo "vento vira".
//
// - Ao apostar, o servidor sorteia (provably fair, ver fairness.js) o ponto em
//   que o vento vira. Fica secreto ate o round terminar.
// - Cada pipa cortada e registrada AQUI, corte a corte, e soma ao multiplicador.
// - Se o multiplicador alcanca o ponto do vento, o vento vira: aposta perdida.
//   Quem recolheu antes leva aposta x multiplicador.
// - Se um rival corta a pipa do jogador, aposta perdida.
//
// GARANTIA: sacar em qualquer multiplicador m tem retorno esperado <= RTP.
// Com RTP 35%, a casa ganha pelo menos ~65% das rodadas em saque >= 1,00x.
// Cliente adulterado que "invente" cortes so faz o vento virar mais cedo.
// Os rivais tem a mesma forca em todo round.

import { db, withUserLock, isUuid, isUniqueViolation } from '../db/index.js';
import { Rounds, FairSeeds } from '../db/repos.js';
import { domainError } from '../util/money.js';
import { CONFIG } from '../config.js';
import { applyCredit, applyDebit } from './wallet.js';
import { activeSeed, windPoint } from './fairness.js';
import { onRoundClosed } from './affiliates.js';
import { getSetting } from './settings.js';
import { assertCanPlay } from './responsible.js';

// RTP, teto, % por rival, forca e limites de aposta vem do painel (settings 'jogo').
const MAPS = CONFIG.game.maps;
export const KINDS = Object.keys(CONFIG.game.pctX100);

/** Premio em centavos, arredondado para baixo. */
export const prizeFor = (betCents, multX100) => Math.floor((betCents * multX100) / 100);

/** Modo teste: SO fora de producao. Em producao a flag e ignorada (sorteio sempre valendo). */
export const isTestMode = (user) => !CONFIG.isProd && !!user?.testAlwaysWin;

export async function lobby(user = null) {
  const g = await getSetting('jogo');
  const teste = isTestMode(user);
  return {
    modoTeste: teste, // o front mostra a faixa "MODO TESTE"
    maps: MAPS,
    rtpPct: g.rtpBps / 100,
    maxMult: g.maxMultX100 / 100,
    forca: teste ? 0.5 : g.forca, // modo teste: rivais fracos
    pct: Object.fromEntries(KINDS.map((k) => [k, g.pctX100[k] / 100])),
    betMinCents: g.betMinCents,
    betMaxCents: g.betMaxCents,
    top: (await Rounds.topWins(db, { days: 7, limit: 10 })).map((r) => ({ ...r, name: publicName(r.name) })),
  };
}

/** Nome no ranking publico: primeiro nome + inicial do sobrenome ("Ana S."). */
export function publicName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Jogador';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export async function active(userId) {
  const round = await Rounds.openByUser(db, userId);
  return { round: round ? viewRound(round) : null };
}

/** Abre um round: debita, consome o nonce e sorteia o vento, na mesma transacao. */
export async function start(userId, { betCents, map }) {
  const bet = Number(betCents);
  if (!Number.isInteger(bet)) throw domainError('INVALID_AMOUNT', 'Aposta invalida');
  const chosenMap = MAPS.includes(map) ? map : MAPS[0];
  try {
    return await withUserLock(userId, async (t, user) => {
      assertCanPlay(user);
      const g = await getSetting('jogo', t);
      if (bet < g.betMinCents || bet > g.betMaxCents) throw domainError('OUT_OF_RANGE', 'Aposta fora do limite');
      if (await Rounds.openByUser(t, userId)) throw roundOpenError();
      const seed = await activeSeed(t, userId);
      const nonce = await FairSeeds.takeNonce(t, seed.id);
      // modo teste (so desenvolvimento): teto acima do ganho maximo = o vento nunca vira
      const teste = isTestMode(user);
      const ceilingX100 = teste ? g.maxMultX100 + 1 : windPoint(seed.serverSeed, seed.clientSeed, nonce, g.rtpBps, g.maxMultX100);
      const round = await Rounds.create(t, {
        userId, betCents: bet, map: chosenMap, seedId: seed.id, nonce, ceilingX100, rtpBps: g.rtpBps, maxMultX100: g.maxMultX100, teste,
      });
      const balanceAfter = await applyDebit(t, user, bet, 'bet', { roundId: round.id, map: chosenMap });
      // cada aposta desconta do rollover pendente do deposito
      if (user.wagerRequiredCents > 0) await t.query('UPDATE users SET wager_required_cents = GREATEST(0, wager_required_cents - $2) WHERE id = $1', [userId, bet]);
      return { round: viewRound(round), balanceCents: balanceAfter };
    });
  } catch (err) {
    if (isUniqueViolation(err, 'rounds_one_open_per_user')) throw roundOpenError();
    throw err;
  }
}

/** Registra uma pipa cortada/aparada. Sobe o multiplicador ou o vento vira. */
export async function cut(userId, roundId, { kind } = {}) {
  if (!KINDS.includes(kind)) throw domainError('INVALID_KIND', 'Tipo de corte invalido');
  return withUserLock(userId, async (t, user) => {
    const round = await requireOpenRound(t, userId, roundId);
    // le CONFIG na hora (ajustavel em teste); relogio do banco pode estar ~1ms a frente
    const minGap = CONFIG.game.minCutIntervalMs;
    const cedo = minGap > 0 && round.lastCutAt
      && (await t.query("SELECT now() - last_cut_at < $2 * interval '1 millisecond' AS cedo FROM rounds WHERE id = $1", [round.id, minGap]))[0].cedo;
    if (cedo) {
      throw domainError('TOO_FAST', 'Corte muito rapido', 429);
    }
    const g = await getSetting('jogo', t);
    const next = Math.min(round.multX100 + g.pctX100[kind], round.maxMultX100);
    if (next >= round.ceilingX100) {
      await Rounds.recordCut(t, round.id, kind, next);
      const closed = await Rounds.close(t, round.id, 'lost', 0, 'wind');
      await onRoundClosed(t, user, { roundId: round.id, betCents: round.betCents, prizeCents: 0 });
      return { round: viewRound(closed), wind: true };
    }
    return { round: viewRound(await Rounds.recordCut(t, round.id, kind, next)), wind: false };
  });
}

export async function cashout(userId, roundId) {
  return withUserLock(userId, async (t, user) => {
    const round = await requireOpenRound(t, userId, roundId);
    if (round.cuts < 1) throw domainError('NO_CUTS', 'Corte ao menos uma pipa antes de recolher');
    const prizeCents = prizeFor(round.betCents, round.multX100);
    const closed = await Rounds.close(t, round.id, 'cashed', prizeCents, 'cashed');
    const balanceAfter = await applyCredit(t, user, prizeCents, 'prize', {
      roundId: round.id, multiplier: round.multX100 / 100,
    });
    await onRoundClosed(t, user, { roundId: round.id, betCents: round.betCents, prizeCents });
    return { round: viewRound(closed), prizeCents, balanceCents: balanceAfter };
  });
}

/** Fim sem premio: rival cortou a pipa ('cut'), desistencia ('forfeit') ou abandono ('timeout'). */
export async function lose(userId, roundId, { reason } = {}) {
  const endReason = ['cut', 'timeout'].includes(reason) ? reason : 'forfeit';
  return withUserLock(userId, async (t, user) => {
    const round = await requireRound(t, userId, roundId);
    if (round.state !== 'open') return { round: viewRound(round) };
    const closed = await Rounds.close(t, round.id, 'lost', 0, endReason);
    await onRoundClosed(t, user, { roundId: round.id, betCents: round.betCents, prizeCents: 0 });
    return { round: viewRound(closed) };
  });
}

export async function history(userId) {
  const rows = await Rounds.history(db, userId, 20);
  return {
    rounds: rows.map((r) => ({
      ...viewRound(r), nonce: r.nonce, clientSeed: r.clientSeed,
      serverSeedHash: r.serverSeedHash, serverSeed: r.serverSeed, createdAt: r.createdAt,
      rtpBps: r.rtpBps, maxMultX100: r.maxMultX100, // parametros do sorteio desta rodada
      teste: r.teste, // rodada do modo teste: sem sorteio para verificar
    })),
  };
}

const roundOpenError = () => domainError('ROUND_OPEN', 'Finalize o round em andamento', 409);

async function requireRound(t, userId, roundId) {
  const round = isUuid(roundId) ? await Rounds.get(t, roundId) : null;
  if (!round || round.userId !== userId) throw domainError('NOT_FOUND', 'Round inexistente', 404);
  return round;
}

async function requireOpenRound(t, userId, roundId) {
  const round = await requireRound(t, userId, roundId);
  if (round.state !== 'open') throw domainError('ROUND_CLOSED', 'Round ja encerrado', 409);
  return round;
}

function viewRound(r) {
  const open = r.state === 'open';
  return {
    id: r.id, map: r.map, state: r.state, cuts: r.cuts, counts: r.counts, betCents: r.betCents,
    multiplier: r.multX100 / 100,
    cashoutCents: open && r.cuts > 0 ? prizeFor(r.betCents, r.multX100) : null,
    prizeCents: open ? null : r.prizeCents,
    endReason: r.endReason ?? null,
    wind: open ? null : r.ceilingX100 / 100, // revelado so apos o fim
  };
}
