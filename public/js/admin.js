// Painel admin: numeros, jogadores (com ajuste de saldo auditado) e auditoria.
// Acesso decidido pelo servidor (rotas /api/admin devolvem 404 a quem nao e admin).

import { brl, esc } from './api.js';

const $ = (s) => document.querySelector(s);
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
async function api(path, body) {
  const r = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', headers: H, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || 'Erro'), { status: r.status });
  return j;
}
const LABEL = { deposit: 'Deposito', withdraw: 'Saque', withdraw_reversal: 'Estorno', bet: 'Aposta', prize: 'Premio', bonus: 'Bonus', adjust: 'Ajuste' };
const dt = (v) => new Date(v).toLocaleString('pt-BR');

async function boot() {
  try { await api('stats'); } catch { $('#app').innerHTML = '<p class="msg">Acesso restrito. <a href="/">Voltar</a></p>'; return; }
  $('#app').innerHTML = `
    <header><div class="brand small"><span class="logo"></span><b>Admin</b></div><a class="link" href="/">voltar ao jogo</a></header>
    <section class="card"><h2>Numeros</h2><div id="stats" class="grid"></div>
      <button id="btnExpire" class="link">encerrar rounds abandonados agora</button></section>
    <section class="card"><h2>Jogadores</h2>
      <div class="row"><input id="q" placeholder="Telefone ou nome"><button id="btnQ">Buscar</button></div>
      <ul id="users" class="ledger"></ul><div id="detail"></div></section>
    <section class="card"><h2>Auditoria</h2><ul id="audit" class="ledger"></ul></section>`;
  $('#btnQ').onclick = search; $('#q').onkeydown = (e) => { if (e.key === 'Enter') search(); };
  $('#btnExpire').onclick = async () => { const r = await api('expire-rounds', {}); alert(`${r.expired} round(s) encerrado(s).`); stats(); };
  stats(); search(); audit();
}

async function stats() {
  const s = await api('stats'), m = s.money;
  const cell = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  $('#stats').innerHTML = [
    cell('Jogadores', s.users), cell('Saldo em contas', brl(s.balancesCents)),
    cell('Depositos', brl(m.deposits)), cell('Saques', brl(m.withdrawals - m.reversals)),
    cell('Apostado', brl(m.bets)), cell('Premios', brl(m.prizes)),
    cell('GGR (casa)', brl(m.ggr)), cell('RTP real', m.rtpRealPct == null ? '—' : `${m.rtpRealPct}%`),
    cell('Rounds 24h', s.rounds.last24h), cell('Abertos', s.rounds.open),
    cell('Vento virou', s.rounds.wind), cell('Cortados / Recolheu', `${s.rounds.cut} / ${s.rounds.cashed}`),
  ].join('');
}

async function search() {
  const { users } = await api(`users?q=${encodeURIComponent($('#q').value)}`);
  $('#users').innerHTML = users.map((u) => `<li data-id="${esc(u.id)}" class="click"><span>${esc(u.name)} <small>${esc(u.phone)}${u.role === 'admin' ? ' · admin' : ''}</small></span><span>${brl(u.balanceCents)}</span></li>`).join('') || '<li class="hint">Ninguem encontrado.</li>';
  $('#users').onclick = (e) => { const li = e.target.closest('li[data-id]'); if (li) detail(li.dataset.id); };
}

async function detail(id) {
  const d = await api(`users/${encodeURIComponent(id)}`);
  $('#detail').innerHTML = `
    <div class="revealed">
      <p><b>${esc(d.user.name)}</b> · ${esc(d.user.phone)} · saldo <b>${brl(d.user.balanceCents)}</b></p>
      <div class="row"><input id="adjV" type="number" placeholder="Ajuste R$ (+/-)"><input id="adjR" placeholder="Motivo (obrigatorio)"><button id="btnAdj">Ajustar</button></div>
      <p id="adjMsg" class="msg"></p>
      <details><summary>Extrato (${d.ledger.length})</summary><ul class="ledger">${d.ledger.map((l) => `<li><span>${esc(LABEL[l.type] || l.type)}${l.reason ? ` <small>${esc(l.reason)}</small>` : ''}</span><span class="${l.deltaCents < 0 ? 'neg' : 'pos'}">${brl(l.deltaCents)}</span><small>${dt(l.at)}</small></li>`).join('')}</ul></details>
      <details><summary>Rounds (${d.rounds.length})</summary><ul class="ledger">${d.rounds.map((r) => `<li><span>${esc(r.endReason || r.state)} · ${(r.multX100 / 100).toFixed(2)}x · vento ${(r.ceilingX100 / 100).toFixed(2)}x</span><span>${brl(r.prizeCents - r.betCents)}</span></li>`).join('')}</ul></details>
      <details><summary>Auditoria (${d.audit.length})</summary><ul class="ledger">${d.audit.map((a) => `<li><span>${esc(a.action)}</span><small>${dt(a.created_at)}</small></li>`).join('')}</ul></details>
    </div>`;
  $('#btnAdj').onclick = async () => {
    try {
      const cents = Math.round(parseFloat(String($('#adjV').value).replace(',', '.')) * 100);
      await api(`users/${encodeURIComponent(id)}/adjust`, { deltaCents: cents, reason: $('#adjR').value });
      await detail(id); stats(); audit();
    } catch (err) { $('#adjMsg').textContent = err.message; }
  };
}

async function audit() {
  const { entries } = await api('audit?limit=50');
  $('#audit').innerHTML = entries.map((a) => `<li><span>${esc(a.action)} <small>${esc(a.ip || '')}</small></span><small>${dt(a.created_at)}</small></li>`).join('') || '<li class="hint">Vazio.</li>';
}

boot();
