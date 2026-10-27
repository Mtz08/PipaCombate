// Indique e ganhe: comissao em ate 3 niveis, no modelo escolhido no admin.
//
//  - cpa:      valor fixo por nivel, uma vez, quando o indicado tem um deposito
//              >= minimo do CPA E ja APOSTOU esse minimo (conta de fachada que
//              so deposita e saca nao gera CPA).
//  - deposito: % de cada deposito do indicado, devolvido (proporcional) quando
//              ele SACA: so fica comissao sobre o que ele realmente deixou na casa.
//  - revshare: % do resultado da casa nas rodadas do indicado (aposta - premio).
//              Pode ser negativo quando o indicado ganha: o saldo do afiliado
//              e a soma de tudo, e so da para sacar o que estiver positivo.
//
// O extrato do afiliado (affiliate_ledger) so recebe INSERTs: os hooks rodam
// dentro da transacao do deposito/rodada do indicado sem travar a linha do
// afiliado (nada de deadlock entre jogadores).

import { db } from '../db/index.js';
import { getSetting } from './settings.js';
import { domainError } from '../util/money.js';

const NIVEIS = 3;

/** Quem indicou, quem indicou quem indicou... ate 3 niveis acima. */
async function upline(t, referredBy) {
  const out = [];
  let id = referredBy;
  while (id && out.length < NIVEIS) {
    if (out.includes(id)) break; // protecao contra ciclo
    out.push(id);
    id = (await t.query('SELECT referred_by FROM users WHERE id = $1', [id]))[0]?.referred_by ?? null;
  }
  return out;
}

async function add(t, { affiliateId, referralId = null, level = null, type, deltaCents, meta = {} }) {
  if (!deltaCents) return;
  await t.query(
    `INSERT INTO affiliate_ledger (affiliate_id, referral_id, level, type, delta_cents, meta)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (affiliate_id, referral_id) WHERE type = 'cpa' DO NOTHING`,
    [affiliateId, referralId, level, type, deltaCents, JSON.stringify(meta)],
  );
}

/** Hook: deposito confirmado do indicado (dentro da transacao do deposito). */
export async function onDeposit(t, user, { amountCents, chargeId, first }) {
  if (!user.referredBy) return;
  const cfg = await getSetting('afiliados', t);
  if (!cfg.ativo || cfg.modelo === 'revshare') return;
  const ups = await upline(t, user.referredBy);
  for (let i = 0; i < ups.length; i++) {
    if (cfg.modelo === 'deposito') {
      const v = Math.floor((amountCents * cfg.niveisPct[i]) / 100);
      await add(t, { affiliateId: ups[i], referralId: user.id, level: i + 1, type: 'deposit', deltaCents: v, meta: { chargeId, pct: cfg.niveisPct[i] } });
    }
  }
}

/** CPA: paga uma vez, quando o indicado depositou o minimo e ja apostou esse minimo. */
async function maybePayCpa(t, user, cfg) {
  if ((await t.query("SELECT 1 FROM affiliate_ledger WHERE type = 'cpa' AND referral_id = $1 LIMIT 1", [user.id])).length) return;
  const min = cfg.cpaDepositoMinCents;
  const [q] = await t.query(
    `SELECT EXISTS (SELECT 1 FROM charges WHERE user_id = $1 AND status = 'paid' AND amount_cents >= $2) AS dep,
            (SELECT COALESCE(SUM(bet_cents), 0) FROM rounds WHERE user_id = $1 AND state <> 'open') AS apostado`,
    [user.id, min],
  );
  if (!q.dep || Number(q.apostado) < min) return;
  const ups = await upline(t, user.referredBy);
  for (let i = 0; i < ups.length; i++) {
    await add(t, { affiliateId: ups[i], referralId: user.id, level: i + 1, type: 'cpa', deltaCents: cfg.cpaCents[i], meta: { apostado: Number(q.apostado) } });
  }
}

/** Hook: saque do indicado (saldo de jogo). Modelo deposito: devolve a comissao do valor sacado. */
export async function onWithdrawal(t, user, { amountCents, withdrawalId }) {
  if (!user.referredBy) return;
  const cfg = await getSetting('afiliados', t);
  if (!cfg.ativo || cfg.modelo !== 'deposito') return;
  const ups = await upline(t, user.referredBy);
  for (let i = 0; i < ups.length; i++) {
    const v = -Math.floor((amountCents * cfg.niveisPct[i]) / 100);
    await add(t, { affiliateId: ups[i], referralId: user.id, level: i + 1, type: 'deposit', deltaCents: v, meta: { clawbackOf: withdrawalId, pct: cfg.niveisPct[i] } });
  }
}

/** Saque que nao saiu (recusado/falhou): desfaz a devolucao de comissao feita no pedido. */
export async function onWithdrawalRefund(t, withdrawalId) {
  const rows = await t.query(
    "SELECT affiliate_id, referral_id, level, delta_cents FROM affiliate_ledger WHERE type = 'deposit' AND meta->>'clawbackOf' = $1", [withdrawalId],
  );
  for (const r of rows) {
    await add(t, { affiliateId: r.affiliate_id, referralId: r.referral_id, level: r.level, type: 'adjust', deltaCents: -Number(r.delta_cents), meta: { undoClawbackOf: withdrawalId } });
  }
}

