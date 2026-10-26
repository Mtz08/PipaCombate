// Provably fair: o jogador consegue provar que o resultado nao foi manipulado.
//
// COMO FUNCIONA
//  1. O servidor gera server_seed (secreta) e publica sha256(server_seed).
//  2. O jogador define client_seed (ou usa a aleatoria gerada).
//  3. Cada round consome um nonce (0, 1, 2...). O ponto em que o vento vira:
//        h = HMAC_SHA256(chave = server_seed, msg = "client_seed:nonce")
//        u = 6 primeiros bytes de h / 2^48          (uniforme em [0, 1))
//        vento = floor(100 * RTP / (1 - u)) / 100, limitado ao teto (50x)
//     Assim P(vento > m) <= RTP / m: sacar em QUALQUER multiplicador m tem
//     retorno esperado <= RTP (96%), seja qual for a habilidade ou estrategia.
//  4. Ao trocar a seed (rotate), a server_seed antiga e revelada. O jogador
//     confere: sha256(seed revelada) == hash publicado, e recalcula os rounds.
//
// Como o hash foi publicado antes, o servidor nao pode trocar a seed depois
// de ver a client_seed ou as apostas. Como a client_seed e do jogador, o
// servidor nao consegue escolher uma server_seed "favoravel" de antemao.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { db, tx, withUserLock } from '../db/index.js';
import { FairSeeds, Rounds } from '../db/repos.js';
import { domainError } from '../util/money.js';
import { CONFIG } from '../config.js';

const CLIENT_SEED_RE = /^[\w-]{1,64}$/;

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const newServerSeed = () => randomBytes(32).toString('hex');
const newClientSeed = () => randomBytes(8).toString('hex');

/** Ponto em que o vento vira, em centesimos (ex.: 231 = 2,31x). Funcao pura e publica. */
export function windPoint(serverSeed, clientSeed, nonce) {
  const h = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest();
  const u = h.readUIntBE(0, 6) / 2 ** 48;
  const x100 = Math.floor((CONFIG.game.rtpBps / (1 - u)) / 100);
  return Math.min(x100, CONFIG.game.maxMultX100);
}

/** Par de seeds ativo do usuario, criando se nao existir. Dentro de transacao. */
export async function activeSeed(t, userId) {
  const current = await FairSeeds.active(t, userId, { forUpdate: true });
  if (current) return current;
  const serverSeed = newServerSeed();
  return FairSeeds.create(t, { userId, serverSeed, serverSeedHash: sha256(serverSeed), clientSeed: newClientSeed() });
}

/** Estado publico (nunca inclui a server_seed ativa). */
export async function status(userId) {
  const seed = await tx((t) => activeSeed(t, userId));
  const previous = await FairSeeds.lastRevealed(db, userId);
  return {
    active: { serverSeedHash: seed.serverSeedHash, clientSeed: seed.clientSeed, nextNonce: seed.nonce },
    previous: previous && {
      serverSeed: previous.serverSeed, serverSeedHash: previous.serverSeedHash,
      clientSeed: previous.clientSeed, roundsPlayed: previous.nonce,
    },
  };
}

/** Troca a client_seed. Nao permitido com round aberto (mudaria um resultado ja em jogo). */
export async function setClientSeed(userId, clientSeed) {
  const cs = String(clientSeed ?? '').trim();
  if (!CLIENT_SEED_RE.test(cs)) throw domainError('INVALID_CLIENT_SEED', 'Seed invalida: use 1 a 64 letras, numeros, _ ou -');
  return withUserLock(userId, async (t) => {
    await assertNoOpenRound(t, userId);
    // trocar a client seed tambem revela a server seed atual e inicia um par novo
    const revealed = await rotateIn(t, userId, cs);
    return { revealed };
  });
}

/** Revela a server_seed atual e cria um novo par (mantendo a client_seed). */
export async function rotate(userId) {
  return withUserLock(userId, async (t) => {
    await assertNoOpenRound(t, userId);
    return { revealed: await rotateIn(t, userId) };
  });
}

async function rotateIn(t, userId, clientSeed) {
  const old = await activeSeed(t, userId);
  await FairSeeds.reveal(t, old.id);
  const serverSeed = newServerSeed();
  await FairSeeds.create(t, {
    userId, serverSeed, serverSeedHash: sha256(serverSeed), clientSeed: clientSeed || old.clientSeed,
  });
  return { serverSeed: old.serverSeed, serverSeedHash: old.serverSeedHash, clientSeed: old.clientSeed, roundsPlayed: old.nonce };
}

async function assertNoOpenRound(t, userId) {
  if (await Rounds.openByUser(t, userId)) {
    throw domainError('ROUND_OPEN', 'Finalize o round em andamento antes de trocar a seed', 409);
  }
}

/** Verificador publico: recalcula um round a partir das seeds (nao consulta o banco). */
export function verify({ serverSeed, clientSeed, nonce }) {
  const ss = String(serverSeed ?? ''), cs = String(clientSeed ?? ''), n = Number(nonce);
  if (!/^[0-9a-f]{64}$/.test(ss)) throw domainError('INVALID_SEED', 'Server seed invalida (64 caracteres hex)');
  if (!CLIENT_SEED_RE.test(cs)) throw domainError('INVALID_CLIENT_SEED', 'Client seed invalida');
  if (!Number.isInteger(n) || n < 0) throw domainError('INVALID_NONCE', 'Nonce invalido');
  const windX100 = windPoint(ss, cs, n);
  return { serverSeedHash: sha256(ss), windX100, wind: windX100 / 100 };
}
