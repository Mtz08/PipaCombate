// Painel admin: numeros, jogadores (com ajuste de saldo auditado) e auditoria.
// Acesso decidido pelo servidor (rotas /api/admin devolvem 404 a quem nao e admin).

import { brl, esc } from './api.js';

const $ = (s) => document.querySelector(s);
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
async function api(path, body, retry = true) {
  const r = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', headers: H, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  const code = j?.error?.code;
  // acao critica: pede o codigo do autenticador e tenta de novo uma vez
  if (code === 'ADMIN_REAUTH_REQUIRED' && retry) {
    const otp = prompt('Ação protegida. Digite o código de 6 dígitos do app autenticador:');
    if (!otp) throw new Error('Ação cancelada.');
    await api('2fa/confirm', { code: otp }, false);
    return api(path, body, false);
  }
  if (code === 'ADMIN_2FA_REQUIRED') { show2faSetup(); throw new Error('Ative o 2FA (no topo da página) para fazer isso.'); }
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || 'Erro'), { status: r.status, code });
  return j;
}

/* ---------- 2FA do admin (app autenticador: Google Authenticator, Authy...) ---------- */
async function show2faSetup() {
  const box = $('#tfa');
  const s = await api('2fa');
  if (s.ativo) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h2>⚠️ Ative o 2FA do admin</h2>
    <p class="hint">Sem 2FA, o painel só mostra dados: aprovar saque, ajustar saldo e mudar configurações ficam bloqueados.</p>
    <button id="tfaGo" class="primary">Gerar chave</button><div id="tfaStep"></div>`;
  $('#tfaGo').onclick = async () => {
    const { secret, uri } = await api('2fa/setup', {});
    $('#tfaStep').innerHTML = `<p>1. No app autenticador, adicione uma conta com esta chave (ou toque no link no celular):</p>
      <p><code class="secret">${esc(secret.replace(/(.{4})/g, '$1 ').trim())}</code> · <a href="${esc(uri)}">abrir no app</a></p>
      <p>2. Digite o código de 6 dígitos que o app mostrar:</p>
      <div class="row"><input id="tfaCode" inputmode="numeric" maxlength="6" placeholder="000000"><button id="tfaOk" class="primary">Ativar</button></div><p id="tfaMsg" class="msg"></p>`;
    $('#tfaOk').onclick = async () => {
      try { await api('2fa/enable', { code: $('#tfaCode').value }, false); box.innerHTML = '<p>✅ 2FA ativo. Guarde o celular: se perder, o reset é pelo servidor (npm run admin -- zerar-2fa).</p>'; audit(); }
      catch (err) { $('#tfaMsg').textContent = err.message; }
    };
  };
}
const LABEL = { deposit: 'Deposito', withdraw: 'Saque', withdraw_reversal: 'Estorno', bet: 'Aposta', prize: 'Premio', bonus: 'Bonus', adjust: 'Ajuste' };
const dt = (v) => new Date(v).toLocaleString('pt-BR');

async function boot() {
  try { await api('stats'); } catch { $('#app').innerHTML = '<p class="msg">Acesso restrito. <a href="/">Voltar</a></p>'; return; }
  $('#app').innerHTML = `
    <header><div class="brand small"><span class="logo"></span><b>Admin</b></div><a class="link" href="/">voltar ao jogo</a></header>
    <section id="tfa" class="card warn" hidden></section>
    <section class="card"><h2>Numeros</h2><p class="hint">Só dados reais: sem as contas de demonstração e sem as rodadas do modo teste.</p><div id="stats" class="grid"></div>
      <button id="btnExpire" class="link">encerrar rounds abandonados agora</button></section>
    <section class="card"><h2>Saques para aprovar <small id="wqN"></small></h2>
      <p class="hint">O valor já saiu do saldo. Copie os dados, envie o PIX você mesmo e então marque como pago. Recusar devolve o valor. Nenhuma API de saque é chamada.</p>
      <ul id="wq" class="ledger"></ul><p id="wqMsg" class="msg"></p></section>
    <section class="card"><h2>Jogo</h2>
      <p class="hint">O primeiro bloco é o jogo normal. O bloco “rodadas fáceis” vale nas primeiras da conta e nas primeiras de cada dia. Cada rodada guarda o RTP com que foi sorteada.</p>
      <form id="fJogo" class="aff-form"></form></section>
    <section class="card"><h2>Limites de depósito e saque</h2><form id="fLim" class="aff-form"></form></section>
    <section class="card"><h2>Bônus de primeiro depósito</h2>
      <p class="hint">Entra no saldo junto com o 1º depósito e soma (bônus × rollover) ao valor que o jogador precisa apostar antes de sacar. Com RTP de 90% e rollover 10x, o custo esperado do rollover é igual ao bônus. Confirme o formato com o jurídico antes de ligar.</p>
      <form id="fBonus" class="aff-form"></form></section>
    <section class="card"><h2>Textos e botões públicos</h2><form id="fPub" class="aff-form"></form></section>
    <section class="card"><h2>Pixels de anúncio</h2>
      <p class="hint">Só carregam para quem aceitar os cookies de marketing. Eventos: cadastro (CompleteRegistration), início de depósito (InitiateCheckout) e depósito confirmado (Purchase / CompletePayment).</p>
      <form id="fMkt" class="aff-form"></form></section>
    <section id="afiliados" class="card"><h2>Indique e ganhe</h2><div id="affStats" class="grid"></div>
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
    <section class="card"><h2>Possíveis robôs <small id="susN"></small></h2>
      <p class="hint">Últimos 7 dias, 20+ rodadas e nunca cortados por um rival. É só um sinal: confira o histórico antes de agir.</p>
      <ul id="sus" class="ledger"></ul></section>
    <section class="card"><h2>Jogadores</h2>
      <div class="row"><input id="q" placeholder="Telefone ou nome"><button id="btnQ">Buscar</button></div>
      <ul id="users" class="ledger"></ul><div id="detail"></div></section>
    <section class="card"><h2>Auditoria</h2><ul id="audit" class="ledger"></ul></section>`;
  $('#btnQ').onclick = search; $('#q').onkeydown = (e) => { if (e.key === 'Enter') search(); };
  $('#btnExpire').onclick = async () => { const r = await api('expire-rounds', {}); alert(`${r.expired} round(s) encerrado(s).`); stats(); };
  show2faSetup(); stats(); search(); audit(); withdrawals(); affiliates(); suspects();
  settingsForm('jogo', '#fJogo', JOGO); settingsForm('limites', '#fLim', LIMITES); publicoForm();
  settingsForm('marketing', '#fMkt', MARKETING); settingsForm('bonus', '#fBonus', BONUS);
  if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' }), 400);
}

/* ---------- formularios de configuracao (settings) ----------
   campo: [chave, rotulo, tipo] — tipo 'reais' (centavos), 'pct' (centesimos de %),
   'mult' (x100), 'num' (decimal), 'pctx' (pctX100 por tipo de rival) */
const RIVAIS = ['moleque', 'veloz', 'aparador', 'pesadao', 'cortador', 'chefe', 'aparar'];
const JOGO = [
  ['rtpBps', 'RTP (% devolvido em média)', 'pct'], ['maxMultX100', 'Ganho máximo por rodada (x a aposta)', 'mult'],
  ['forca', 'Força dos rivais (1 = normal)', 'num'], ['betMinCents', 'Aposta mínima R$', 'reais'], ['betMaxCents', 'Aposta máxima R$', 'reais'],
  ...RIVAIS.map((k) => [`pctX100.${k}`, `% por corte: ${k}`, 'pctx']),
  ['inicio.rodadas', 'Rodadas fáceis da conta (as primeiras)', 'pctx'],
  ['inicio.rodadasDia', 'Rodadas fáceis por dia (quem já jogou)', 'pctx'],
  ['inicio.rtpBps', 'RTP dessas rodadas (%)', 'pct'],
  ['inicio.forca', 'Força dos rivais nessas rodadas (1 = normal)', 'num'],
  ...RIVAIS.map((k) => [`inicio.pctX100.${k}`, `% por corte nessas rodadas: ${k}`, 'pctx']),
];
const LIMITES = [
  ['depositMinCents', 'Depósito mínimo R$', 'reais'], ['depositMaxCents', 'Depósito máximo R$', 'reais'],
  ['withdrawMinCents', 'Saque mínimo R$', 'reais'], ['withdrawMaxCents', 'Saque máximo R$', 'reais'],
  ['withdrawAutoMaxCents', 'Saque automático até R$ (ignorado: todo saque fica na fila para pagamento manual)', 'reais'],
  ['rolloverPct', 'Rollover: % do depósito a apostar antes de sacar (0 desliga)', 'pctx'],
];
const BONUS = [
  ['ativo', 'Bônus ligado (sim/não)', 'bool'], ['pct', 'Bônus em % do 1º depósito', 'pctx'],
  ['maxCents', 'Bônus máximo R$', 'reais'], ['minDepositoCents', 'Depósito mínimo para ganhar R$', 'reais'],
  ['rolloverX', 'Rollover do bônus (quantas vezes apostar)', 'pctx'],
];
const MARKETING = [
  ['metaPixelId', 'Pixel do Meta (ID numérico)', 'txt'], ['tiktokPixelId', 'Pixel do TikTok (ID)', 'txt'],
  ['utmifyPixelId', 'Pixel da UTMify (ID)', 'txt'], ['utmifyUtms', 'Script de UTMs da UTMify (sim/não)', 'bool'],
];
const conv = {
  txt: [(v) => String(v ?? ''), (s) => String(s).trim()],
  bool: [(v) => (v ? 'sim' : 'não'), (s) => /^s/i.test(String(s).trim())],
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
    <p class="hint">Popup de aviso (aparece no lobby)</p>
    <label class="check"><input type="checkbox" name="popAtivo" ${v.popup.ativo ? 'checked' : ''}> Popup ativo</label>
    <div class="row"><b>Título</b><input name="popTitulo" maxlength="60" value="${esc(v.popup.titulo)}"></div>
    <textarea name="popMsg" rows="2" maxlength="400" placeholder="Mensagem">${esc(v.popup.mensagem)}</textarea>
    <div class="row"><b>Imagem (https://)</b><input name="popImg" value="${esc(v.popup.imagemUrl)}"></div>
    <div class="row"><b>Botão</b><input name="popBtn" maxlength="30" placeholder="texto" value="${esc(v.popup.botaoTexto)}">
      <select name="popAcao">${[['fechar', 'só fecha'], ['depositar', 'abre o depósito'], ['indicar', 'abre o indique e ganhe'], ['link', 'abre um link']].map(([k, t]) => `<option value="${k}" ${v.popup.botaoAcao === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="row"><b>Link do botão</b><input name="popUrl" value="${esc(v.popup.botaoUrl)}"></div>
    <div class="row"><b>Mostrar</b><select name="popFreq">${[['sessao', 'uma vez por visita'], ['diaria', 'uma vez por dia'], ['sempre', 'toda vez que abrir o lobby']].map(([k, t]) => `<option value="${k}" ${v.popup.frequencia === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <p class="hint">Texto legal do rodapé (empresa, CNPJ, número da autorização). Só aparece se preenchido: não invente número.</p>
    <textarea name="rodapeLegal" rows="2" maxlength="300">${esc(v.rodapeLegal || '')}</textarea>
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
      const popup = {
        ativo: f.popAtivo.checked, titulo: f.popTitulo.value, mensagem: f.popMsg.value, imagemUrl: f.popImg.value.trim(),
        botaoTexto: f.popBtn.value, botaoAcao: f.popAcao.value, botaoUrl: f.popUrl.value.trim(), frequencia: f.popFreq.value,
      };
      await api('settings/publico', { value: { siteNome: f.siteNome.value, depositoRapidoCents: chips, depositoRotulos: rot, depositoCores: cor, suporte, popup, rodapeLegal: f.rodapeLegal.value } });
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

async function suspects() {
  const { suspects: list } = await api('suspects');
  $('#susN').textContent = list.length ? `(${list.length})` : '';
  $('#sus').innerHTML = list.map((s) => `<li data-id="${esc(s.id)}" class="click"><span>${esc(s.name)} <small>${esc(s.phone)} · ${s.rodadas} rodadas · sacou ${s.sacou} · ${s.cortesMedios} cortes/rodada</small></span><span>${brl(s.lucroCents)}</span></li>`).join('') || '<li class="hint">Nenhum sinal.</li>';
  $('#sus').onclick = (e) => { const li = e.target.closest('li[data-id]'); if (li) detail(li.dataset.id); };
}

function reaisSolto(cents) { return (Number(cents) / 100).toFixed(2).replace('.', ','); }
function cpfBonito(d) {
  const x = String(d || '').replace(/\D/g, '');
  return x.length === 11 ? x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (d || '');
}
function tipoChave(key) {
  const k = String(key || '');
  if (k.includes('@')) return 'E-mail';
  if (/^[0-9a-f-]{36}$/i.test(k)) return 'Aleatória';
  const digitos = k.replace(/\D/g, '');
  if (k.startsWith('+') || digitos.startsWith('55')) return 'Telefone';
  if (digitos.length === 14) return 'CNPJ';
  if (digitos.length === 11) return 'CPF';
  return 'Chave';
}
const campoPagamento = (rotulo, valor, extra = '') => `<div class="pay-box ${extra}"><span>${esc(rotulo)}</span><div class="line"><code>${esc(valor)}</code><button type="button" class="copy" data-copy="${esc(valor)}">Copiar</button></div></div>`;

async function withdrawals() {
  const { withdrawals: list } = await api('withdrawals');
  $('#wqN').textContent = list.length ? `(${list.length})` : '';
  $('#wq').innerHTML = list.map((w) => {
    const ip = w.clientIp && w.clientIp !== '::1' && w.clientIp !== '127.0.0.1' ? w.clientIp : '';
    return `<li class="payout" data-id="${esc(w.id)}">
      <div class="payout-head"><b>${brl(w.amountCents)}</b><small>${esc(w.userName)}<br>${w.source === 'affiliate' ? 'comissão' : 'saldo do jogo'}</small></div>
      ${campoPagamento('Chave PIX · ' + tipoChave(w.pixKey), w.pixKey || '', 'chave')}
      ${campoPagamento('CPF', cpfBonito(w.cpf))}
      ${campoPagamento('Valor para digitar', reaisSolto(w.amountCents))}
      ${campoPagamento('Telefone da conta', w.userPhone || '')}
      <p class="meta">Pedido em ${dt(w.createdAt)} · conta desde ${new Date(w.userSince).toLocaleDateString('pt-BR')} · saldo restante ${brl(w.userBalanceCents)}${ip ? ` · IP ${esc(ip)}` : ''}</p>
      <span class="row"><button class="cash" data-a="approve">Marcar como pago</button><button data-a="reject">Recusar</button><button class="link" data-a="user">ver jogador</button></span>
    </li>`;
  }).join('') || '<li class="hint">Nenhum saque esperando.</li>';
  $('#wq').onclick = async (e) => {
    const copiar = e.target.closest('button[data-copy]');
    if (copiar) {
      const texto = copiar.getAttribute('data-copy') || '';
      try { await navigator.clipboard.writeText(texto); copiar.textContent = 'Copiado'; setTimeout(() => { copiar.textContent = 'Copiar'; }, 1200); }
      catch { copiar.textContent = 'Selecione'; }
      return;
    }
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const li = b.closest('li[data-id]'), id = li.dataset.id;
    if (b.dataset.a === 'user') return detail(list.find((w) => w.id === id).userId);
    const body = b.dataset.a === 'reject' ? { note: prompt('Motivo da recusa (o jogador vê no extrato):') } : {};
    if (b.dataset.a === 'reject' && !body.note) return;
    if (b.dataset.a === 'approve' && !confirm('Marcar como pago? O PIX não é enviado daqui. Confirme só depois de ter pago na mão.')) return;
    li.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      await api(`withdrawals/${encodeURIComponent(id)}/${b.dataset.a}`, body);
      $('#wqMsg').textContent = b.dataset.a === 'approve' ? 'Marcado como pago.' : 'Saque recusado e estornado.';
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
  $('#users').innerHTML = users.map((u) => `<li data-id="${esc(u.id)}" class="click"><span>${esc(u.name)} <small>${esc(u.phone)}${u.role === 'admin' ? ' · admin' : ''}${u.modoTeste ? ' · 🧪 modo teste' : ''}</small></span><span>${brl(u.balanceCents)}</span></li>`).join('') || '<li class="hint">Ninguem encontrado.</li>';
  $('#users').onclick = (e) => { const li = e.target.closest('li[data-id]'); if (li) detail(li.dataset.id); };
}

async function detail(id) {
  const d = await api(`users/${encodeURIComponent(id)}`);
  $('#detail').innerHTML = `
    <div class="revealed">
      <p><b>${esc(d.user.name)}</b> · ${esc(d.user.phone)} · saldo <b>${brl(d.user.balanceCents)}</b>${d.user.wagerRequiredCents ? ` · falta apostar ${brl(d.user.wagerRequiredCents)}` : ''}</p>
      ${d.user.blockedAt ? `<p class="msg">⛔ Bloqueada: ${esc(d.user.blockedReason || '')} <button id="btnUnblock">Desbloquear</button></p>` : ''}
      <p class="hint">Origem: ${d.user.utm ? esc(Object.entries(d.user.utm).map(([k, x]) => `${k}=${x}`).join(' · ')) : 'sem UTM'}${d.user.ref ? ` · indicado por código ${esc(d.user.ref)}` : ''}</p>
      <div class="row"><input id="adjV" type="number" placeholder="Ajuste R$ (+/-)"><input id="adjR" placeholder="Motivo (obrigatorio)"><button id="btnAdj">Ajustar</button></div>
      <p id="adjMsg" class="msg"></p>
      <details><summary>Extrato (${d.ledger.length})</summary><ul class="ledger">${d.ledger.map((l) => `<li><span>${esc(LABEL[l.type] || l.type)}${l.reason ? ` <small>${esc(l.reason)}</small>` : ''}</span><span class="${l.deltaCents < 0 ? 'neg' : 'pos'}">${brl(l.deltaCents)}</span><small>${dt(l.at)}</small></li>`).join('')}</ul></details>
      <details><summary>Rounds (${d.rounds.length})</summary><ul class="ledger">${d.rounds.map((r) => `<li><span>${esc(r.endReason || r.state)} · ${(r.multX100 / 100).toFixed(2)}x · vento ${(r.ceilingX100 / 100).toFixed(2)}x</span><span>${brl(r.prizeCents - r.betCents)}</span></li>`).join('')}</ul></details>
      <details><summary>Auditoria (${d.audit.length})</summary><ul class="ledger">${d.audit.map((a) => `<li><span>${esc(a.action)}</span><small>${dt(a.created_at)}</small></li>`).join('')}</ul></details>
    </div>`;
  if ($('#btnUnblock')) $('#btnUnblock').onclick = async () => {
    const reason = prompt('Motivo do desbloqueio (fica na auditoria):');
    if (!reason) return;
    try { await api(`users/${encodeURIComponent(id)}/unblock`, { reason }); await detail(id); audit(); } catch (err) { alert(err.message); }
  };
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