/** Devolucao (MED) do deposito: estorna toda comissao que ele gerou. */
export async function reverseCharge(t, chargeId) {
  const rows = await t.query(
    "SELECT affiliate_id, referral_id, level, SUM(delta_cents) AS s FROM affiliate_ledger WHERE meta->>'chargeId' = $1 GROUP BY 1, 2, 3", [chargeId],
  );
  for (const r of rows) {
    if (Number(r.s) !== 0) await add(t, { affiliateId: r.affiliate_id, referralId: r.referral_id, level: r.level, type: 'chargeback', deltaCents: -Number(r.s), meta: { chargebackOf: chargeId } });
  }
}

/** Hook: rodada encerrada do indicado (dentro da transacao da rodada). */
export async function onRoundClosed(t, user, { roundId, betCents, prizeCents }) {
  if (!user.referredBy || user.testAlwaysWin) return; // rodada de teste nao gera comissao
  const cfg = await getSetting('afiliados', t);
  if (cfg.ativo && cfg.modelo === 'cpa') return maybePayCpa(t, user, cfg);
  if (!cfg.ativo || cfg.modelo !== 'revshare') return;
  const ggr = betCents - prizeCents;
  const ups = await upline(t, user.referredBy);
  for (let i = 0; i < ups.length; i++) {
    const v = Math.trunc((ggr * cfg.niveisPct[i]) / 100);
    await add(t, { affiliateId: ups[i], referralId: user.id, level: i + 1, type: 'revshare', deltaCents: v, meta: { roundId } });
  }
}

/** Saldo de comissao (soma do extrato). Passe `t` com o afiliado travado ao debitar. */
export async function balanceOf(q, affiliateId) {
  const r = (await q.query('SELECT COALESCE(SUM(delta_cents), 0) AS s FROM affiliate_ledger WHERE affiliate_id = $1', [affiliateId]))[0];
  return Number(r.s);
}

/** Debita o saque de comissao. Exige o afiliado travado (withUserLock). */
export async function debitForWithdraw(t, affiliateId, amountCents, meta) {
  const cfg = await getSetting('afiliados', t);
  if (amountCents < cfg.saqueMinCents || amountCents > cfg.saqueMaxCents) {
    throw domainError('OUT_OF_RANGE', 'Saque de comissao fora do limite');
  }
  const bal = await balanceOf(t, affiliateId);
  if (amountCents > bal) throw domainError('INSUFFICIENT_FUNDS', 'Saldo de comissao insuficiente');
  await add(t, { affiliateId, type: 'withdraw', deltaCents: -amountCents, meta });
  return bal - amountCents;
}

export async function refundWithdraw(t, affiliateId, amountCents, meta) {
  await add(t, { affiliateId, type: 'withdraw_reversal', deltaCents: amountCents, meta });
  return balanceOf(t, affiliateId);
}

/** Painel "Indique e ganhe" do jogador. */
export async function info(user) {
  const cfg = await getSetting('afiliados');
  const [counts] = await db.query(
    `WITH n1 AS (SELECT id FROM users WHERE referred_by = $1),
          n2 AS (SELECT id FROM users WHERE referred_by IN (SELECT id FROM n1)),
          n3 AS (SELECT id FROM users WHERE referred_by IN (SELECT id FROM n2))
     SELECT (SELECT COUNT(*) FROM n1)::int AS n1, (SELECT COUNT(*) FROM n2)::int AS n2, (SELECT COUNT(*) FROM n3)::int AS n3`,
    [user.id],
  );
  const [tot] = await db.query(
    `SELECT COALESCE(SUM(delta_cents) FILTER (WHERE type IN ('cpa','deposit','revshare')), 0) AS ganho,
            COALESCE(SUM(delta_cents), 0) AS saldo
       FROM affiliate_ledger WHERE affiliate_id = $1`,
    [user.id],
  );
  const recent = await db.query(
    `SELECT type, level, delta_cents, created_at FROM affiliate_ledger WHERE affiliate_id = $1 ORDER BY id DESC LIMIT 20`, [user.id],
  );
  return {
    ativo: cfg.ativo,
    codigo: user.referralCode,
    modelo: cfg.modelo,
    niveis: cfg.modelo === 'cpa'
      ? cfg.cpaCents.map((c) => ({ tipo: 'valor', cents: c }))
      : cfg.niveisPct.map((p) => ({ tipo: 'pct', pct: p })),
    cpaDepositoMinCents: cfg.cpaDepositoMinCents,
    indicados: counts,
    ganhoCents: Number(tot.ganho),
    saldoCents: Math.max(0, Number(tot.saldo)), // revshare negativo nao aparece como divida
    saqueMinCents: cfg.saqueMinCents,
    saqueMaxCents: cfg.saqueMaxCents,
    extrato: recent.map((r) => ({ type: r.type, level: r.level, deltaCents: Number(r.delta_cents), at: new Date(r.created_at).getTime() })),
  };
}

/** Numeros para o admin. */
export async function adminStats() {
  const [s] = await db.query(
    `SELECT COALESCE(SUM(delta_cents) FILTER (WHERE type IN ('cpa','deposit','revshare')), 0) AS comissoes,
            COALESCE(-SUM(delta_cents) FILTER (WHERE type = 'withdraw'), 0) AS sacado,
            COALESCE(SUM(delta_cents) FILTER (WHERE type = 'withdraw_reversal'), 0) AS estornado,
            COUNT(DISTINCT affiliate_id)::int AS afiliados
       FROM affiliate_ledger`,
  );
  const [u] = await db.query('SELECT COUNT(*)::int AS indicados FROM users WHERE referred_by IS NOT NULL');
  return { comissoesCents: Number(s.comissoes), sacadoCents: Number(s.sacado) - Number(s.estornado), afiliados: s.afiliados, indicados: u.indicados };
}
