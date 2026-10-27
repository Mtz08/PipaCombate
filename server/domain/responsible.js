// Jogo responsavel: limite de deposito definido pelo jogador e autoexclusao.
//
// LIMITE: reduzir (ou criar) vale na hora; aumentar ou remover so vale depois
// de 24h, para nao ser decisao de impulso. Janela movel: ultimas 24h, 7 ou 30 dias.
// AUTOEXCLUSAO: o jogador escolhe um periodo e fica sem apostar e sem depositar
// ate o fim dele. Nao da para desfazer antes. O saque continua liberado.

import { withUserLock } from '../db/index.js';
import { domainError } from '../util/money.js';

const PERIODOS = { dia: 1, semana: 7, mes: 30 };
const EXCLUSAO_DIAS = [1, 7, 30, 180, 365];
const ESPERA_MS = 24 * 3600 * 1000;

const until = (u) => (u.selfExcludedUntil && u.selfExcludedUntil > Date.now() ? u.selfExcludedUntil : null);

/** Conta bloqueada pela operacao (ex.: devolucao PIX): nada de apostar, depositar ou sacar. */
export function assertNotBlocked(user) {
  if (user.blockedAt) throw domainError('ACCOUNT_BLOCKED', 'Conta em analise. Fale com o suporte.', 403);
}

/** Bloqueia aposta de quem esta autoexcluido ou bloqueado. */
export function assertCanPlay(user) {
  assertNotBlocked(user);
  const ate = until(user);
  if (ate) throw domainError('SELF_EXCLUDED', `Voce pausou o jogo ate ${new Date(ate).toLocaleDateString('pt-BR')}.`, 403);
}

/** Limite vigente (aplica a mudanca agendada se ja passaram as 24h). Dentro de transacao. */
async function currentLimit(t, user) {
  if (user.depLimitNextSet && user.depLimitNextAt && user.depLimitNextAt <= Date.now()) {
    await t.query(
      `UPDATE users SET dep_limit_cents = dep_limit_next_cents, dep_limit_period = dep_limit_next_period,
              dep_limit_next_cents = NULL, dep_limit_next_period = NULL, dep_limit_next_at = NULL, dep_limit_next_set = false
        WHERE id = $1`, [user.id],
    );
    user.depLimitCents = user.depLimitNextCents; user.depLimitPeriod = user.depLimitNextPeriod;
    user.depLimitNextSet = false; user.depLimitNextAt = null;
  }
  return user.depLimitCents ? { cents: user.depLimitCents, period: user.depLimitPeriod } : null;
}

/** Soma do que ja foi depositado (ou esta aguardando pagamento) na janela do limite. */
async function usedInWindow(t, userId, period) {
  const r = (await t.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS s FROM charges
      WHERE user_id = $1 AND created_at > now() - make_interval(days => $2)
        AND (status = 'paid' OR (status = 'pending' AND expires_at > now()))`,
    [userId, PERIODOS[period]],
  ))[0];
  return Number(r.s);
}

/** Antes de criar cobranca: autoexclusao e limite de deposito. Exige o usuario travado. */
export async function assertCanDeposit(t, user, amountCents) {
  const ate = until(user);
  if (ate) throw domainError('SELF_EXCLUDED', `Voce pausou o jogo ate ${new Date(ate).toLocaleDateString('pt-BR')}. Depositos ficam bloqueados ate la.`, 403);
  const lim = await currentLimit(t, user);
  if (!lim) return;
  const usado = await usedInWindow(t, user.id, lim.period);
  if (usado + amountCents > lim.cents) {
    const resta = Math.max(0, lim.cents - usado);
    throw domainError('DEPOSIT_LIMIT', `Seu limite de deposito (${lim.period}) permite mais R$ ${(resta / 100).toFixed(2).replace('.', ',')}.`, 403);
  }
}

export async function status(userId) {
  return withUserLock(userId, async (t, user) => {
    const lim = await currentLimit(t, user);
    return {
      limite: lim && { ...lim, usadoCents: await usedInWindow(t, userId, lim.period) },
      limiteAgendado: user.depLimitNextSet ? { cents: user.depLimitNextCents, period: user.depLimitNextPeriod, valeEm: user.depLimitNextAt } : null,
      pausadoAte: until(user),
      opcoesPausaDias: EXCLUSAO_DIAS,
    };
  });
}

/** cents = null remove o limite. Reduzir vale na hora; aumentar/remover em 24h. */
export async function setDepositLimit(userId, { cents, period }) {
  const valor = cents == null ? null : Number(cents);
  if (valor !== null && (!Number.isInteger(valor) || valor < 100 || valor > 100000000)) throw domainError('INVALID_AMOUNT', 'Limite invalido');
  if (valor !== null && !PERIODOS[period]) throw domainError('INVALID_PERIOD', 'Periodo invalido: dia, semana ou mes');
  return withUserLock(userId, async (t, user) => {
    const atual = await currentLimit(t, user);
    // mais restritivo = vale ja: criar limite, ou valor menor/igual com janela igual ou maior
    const maisRestrito = valor !== null && (!atual || (valor <= atual.cents && PERIODOS[period] >= PERIODOS[atual.period]));
    if (maisRestrito) {
      await t.query(
        `UPDATE users SET dep_limit_cents = $2, dep_limit_period = $3, dep_limit_next_cents = NULL,
                dep_limit_next_period = NULL, dep_limit_next_at = NULL, dep_limit_next_set = false WHERE id = $1`,
        [userId, valor, period],
      );
      return { aplicado: 'agora' };
    }
    const valeEm = Date.now() + ESPERA_MS;
    await t.query(
      `UPDATE users SET dep_limit_next_cents = $2, dep_limit_next_period = $3, dep_limit_next_at = $4, dep_limit_next_set = true WHERE id = $1`,
      [userId, valor, valor === null ? null : period, new Date(valeEm)],
    );
    return { aplicado: 'em24h', valeEm };
  });
}

/** Pausa (autoexclusao) por N dias. So aumenta, nunca encurta. */
export async function selfExclude(userId, { dias }) {
  const d = Number(dias);
  if (!EXCLUSAO_DIAS.includes(d)) throw domainError('INVALID_PERIOD', `Escolha ${EXCLUSAO_DIAS.join(', ')} dias`);
  return withUserLock(userId, async (t, user) => {
    const novo = Date.now() + d * 24 * 3600 * 1000;
    const fim = Math.max(novo, until(user) || 0);
    await t.query('UPDATE users SET self_excluded_until = $2 WHERE id = $1', [userId, new Date(fim)]);
    return { pausadoAte: fim };
  });
}
