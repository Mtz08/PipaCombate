// Operacao: numeros do negocio, consulta de jogadores, ajuste manual de saldo
// (sempre com motivo e auditado) e expiracao de rounds abandonados.

import { db, withUserLock, isUuid } from '../db/index.js';
import { Users, Ledger, Rounds } from '../db/repos.js';
import { domainError } from '../util/money.js';
import { CONFIG } from '../config.js';
import { applyCredit, applyDebit } from './wallet.js';
import { lose } from './game.js';
import { audit } from './audit.js';
import { log } from '../util/log.js';

const maskPhone = (p) => (p ? `${p.slice(0, 4)}*****${p.slice(-2)}` : '');

export async function stats() {
  const [money] = await db.query(`
    SELECT
      COALESCE(SUM(delta_cents) FILTER (WHERE type = 'deposit'), 0)            AS deposits,
      COALESCE(-SUM(delta_cents) FILTER (WHERE type = 'withdraw'), 0)          AS withdrawals,
      COALESCE(SUM(delta_cents) FILTER (WHERE type = 'withdraw_reversal'), 0)  AS reversals,
      COALESCE(-SUM(delta_cents) FILTER (WHERE type = 'bet'), 0)               AS bets,
      COALESCE(SUM(delta_cents) FILTER (WHERE type = 'prize'), 0)              AS prizes,
      COALESCE(SUM(delta_cents) FILTER (WHERE type = 'adjust'), 0)             AS adjustments
    FROM ledger`);
  const [u] = await db.query(`SELECT COUNT(*)::int AS users, COALESCE(SUM(balance_cents), 0) AS balances FROM users`);
  const [r] = await db.query(`
    SELECT COUNT(*) FILTER (WHERE state = 'open')::int AS open,
           COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last24h,
           COUNT(*) FILTER (WHERE end_reason = 'wind')::int AS wind,
           COUNT(*) FILTER (WHERE end_reason = 'cut')::int AS cut,
           COUNT(*) FILTER (WHERE end_reason = 'cashed')::int AS cashed
      FROM rounds`);
  const ggr = money.bets - money.prizes; // receita bruta de jogo da casa
  return {
    money: { ...money, ggr, rtpRealPct: money.bets ? Math.round((money.prizes / money.bets) * 10000) / 100 : null },
    users: u.users, balancesCents: u.balances, rounds: r,
  };
}

export async function searchUsers(term) {
  const q = String(term ?? '').trim().slice(0, 40);
  const rows = await db.query(
    `SELECT * FROM users WHERE ($1 = '' OR phone LIKE $2 OR name ILIKE $3) ORDER BY created_at DESC LIMIT 30`,
    [q, `%${q.replace(/\D/g, '') || '§'}%`, `%${q}%`],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, phone: maskPhone(r.phone), balanceCents: r.balance_cents, role: r.role, createdAt: r.created_at }));
}

export async function userDetail(id) {
  const user = isUuid(id) ? await Users.getById(db, id) : null;
  if (!user) throw domainError('NOT_FOUND', 'Usuario inexistente', 404);
  const auditRows = await db.query('SELECT action, meta, ip, created_at FROM audit_log WHERE user_id = $1 ORDER BY id DESC LIMIT 30', [id]);
  return {
    user: { id: user.id, name: user.name, phone: maskPhone(user.phone), balanceCents: user.balanceCents, role: user.role, createdAt: user.createdAt, utm: user.utm, ref: user.ref, blockedAt: user.blockedAt, blockedReason: user.blockedReason, wagerRequiredCents: user.wagerRequiredCents },
    ledger: await Ledger.recent(db, id, 50),
    rounds: await Rounds.history(db, id, 20),
    audit: auditRows,
  };
}

/**
 * Jogadores com cara de robo/script (ultimos 7 dias, 20+ rodadas): nunca perdem
 * para um rival (so saem sacando ou pelo vento) ou cortam num ritmo regular
 * demais para mao humana. E so um sinal para olhar: nada e bloqueado sozinho.
 */
