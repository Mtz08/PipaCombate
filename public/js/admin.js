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
    <section class="card"><h2>Saques para aprovar <small id="wqN"></small></h2>
      <p class="hint">O valor ja saiu do saldo do jogador. Aprovar envia o PIX; recusar devolve o valor ao saldo.</p>
      <ul id="wq" class="ledger"></ul><p id="wqMsg" class="msg"></p></section>
    <section class="card"><h2>Jogo</h2>
      <p class="hint">Vale para as próximas rodadas. Cada rodada guarda o RTP e o teto com que foi sorteada, então a verificação das antigas continua batendo.</p>
      <form id="fJogo" class="aff-form"></form></section>
    <section class="card"><h2>Limites de depósito e saque</h2><form id="fLim" class="aff-form"></form></section>
    <section class="card"><h2>Textos e botões públicos</h2><form id="fPub" class="aff-form"></form></section>
    <section class="card"><h2>Indique e ganhe</h2><div id="affStats" class="grid"></div>
      <form id="affForm" class="aff-form">
        <label class="check"><input type="checkbox" name="ativo"> Programa ativo</label>
        <label>Modelo <select name="modelo">
          <option value="deposito">% de cada depósito do indicado</option>
          <option value="cpa">CPA: valor fixo no 1º depósito</option>
          <option value="revshare">RevShare: % do resultado da casa</option></select></label>
        <div class="row" data-m="pct"><b>% por nível</b><input name="p1" type="number" min="0" max="50"><input name="p2" type="number" min="0" max="50"><input name="p3" type="number" min="0" max="50"></div>
        <div class="row" data-m="cpa"><b>CPA R$ por nível</b><input name="c1" type="number" min="0" step="0.01"><input name="c2" type="number" min="0" step="0.01"><input name="c3" type="number" min="0" step="0.01"></div>
        <div class="row" data-m="cpa"><b>Depósito mínimo p/ CPA (R$)</b><input name="cpaMin" type="number" min="0" step="0.01"></div>
        <div class="row"><b>Saque de comissão R$ mín/máx</b><input name="sMin" type="number" min="1" step="0.01"><input name="sMax" type="number" min="1" step="0.01"></div>
        <button class="primary" type="submit">Salvar</button><p id="affMsg" class="msg"></p>
      </form></section>
    <section class="card"><h2>Jogadores</h2>
      <div class="row"><input id="q" placeholder="Telefone ou nome"><button id="btnQ">Buscar</button></div>
      <ul id="users" class="ledger"></ul><div id="detail"></div></section>
    <section class="card"><h2>Auditoria</h2><ul id="audit" class="ledger"></ul></section>`;
  $('#btnQ').onclick = search; $('#q').onkeydown = (e) => { if (e.key === 'Enter') search(); };
  $('#btnExpire').onclick = async () => { const r = await api('expire-rounds', {}); alert(`${r.expired} round(s) encerrado(s).`); stats(); };
  stats(); search(); audit(); withdrawals(); affiliates();
  settingsForm('jogo', '#fJogo', JOGO); settingsForm('limites', '#fLim', LIMITES); publicoForm();
}

/* ---------- formularios de configuracao (settings) ----------
   campo: [chave, rotulo, tipo] — tipo 'reais' (centavos), 'pct' (centesimos de %),
   'mult' (x100), 'num' (decimal), 'pctx' (pctX100 por tipo de rival) */
const RIVAIS = ['moleque', 'veloz', 'aparador', 'pesadao', 'cortador', 'chefe', 'aparar'];
const JOGO = [
  ['rtpBps', 'RTP (% devolvido em média)', 'pct'], ['maxMultX100', 'Ganho máximo por rodada (x a aposta)', 'mult'],
  ['forca', 'Força dos rivais (1 = normal)', 'num'], ['betMinCents', 'Aposta mínima R$', 'reais'], ['betMaxCents', 'Aposta máxima R$', 'reais'],
  ...RIVAIS.map((k) => [`pctX100.${k}`, `% por corte: ${k}`, 'pctx']),
];
const LIMITES = [
  ['depositMinCents', 'Depósito mínimo R$', 'reais'], ['depositMaxCents', 'Depósito máximo R$', 'reais'],
  ['withdrawMinCents', 'Saque mínimo R$', 'reais'], ['withdrawMaxCents', 'Saque máximo R$', 'reais'],
  ['withdrawAutoMaxCents', 'Saque automático até R$ (0 = todos passam por aprovação)', 'reais'],
];
const conv = {
  reais: [(v) => (v / 100).toFixed(2), (s) => Math.round(parseFloat(String(s).replace(',', '.')) * 100)],
  pct: [(v) => (v / 100).toFixed(2), (s) => Math.round(parseFloat(String(s).replace(',', '.')) * 100)],
  mult: [(v) => (v / 100).toFixed(2), (s) => Math.round(parseFloat(String(s).replace(',', '.')) * 100)],
  pctx: [(v) => String(v), (s) => parseInt(s, 10)],
  num: [(v) => String(v), (s) => parseFloat(String(s).replace(',', '.'))],
};
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => (a[k] ??= {}), o)[last] = v; }

async function settingsForm(key, sel, campos) {
  const f = $(sel);
  const { value } = await api(`settings/${key}`);
  f.innerHTML = campos.map(([k, rot, tipo]) => `<div class="row"><b>${esc(rot)}</b><input name="${esc(k)}" value="${esc(conv[tipo][0](getPath(value, k)))}"></div>`).join('')
    + '<div class="row"><button class="primary" type="submit">Salvar</button><button type="button" class="link" data-reset>voltar ao padrão</button></div><p class="msg"></p>';
  const msg = f.querySelector('.msg');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = JSON.parse(JSON.stringify(value));
    for (const [k, , tipo] of campos) setPath(v, k, conv[tipo][1](f.elements[k].value));
    try { await api(`settings/${key}`, { value: v }); msg.textContent = 'Salvo.'; audit(); } catch (err) { msg.textContent = err.message; }
  };
  f.querySelector('[data-reset]').onclick = async () => {
    if (!confirm('Voltar esta seção para os valores padrão?')) return;
    await api(`settings/${key}`, { value: null }); settingsForm(key, sel, campos); audit();
  };
}

async function publicoForm() {
  const f = $('#fPub');
  const { value: v } = await api('settings/publico');
  const linha = (c) => `<div class="row" data-chip><b>Botão R$</b><input name="v" value="${(c / 100).toFixed(2)}"><input name="r" placeholder="rótulo" value="${esc(v.depositoRotulos[c] || '')}"><input name="c" type="color" value="${esc(v.depositoCores[c] || '#f59e0b')}"></div>`;
  f.innerHTML = `<div class="row"><b>Nome do site</b><input name="siteNome" value="${esc(v.siteNome)}"></div>
    <p class="hint">Botões de depósito rápido (até 8). Deixe o valor vazio para remover.</p>
    <div id="pubChips">${v.depositoRapidoCents.map(linha).join('')}</div>
    <div class="row"><button type="button" data-add>+ botão</button></div>
    <p class="hint">Links de suporte (https://), um por linha no formato: Nome | https://...</p>
    <textarea name="suporte" rows="3">${esc(v.suporte.map((s) => `${s.nome} | ${s.url}`).join('\n'))}</textarea>
    <div class="row"><button class="primary" type="submit">Salvar</button></div><p class="msg"></p>`;
  f.querySelector('[data-add]').onclick = () => { if (f.querySelectorAll('[data-chip]').length < 8) $('#pubChips').insertAdjacentHTML('beforeend', linha(1000)); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const chips = [], rot = {}, cor = {};
    f.querySelectorAll('[data-chip]').forEach((row) => {
      const c = Math.round(parseFloat(row.querySelector('[name=v]').value.replace(',', '.')) * 100);
      if (!c) return;
      chips.push(c); rot[c] = row.querySelector('[name=r]').value; cor[c] = row.querySelector('[name=c]').value;
    });
    const suporte = f.suporte.value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[1]).map(([nome, url]) => ({ nome, url }));
    try {
      await api('settings/publico', { value: { siteNome: f.siteNome.value, depositoRapidoCents: chips, depositoRotulos: rot, depositoCores: cor, suporte } });
      f.querySelector('.msg').textContent = 'Salvo.'; audit();
    } catch (err) { f.querySelector('.msg').textContent = err.message; }
  };
}

const reais = (c) => (c / 100).toFixed(2), cents = (v) => Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0;
async function affiliates() {
  const [{ value: v }, s] = await Promise.all([api('settings/afiliados'), api('affiliates')]);
  const cell = (k, x) => `<div><small>${k}</small><b>${x}</b></div>`;
  $('#affStats').innerHTML = [cell('Afiliados com comissão', s.afiliados), cell('Jogadores indicados', s.indicados), cell('Comissões geradas', brl(s.comissoesCents)), cell('Comissões sacadas', brl(s.sacadoCents))].join('');
  const f = $('#affForm');
  f.ativo.checked = v.ativo; f.modelo.value = v.modelo;
  [f.p1.value, f.p2.value, f.p3.value] = v.niveisPct;
  [f.c1.value, f.c2.value, f.c3.value] = v.cpaCents.map(reais);
  f.cpaMin.value = reais(v.cpaDepositoMinCents); f.sMin.value = reais(v.saqueMinCents); f.sMax.value = reais(v.saqueMaxCents);
  const show = () => f.querySelectorAll('[data-m]').forEach((el) => { el.hidden = el.dataset.m === 'cpa' ? f.modelo.value !== 'cpa' : f.modelo.value === 'cpa'; });
  f.modelo.onchange = show; show();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const value = {
      ativo: f.ativo.checked, modelo: f.modelo.value,
      niveisPct: [f.p1.value, f.p2.value, f.p3.value].map(Number),
      cpaCents: [f.c1.value, f.c2.value, f.c3.value].map(cents),
      cpaDepositoMinCents: cents(f.cpaMin.value), saqueMinCents: cents(f.sMin.value), saqueMaxCents: cents(f.sMax.value),
    };
    try { await api('settings/afiliados', { value }); $('#affMsg').textContent = 'Salvo. Vale para os próximos depósitos e rodadas.'; audit(); }
    catch (err) { $('#affMsg').textContent = err.message; }
  };
}

async function withdrawals() {
  const { withdrawals: list } = await api('withdrawals');
  $('#wqN').textContent = list.length ? `(${list.length})` : '';
  $('#wq').innerHTML = list.map((w) => `<li data-id="${esc(w.id)}">
      <span>${brl(w.amountCents)} · <b>${esc(w.userName)}</b> <small>${esc(w.userPhone)} · chave ${esc(w.pixKeyMask)} · saldo ${brl(w.userBalanceCents)} · conta desde ${new Date(w.userSince).toLocaleDateString('pt-BR')}</small></span>
      <small>${dt(w.createdAt)}</small>
      <span class="row"><button class="cash" data-a="approve">Aprovar</button><button data-a="reject">Recusar</button><button class="link" data-a="user">ver jogador</button></span>
    </li>`).join('') || '<li class="hint">Nenhum saque esperando.</li>';
  $('#wq').onclick = async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const li = b.closest('li[data-id]'), id = li.dataset.id;
    if (b.dataset.a === 'user') return detail(list.find((w) => w.id === id).userId);
    const body = b.dataset.a === 'reject' ? { note: prompt('Motivo da recusa (o jogador vê no extrato):') } : {};
    if (b.dataset.a === 'reject' && !body.note) return;
    if (b.dataset.a === 'approve' && !confirm('Aprovar e enviar o PIX?')) return;
    li.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      await api(`withdrawals/${encodeURIComponent(id)}/${b.dataset.a}`, body);
      $('#wqMsg').textContent = b.dataset.a === 'approve' ? 'Saque aprovado.' : 'Saque recusado e estornado.';
    } catch (err) { $('#wqMsg').textContent = err.message; }
    withdrawals(); stats(); audit();
  };
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
