// Logica do jogo: Combate de pipas (acao em tempo real) no modelo "vento vira".
//
// - Ao apostar, o servidor sorteia (provably fair, ver fairness.js) o ponto em
//   que o vento vira. Fica secreto ate o round terminar.
// - Cada pipa cortada e registrada AQUI, corte a corte, e soma ao multiplicador.
// - Se o multiplicador alcanca o ponto do vento, o vento vira: aposta perdida.
//   Quem recolheu antes leva aposta x multiplicador.
// - Se um rival corta a pipa do jogador, aposta perdida.
//
// GARANTIA: sacar em qualquer multiplicador tem retorno esperado <= RTP, seja
// qual for a habilidade. Cliente adulterado que "invente" cortes so faz o vento
// virar mais cedo. Os rivais tem a mesma forca em todo round.

import { db, withUserLock, isUuid, isUniqueViolation } from '../db/index.js';
import { Rounds, FairSeeds } from '../db/repos.js';
import { domainError } from '../util/money.js';
import { CONFIG } from '../config.js';
import { applyCredit, applyDebit } from './wallet.js';
import { activeSeed, windPoint } from './fairness.js';
import { onRoundClosed } from './affiliates.js';

const { rtpBps, maxMultX100, pctX100, maps: MAPS } = CONFIG.game;
export const KINDS = Object.keys(pctX100);

/** Premio em centavos, arredondado para baixo. */
export const prizeFor = (betCents, multX100) => Math.floor((betCents * multX100) / 100);

export async function lobby() {
  return {
    maps: MAPS,
    rtpPct: rtpBps / 100,
    maxMult: maxMultX100 / 100,
    forca: CONFIG.game.forca,
    pct: Object.fromEntries(KINDS.map((k) => [k, pctX100[k] / 100])),
    betMinCents: CONFIG.limits.betMinCents,
    betMaxCents: CONFIG.limits.betMaxCents,
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
  if (bet < CONFIG.limits.betMinCents || bet > CONFIG.limits.betMaxCents) {
    throw domainError('OUT_OF_RANGE', 'Aposta fora do limite');
  }
  const chosenMap = MAPS.includes(map) ? map : MAPS[0];
  try {
    return await withUserLock(userId, async (t, user) => {
      if (await Rounds.openByUser(t, userId)) throw roundOpenError();
      const seed = await activeSeed(t, userId);
      const nonce = await FairSeeds.takeNonce(t, seed.id);
      const ceilingX100 = windPoint(seed.serverSeed, seed.clientSeed, nonce);
      const round = await Rounds.create(t, { userId, betCents: bet, map: chosenMap, seedId: seed.id, nonce, ceilingX100 });
      const balanceAfter = await applyDebit(t, user, bet, 'bet', { roundId: round.id, map: chosenMap });
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
    if (minGap > 0 && round.lastCutAt && Date.now() - round.lastCutAt < minGap) {
      throw domainError('TOO_FAST', 'Corte muito rapido', 429);
    }
    const next = Math.min(round.multX100 + pctX100[kind], maxMultX100);
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

/** Fim sem premio: rival cortou a pipa ('cut') ou desistencia ('forfeit'). */
export async function lose(userId, roundId, { reason } = {}) {
  const endReason = reason === 'cut' ? 'cut' : 'forfeit';
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