export async function suspects() {
  const rows = await db.query(
    `SELECT u.id, u.name, u.phone, COUNT(*)::int AS rodadas,
            COUNT(*) FILTER (WHERE r.end_reason = 'cut')::int AS cortado,
            COUNT(*) FILTER (WHERE r.end_reason = 'cashed')::int AS sacou,
            COALESCE(SUM(r.prize_cents - r.bet_cents), 0)::bigint AS lucro,
            AVG(r.cuts)::float AS cortes_medios
       FROM rounds r JOIN users u ON u.id = r.user_id
      WHERE r.state <> 'open' AND r.created_at > now() - interval '7 days'
      GROUP BY u.id
     HAVING COUNT(*) >= 20 AND COUNT(*) FILTER (WHERE r.end_reason = 'cut') = 0
      ORDER BY lucro DESC LIMIT 50`,
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, phone: maskPhone(r.phone), rodadas: r.rodadas, sacou: r.sacou, lucroCents: Number(r.lucro),
    cortesMedios: Math.round(r.cortes_medios * 10) / 10,
    motivo: 'nunca foi cortado por um rival em 20+ rodadas',
  }));
}

/** Desbloqueia a conta (ex.: depois de resolver uma devolucao PIX). Exige motivo. */
export async function unblock(admin, userId, { reason }, ip) {
  const why = String(reason ?? '').trim();
  if (why.length < 5) throw domainError('REASON_REQUIRED', 'Informe o motivo (min. 5 caracteres)');
  if (userId === admin.id) throw domainError('SELF_ACTION', 'Admin nao desbloqueia a propria conta', 403);
  return withUserLock(userId, async (t, user) => {
    if (!user.blockedAt) return { blocked: false };
    await t.query('UPDATE users SET blocked_at = NULL, blocked_reason = NULL WHERE id = $1', [userId]);
    await audit(t, { userId, actorId: admin.id, action: 'admin_unblock', meta: { reason: why.slice(0, 200), era: user.blockedReason }, ip });
    return { blocked: false };
  });
}

/** Ajuste manual: exige motivo, fica no extrato (type 'adjust') e na auditoria. */
export async function adjustBalance(admin, userId, { deltaCents, reason }, ip) {
  const delta = Number(deltaCents), why = String(reason ?? '').trim();
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000_000) throw domainError('INVALID_AMOUNT', 'Valor invalido');
  if (why.length < 5) throw domainError('REASON_REQUIRED', 'Informe o motivo (min. 5 caracteres)');
  if (userId === admin.id) throw domainError('SELF_ACTION', 'Admin nao ajusta o proprio saldo: peca a outro admin', 403);
  return withUserLock(userId, async (t, user) => {
    const meta = { reason: why.slice(0, 200), by: admin.id };
    const balanceCents = delta > 0 ? await applyCredit(t, user, delta, 'adjust', meta) : await applyDebit(t, user, -delta, 'adjust', meta);
    await audit(t, { userId, actorId: admin.id, action: 'admin_adjust', meta: { deltaCents: delta, reason: meta.reason }, ip });
    return { balanceCents };
  });
}

export async function auditList({ action, limit = 100 } = {}) {
  return db.query(
    `SELECT a.id, a.action, a.meta, a.ip, a.created_at, a.user_id, a.actor_id FROM audit_log a
      WHERE ($1::text IS NULL OR a.action = $1) ORDER BY a.id DESC LIMIT $2`,
    [action || null, Math.min(Number(limit) || 100, 500)],
  );
}

/**
 * Rounds abandonados (aba fechada, internet caiu): passado o prazo, encerra.
 * Com cortes, recolhe automaticamente a favor do jogador; sem cortes, desistencia.
 */
export async function expireRounds() {
  const rows = await db.query(
    `SELECT id, user_id, cuts FROM rounds WHERE state = 'open' AND created_at < now() - ($1 || ' minutes')::interval LIMIT 200`,
    [String(CONFIG.game.roundTtlMin)],
  );
  for (const r of rows) {
    try {
      // sem premio: quem foi cortado e fechou a aba antes do aviso nao ganha por abandono.
      // Quem reconecta antes do prazo ainda saca normalmente (o jogo retoma o saque pendente).
      await lose(r.user_id, r.id, { reason: 'timeout' });
      await audit(null, { userId: r.user_id, action: 'round_expired', meta: { roundId: r.id, cuts: r.cuts } });
    } catch (err) { log('error', 'expire-round', { roundId: r.id, err: err.message }); }
  }
  return rows.length;
}
