// Indique e ganhe: comissao em ate 3 niveis, no modelo escolhido no admin.
//
//  - cpa:      % do primeiro deposito do indicado que atinge o minimo.
//              So quem passou o link recebe. A % sobe com a quantidade de
//              amigos que ja depositaram o minimo: 10% no inicio, 15% com 5,
//              20% com 10. O deposito que completa a meta ainda sai na faixa
//              anterior; a faixa nova vale para o proximo. Deposito abaixo do
//              minimo nao paga e nao conta.
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
export async function onDeposit(t, user, { amountCents, chargeId }) {
  if (!user.referredBy) return;
  const cfg = await getSetting('afiliados', t);
  if (!cfg.ativo || cfg.modelo === 'revshare') return;
  if (cfg.modelo === 'cpa') return payCpa(t, user, cfg, { amountCents, chargeId });
  const ups = await upline(t, user.referredBy);
  for (let i = 0; i < ups.length; i++) {
    const v = Math.floor((amountCents * cfg.niveisPct[i]) / 100);
    await add(t, { affiliateId: ups[i], referralId: user.id, level: i + 1, type: 'deposit', deltaCents: v, meta: { chargeId, pct: cfg.niveisPct[i] } });
  }
}

/** Amigos diretos que ja tiveram um deposito pago >= minimo. */
async function qualificadosDe(q, affiliateId, minCents) {
  const [r] = await q.query(
    `SELECT COUNT(DISTINCT u.id)::int AS n
       FROM users u
       JOIN charges c ON c.user_id = u.id AND c.status = 'paid' AND c.amount_cents >= $2
      WHERE u.referred_by = $1 AND NOT u.demo`,
    [affiliateId, minCents],
  );
  return r.n;
}

/** Faixa do CPA conforme quantos amigos ja qualificaram. */
function faixaDe(cfg, qualificados) {
  const metas = cfg.cpaMetas || [0, 5, 10];
  let idx = 0;
  for (let i = 0; i < metas.length; i++) if (qualificados >= metas[i]) idx = i;
  return { idx, pct: cfg.niveisPct[idx] || 0 };
}

/** CPA: uma vez, % do primeiro deposito que atinge o minimo, so para quem passou o link. */
async function payCpa(t, user, cfg, { amountCents, chargeId }) {
  if (amountCents < cfg.cpaDepositoMinCents) return;
  if ((await t.query("SELECT 1 FROM affiliate_ledger WHERE type = 'cpa' AND referral_id = $1 LIMIT 1", [user.id])).length) return;
  const affiliateId = user.referredBy;
  const ja = await qualificadosDe(t, affiliateId, cfg.cpaDepositoMinCents);
  const { idx, pct } = faixaDe(cfg, ja);
  const v = Math.floor((amountCents * pct) / 100);
  await add(t, {
    affiliateId, referralId: user.id, level: idx + 1, type: 'cpa', deltaCents: v,
    meta: { chargeId, pct, amountCents, qualificados: ja },
  });
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
  const qualificados = await qualificadosDe(db, user.id, cfg.cpaDepositoMinCents);
  const faixa = faixaDe(cfg, qualificados);
  return {
    ativo: cfg.ativo,
    codigo: user.referralCode,
    modelo: cfg.modelo,
    niveis: cfg.niveisPct.map((p, i) => ({ tipo: 'pct', pct: p, meta: cfg.cpaMetas[i] })),
    cpaMetas: cfg.cpaMetas,
    qualificados,
    pctAtual: faixa.pct,
    faixaAtual: faixa.idx,
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
       FROM affiliate_ledger a JOIN users u ON u.id = a.affiliate_id WHERE NOT u.demo`,
  );
  const [u] = await db.query('SELECT COUNT(*)::int AS indicados FROM users WHERE referred_by IS NOT NULL AND NOT demo');
  return { comissoesCents: Number(s.comissoes), sacadoCents: Number(s.sacado) - Number(s.estornado), afiliados: s.afiliados, indicados: u.indicados };
}
