// Shell do app: autenticacao, carteira e jogo. Vanilla ES modules.
// REGRA: todo dado vindo da API passa por esc() antes de ir para innerHTML.
// O jogo visual (canvas) so encena o resultado que o servidor devolve.

import { Api, brl, esc } from './api.js';
import { Combat } from './combat/engine.js';
import { MAPS, SKINS } from './combat/world.js';
import { drawKid, randomKid, KID_OPTS } from './combat/render.js';
import { Sound } from './game/audio.js';
import { windPoint } from './game/fair.js';

const $ = (sel) => document.querySelector(sel);
const app = $('#app');
let state = { user: null, balanceCents: 0, round: null, cfg: null, lobby: null, busy: false };

// preferencias cosmeticas do jogador (so neste navegador)
const prefs = { map: 'laje', skin: SKINS[0].id };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('pc_prefs') || '{}')); } catch {}
if (!prefs.kid || !KID_OPTS.pele.includes(prefs.kid.pele)) prefs.kid = randomKid();
for (const k of ['oculos', 'corrente', 'danca']) if (!KID_OPTS[k].includes(prefs.kid[k])) prefs.kid[k] = KID_OPTS[k][0];
const savePrefs = () => { try { localStorage.setItem('pc_prefs', JSON.stringify(prefs)); } catch {} };
let scene = null; // motor do combate (demo no lobby, partida durante o round)

const setBalance = (c) => {
  if (!Number.isInteger(c)) return;
  state.balanceCents = c;
  const b = $('#balance'); if (b) b.textContent = brl(c);
};

async function boot() {
  try { state.cfg = await Api.config(); } catch {}
  try {
    const s = await Api.me();
    state.user = s.user; state.balanceCents = s.balanceCents;
    await screenHome();
  } catch { screenAuth(); }
}

/** Trata 401 em qualquer acao: sessao expirou ou foi revogada. */
function handleErr(err, show) {
  if (err.status === 401) { state.user = null; scene?.destroy(); scene = null; return screenAuth('Sua sessao expirou. Entre novamente.'); }
  setBalance(err.data?.balanceCents);
  show(err.message);
}

/** Evita duplo clique disparando duas requisicoes. */
async function once(btn, fn) {
  if (state.busy) return;
  state.busy = true; if (btn) btn.disabled = true;
  try { await fn(); } finally { state.busy = false; if (btn && btn.isConnected) btn.disabled = false; }
}

// ---------- Auth ----------
function screenAuth(notice = '') {
  const mock = state.cfg?.pagamento === 'MOCK';
  app.innerHTML = `
    <div class="brand"><span class="logo" aria-hidden="true"></span><h1>Pipa Combate</h1></div>
    ${mock ? '<p class="mock">Ambiente de teste — pagamento simulado, sem dinheiro real.</p>' : ''}
    <div class="tabs" role="tablist">
      <button id="tabLogin" class="active" role="tab">Entrar</button>
      <button id="tabReg" role="tab">Cadastrar</button>
    </div>
    <form id="form" novalidate></form>
    <p id="msg" class="msg" role="alert">${esc(notice)}</p>
    <p class="legal">Proibido para menores de 18 anos. Jogue com responsabilidade.</p>`;
  let mode = 'login';
  const render = () => {
    $('#form').innerHTML = (mode === 'reg' ? `<input name="name" placeholder="Nome" autocomplete="name" required>` : '') + `
      <input name="phone" placeholder="Telefone com DDD" inputmode="numeric" autocomplete="tel" required>
      <input name="password" type="password" placeholder="Senha (min. 8)" autocomplete="${mode === 'reg' ? 'new-password' : 'current-password'}" required>
      ${mode === 'reg' ? '<label class="check"><input type="checkbox" name="adult" required> Tenho 18 anos ou mais e aceito os termos</label>' : ''}
      <button type="submit" class="primary">${mode === 'reg' ? 'Criar conta' : 'Entrar'}</button>`;
  };
  const tab = (m) => {
    mode = m;
    $('#tabLogin').classList.toggle('active', m === 'login');
    $('#tabReg').classList.toggle('active', m === 'reg');
    render();
  };
  $('#tabLogin').onclick = () => tab('login');
  $('#tabReg').onclick = () => tab('reg');
  render();
  $('#form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (mode === 'reg' && !f.get('adult')) { $('#msg').textContent = 'Confirme que tem 18 anos ou mais.'; return; }
    once(e.submitter, async () => {
      try {
        const ref = new URLSearchParams(location.search).get('ref');
        const s = mode === 'reg'
          ? await Api.register(f.get('name'), f.get('phone'), f.get('password'), ref)
          : await Api.login(f.get('phone'), f.get('password'));
        state.user = s.user; state.balanceCents = s.balanceCents;
        await screenHome();
      } catch (err) { $('#msg').textContent = err.message; }
    });
  };
}

// ---------- Home ----------
async function screenHome() {
  try { state.lobby = await Api.lobby(); } catch {}
  const bets = state.cfg?.entrada_valores || [5, 10, 20, 50];
  const deps = state.cfg?.deposito_valores_rapidos || [20, 50, 100];
  const maps = (state.lobby?.maps || Object.keys(MAPS)).filter((m) => MAPS[m]);
  if (!maps.includes(prefs.map)) prefs.map = maps[0];
  app.innerHTML = `
    <header>
      <div class="brand small"><span class="logo" aria-hidden="true"></span><b>${esc(state.user.username)}</b></div>
      <div class="saldo">Saldo <span id="balance">${brl(state.balanceCents)}</span></div>
      ${state.user.admin ? '<a class="link" href="/admin.html">admin</a>' : ''}
      <button id="logout" class="link">sair</button>
    </header>

    <section class="card game-card">
      <div class="stage">
        <canvas id="stage" aria-label="Combate de pipas"></canvas>
        <div id="hp" class="hp" hidden><div id="hpFill"></div></div>
        <div class="hud" aria-live="polite">
          <div id="hudMult" class="hud-mult"></div>
          <div id="hudInfo" class="hud-info"></div>
        </div>
        <button id="mute" class="mute" aria-label="Ligar ou desligar som">${Sound.muted ? 'som: off' : 'som: on'}</button>
      </div>

      <div id="setup">
        <div class="picker" id="mapPick" role="radiogroup" aria-label="Mapa">
          ${maps.map((m) => `<button class="chip${m === prefs.map ? ' on' : ''}" data-map="${esc(m)}">${esc(MAPS[m].name)}</button>`).join('')}
        </div>
        <div class="picker skins" id="skinPick" role="radiogroup" aria-label="Pipa">
          ${SKINS.map((k) => `<button class="swatch${k.id === prefs.skin ? ' on' : ''}" data-skin="${k.id}" title="${esc(k.name)}" aria-label="${esc(k.name)}"></button>`).join('')}
        </div>
        <div class="chips" id="betChips">${bets.map((v) => `<button class="chip" data-v="${Number(v)}">R$ ${Number(v)}</button>`).join('')}</div>
        <div class="row">
          <input id="bet" type="number" placeholder="Aposta (R$)" min="5" value="${Number(bets[0])}" inputmode="decimal" aria-label="Aposta em reais">
          <button id="btnStart" class="primary">Soltar pipa</button>
        </div>
        <div class="row">
          <button id="btnPractice" class="ghost">Treinar (gratis, sem aposta)</button>
        </div>
      </div>
      <div id="game"></div>
      ${state.lobby?.pct ? `<details class="rules"><summary>Como funciona</summary>
        <p>Pilote sua pipa arrastando o dedo/mouse. Cruze a linha dos rivais para corta-los; toque duas vezes (ou Espaco) para dar uma <b>relada</b>. Apare pipas que caem.</p>
        <p>Cada corte soma ao multiplicador: moleque +${fmtX(state.lobby.pct.moleque)}, chefao +${fmtX(state.lobby.pct.chefe)}, aparar +${fmtX(state.lobby.pct.aparar)}.</p>
        <p><b>O vento vira</b> em um ponto sorteado antes da rodada (provably fair, RTP ${state.lobby.rtpPct}%). Se o multiplicador chegar nele antes de voce recolher, a rodada termina sem premio. Se cortarem sua pipa, tambem.</p></details>` : ''}
    </section>

    <section class="card">
      <h2>Seu bonequinho</h2>
      <div class="kid-edit">
        <canvas id="kidPreview" width="120" height="150" aria-label="Seu bonequinho"></canvas>
        <div id="kidOpts">
          ${['pele', 'camisa', 'bermuda'].map((k) => `<div class="kid-row" data-k="${k}">${KID_OPTS[k].map((c) => `<button class="dot${prefs.kid[k] === c ? ' on' : ''}" data-v="${c}" aria-label="${k} ${c}"></button>`).join('')}</div>`).join('')}
          <div class="kid-row" data-k="cabeca">${KID_OPTS.cabeca.map((c) => `<button class="chip${prefs.kid.cabeca === c ? ' on' : ''}" data-v="${c}">${{ bone: 'Bone', bonetras: 'Bone pra tras', black: 'Black', raspado: 'Raspado', bandana: 'Bandana' }[c]}</button>`).join('')}</div>
          ${[['oculos', { nenhum: 'Sem oculos', escuro: 'Escuro', juliete: 'Juliete', neon: 'Neon' }], ['corrente', { nenhuma: 'Sem corrente', ouro: 'Ouro', prata: 'Prata' }], ['danca', { pulinho: 'Pulinho', passinho: 'Passinho', bracos: 'Bracos' }]]
            .map(([k, lab]) => `<div class="kid-row" data-k="${k}">${KID_OPTS[k].map((c) => `<button class="chip${prefs.kid[k] === c ? ' on' : ''}" data-v="${c}">${lab[c]}</button>`).join('')}</div>`).join('')}
          <button id="kidRandom" class="link">sortear visual</button>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Depositar ${state.cfg?.pagamento === 'MOCK' ? '<small>(SIMULADO)</small>' : ''}</h2>
      <div class="chips" id="depChips">${deps.map((v) => `<button class="chip" data-v="${Number(v)}">R$ ${Number(v)}</button>`).join('')}</div>
      <div class="row">
        <input id="dep" type="number" placeholder="Valor (R$)" min="25" inputmode="decimal" aria-label="Valor do deposito">
        <button id="btnDep">Gerar PIX</button>
      </div>
      <div id="pixBox"></div>
    </section>

    <section class="card">
      <h2>Sacar</h2>
      <div class="row"><input id="wd" type="number" placeholder="Valor (R$)" min="100" inputmode="decimal" aria-label="Valor do saque"></div>
      <div class="row"><input id="pix" placeholder="Chave PIX (CPF, e-mail, telefone ou aleatoria)" autocomplete="off" aria-label="Chave PIX"></div>
      <div class="row">
        <input id="cpf" placeholder="CPF do titular" inputmode="numeric" autocomplete="off" aria-label="CPF do titular">
        <button id="btnWd">Sacar</button>
      </div>
    </section>

    <p id="wmsg" class="msg" role="status"></p>

    <section class="card">
      <h2>Jogo justo <small class="ok-tag">provably fair</small></h2>
      <p class="hint">O resultado de cada round e definido por sua seed + a seed do servidor (cujo hash voce ve antes de jogar). Ao trocar a seed, a do servidor e revelada e voce confere tudo aqui, no seu navegador.</p>
      <div id="fairBox"><p class="hint">Carregando…</p></div>
      <details class="hist">
        <summary>Historico de rounds</summary>
        <ul id="history" class="ledger"></ul>
      </details>
    </section>

    <section class="card">
      <h2>Extrato</h2>
      <ul id="ledger" class="ledger"><li class="hint">Carregando…</li></ul>
    </section>
    <p class="legal">Proibido para menores de 18 anos. Jogue com responsabilidade.</p>`;

  const wmsg = (t) => { $('#wmsg').textContent = t; };
  const fillChip = (wrap, input) => { $(wrap).onclick = (e) => { const v = e.target.dataset?.v; if (v) { $(input).value = v; Sound.click(); } }; };
  fillChip('#betChips', '#bet');
  fillChip('#depChips', '#dep');

  $('#logout').onclick = async () => { await Api.logout(); state.user = null; scene?.destroy(); scene = null; screenAuth(); };
  $('#btnStart').onclick = (e) => once(e.target, startRound);
  $('#btnPractice').onclick = () => practice();
  setupKid();
  setupStage();

  $('#btnDep').onclick = (e) => once(e.target, async () => {
    try {
      const r = await Api.deposit(reais('#dep'));
      renderCharge(r.charge);
      setBalance(r.balanceCents);
      if (r.charge.status === 'pending') pollCharge(r.charge.id);
      else refreshLedger();
    } catch (err) { handleErr(err, wmsg); }
  });

  $('#btnWd').onclick = (e) => once(e.target, async () => {
    try {
      const r = await Api.withdraw(reais('#wd'), $('#pix').value, $('#cpf').value);
      setBalance(r.balanceCents);
      $('#cpf').value = ''; // nao deixa CPF na tela
      wmsg(`Saque de ${brl(r.withdrawal.amountCents)} ${r.withdrawal.status === 'paid' ? 'enviado' : 'em processamento'} para ${r.withdrawal.pixKeyMask}.`);
      refreshLedger();
    } catch (err) { handleErr(err, wmsg); }
  });

  // retoma round aberto (ex.: recarregou a pagina no meio da partida)
  try {
    const a = await Api.active();
    if (a.round) { state.round = a.round; resumeOpen(a.round); }
    else idleHud();
  } catch { idleHud(); }
  refreshLedger();
  refreshFair();
}

// ---------- Jogo justo ----------
async function refreshFair() {
  const box = $('#fairBox'); if (!box) return;
  try {
    const f = await Api.fair();
    box.innerHTML = `
      <dl class="fair">
        <dt>Hash da seed do servidor (ativa)</dt><dd class="mono">${esc(f.active.serverSeedHash)}</dd>
        <dt>Sua seed</dt><dd class="mono">${esc(f.active.clientSeed)}</dd>
        <dt>Proximo nonce</dt><dd>${Number(f.active.nextNonce)}</dd>
      </dl>
      <div class="row">
        <input id="clientSeed" placeholder="Nova seed (letras, numeros, _ ou -)" maxlength="64" aria-label="Nova seed">
        <button id="btnSeed">Trocar seed</button>
      </div>
      <button id="btnRotate" class="link">revelar seed do servidor e gerar nova</button>
      ${f.previous ? `
        <div class="revealed">
          <p><b>Seed anterior revelada</b> (${Number(f.previous.roundsPlayed)} rounds)</p>
          <dl class="fair">
            <dt>Seed do servidor</dt><dd class="mono">${esc(f.previous.serverSeed)}</dd>
            <dt>Hash publicado antes</dt><dd class="mono">${esc(f.previous.serverSeedHash)}</dd>
            <dt>Sua seed</dt><dd class="mono">${esc(f.previous.clientSeed)}</dd>
          </dl>
        </div>` : ''}
      <p id="fmsg" class="msg"></p>`;
    const fmsg = (t) => { $('#fmsg').textContent = t; };
    $('#btnSeed').onclick = (e) => once(e.target, async () => {
      try { await Api.setClientSeed($('#clientSeed').value); await refreshFair(); $('#fmsg').textContent = 'Seed trocada. A seed anterior do servidor foi revelada.'; }
      catch (err) { handleErr(err, fmsg); }
    });
    $('#btnRotate').onclick = (e) => once(e.target, async () => {
      try { await Api.rotateSeed(); await refreshFair(); $('#fmsg').textContent = 'Seed revelada. Confira seus rounds no historico.'; }
      catch (err) { handleErr(err, fmsg); }
    });
  } catch (err) { if (err.status === 401) handleErr(err, () => {}); }
  refreshHistory();
}

async function refreshHistory() {
  const el = $('#history'); if (!el) return;
  try {
    const { rounds } = await Api.history();
    el.innerHTML = rounds.length ? rounds.map((r, i) => `
      <li>
        <span>#${Number(r.nonce)} · ${esc(END_LABEL[r.endReason] || r.state)} em ${fmtX(r.multiplier)} · vento ${r.wind ? fmtX(r.wind) : '?'}</span>
        <span class="${r.state === 'cashed' ? 'pos' : 'neg'}">${brl((r.prizeCents || 0) - r.betCents)}</span>
        <small>${r.serverSeed ? `<button class="link" data-verify="${i}">verificar</button> <span id="v${i}"></span>` : 'seed ainda secreta — troque a seed para verificar'}</small>
      </li>`).join('') : '<li class="hint">Nenhum round ainda.</li>';
    el.onclick = async (e) => {
      const i = e.target.dataset?.verify; if (i === undefined) return;
      const r = rounds[Number(i)];
      const out = $(`#v${i}`);
      try {
        const v = await windPoint({ serverSeed: r.serverSeed, clientSeed: r.clientSeed, nonce: r.nonce, rtpBps: Math.round(state.lobby.rtpPct * 100), maxMultX100: Math.round(state.lobby.maxMult * 100) });
        const ok = v.serverSeedHash === r.serverSeedHash && v.windX100 === Math.round(r.wind * 100);
        out.textContent = ok ? `OK: hash confere; vento em ${fmtX(v.windX100 / 100)}.` : 'DIVERGENTE: entre em contato com o suporte.';
        const hashOk = ok, consistent = ok;
        out.className = hashOk && consistent ? 'pos' : 'neg';
      } catch { out.textContent = 'Verificacao indisponivel neste navegador (requer HTTPS).'; }
    };
  } catch {}
}

// ---------- Deposito ----------
function renderCharge(c) {
  const label = { pending: 'Aguardando pagamento', paid: 'Pago', expired: 'Expirado', review: 'Em analise' }[c.status] || c.status;
  $('#pixBox').innerHTML = `
    <div class="pix">
      <p>${brl(c.amountCents)} — <b>${esc(label)}</b></p>
      ${c.status === 'pending' && c.copyPaste ? `
        <textarea readonly rows="2" id="pixCode">${esc(c.copyPaste)}</textarea>
        <button id="btnCopy" class="link">copiar codigo PIX</button>` : ''}
    </div>`;
  const copy = $('#btnCopy');
  if (copy) copy.onclick = () => navigator.clipboard?.writeText($('#pixCode').value);
}

async function pollCharge(id, tries = 0) {
  if (tries > 120 || !$('#pixBox')) return; // ~10 min a cada 5s
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const r = await Api.depositStatus(id);
    renderCharge(r.charge);
    if (r.charge.status === 'pending') return pollCharge(id, tries + 1);
    setBalance(r.balanceCents);
    refreshLedger();
  } catch { pollCharge(id, tries + 1); }
}

// ---------- Jogo ----------
function setupStage() {
  demo();
  document.querySelectorAll('#skinPick .swatch').forEach((b) => {
    const k = SKINS.find((s) => s.id === b.dataset.skin);
    b.style.setProperty('--a', k.c[0]); b.style.setProperty('--b', k.c[1]);
  });
  $('#mapPick').onclick = (e) => {
    const m = e.target.dataset?.map; if (!m || state.round) return;
    prefs.map = m; savePrefs(); Sound.click(); demo();
    document.querySelectorAll('#mapPick .chip').forEach((b) => b.classList.toggle('on', b.dataset.map === m));
  };
  $('#skinPick').onclick = (e) => {
    const k = e.target.dataset?.skin; if (!k) return;
    prefs.skin = k; savePrefs(); Sound.click();
    document.querySelectorAll('#skinPick .swatch').forEach((b) => b.classList.toggle('on', b.dataset.skin === k));
  };
  $('#mute').onclick = (e) => { const m = Sound.toggle(); e.target.textContent = m ? 'som: off' : 'som: on'; if (m) { Sound.music(false); speechSynthesis?.cancel(); } else if (scene && !scene.demo) Sound.music(true); };
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
}

/** Rivais voando ao fundo enquanto o jogador esta no lobby. */
function demo() {
  scene?.destroy();
  scene = new Combat($('#stage'), { demo: true, map: prefs.map });
}

function idleHud() {
  $('#hudMult').textContent = '';
  $('#hudInfo').textContent = 'Escolha a aposta e solte a pipa';
  $('#setup').hidden = false;
  $('#hp').hidden = true;
}

function hud(g) {
  $('#hudMult').textContent = fmtX(g.multiplier);
  $('#hudInfo').textContent = g.cashoutCents ? `Recolher agora: ${brl(g.cashoutCents)}` : `Aposta ${brl(g.betCents)} · corte uma pipa`;
  const cash = $('#btnCash');
  if (cash) { cash.disabled = !g.cashoutCents; cash.textContent = g.cashoutCents ? `Recolher ${brl(g.cashoutCents)}` : 'Recolher'; }
}

async function startRound() {
  Sound.unlock();
  try {
    const r = await Api.start(reais('#bet'), prefs.map);
    state.round = r.round; setBalance(r.balanceCents);
    play(r.round);
    refreshLedger();
  } catch (err) { handleErr(err, (t) => { $('#game').innerHTML = `<p class="msg">${esc(t)}</p>`; }); }
}

/** Partida: o motor roda no cliente; cada corte vai ao servidor, em fila. */
function play(round) {
  $('#setup').hidden = true;
  $('#hp').hidden = false;
  $('#game').innerHTML = `
    <div class="controls">
      <button id="btnDash">Relada</button>
      <button id="btnCash" class="cash" disabled>Recolher</button>
    </div>
    <p id="gmsg" class="msg"></p>`;
  hud(round);
  let queue = Promise.resolve(), ended = false, lastSent = 0;
  const finish = (html, delay) => { if (ended) return; ended = true; setTimeout(() => endGame(html), delay); };

  scene?.destroy();
  scene = new Combat($('#stage'), {
    map: round.map, skin: prefs.skin, kid: prefs.kid,
    onCut: (kind) => {
      Sound.cut();
      narrateCut(kind);
      queue = queue.then(async () => {
        if (ended) return;
        const wait = 270 - (Date.now() - lastSent); // respeita o intervalo minimo do servidor
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastSent = Date.now();
        try {
          const r = await Api.cut(round.id, kind);
          state.round = r.round;
          if (r.wind) {
            Sound.lose(); Sound.music(false); Sound.say('O vento virou!', true); scene.windTurn(fmtX(r.round.wind));
            finish(`<p class="lose">O vento virou em ${fmtX(r.round.wind)}! Voce estava em ${fmtX(r.round.multiplier)}.</p>`, 2200);
          } else { hud(r.round); scene.say(fmtX(r.round.multiplier), scene.w / 2, scene.h * 0.18, '#86efac', 1.2); }
        } catch (err) { if (err.code === 'ROUND_CLOSED') finish('<p class="lose">Round encerrado.</p>', 300); }
      });
    },
    onPlayerCut: () => {
      Sound.lose(); Sound.music(false); Sound.say('Cortaram sua pipa!', true);
      queue = queue.then(() => Api.lose(round.id, 'cut').catch(() => {}));
      finish(`<p class="lose">Cortaram sua pipa! Perdeu ${brl(round.betCents)}.</p>`, 1800);
    },
    onEvent: (type, data) => {
      narrateEvent(type, data);
      if (type === 'wave') $('#hudInfo').textContent = data % 5 === 0 ? `ONDA ${data} · CHEFAO!` : `ONDA ${data}`;
      if (type === 'dash' || type === 'hit') Sound.whoosh();
      if (type === 'power') Sound.click();
    },
    onTick: (g) => {
      const p = g.player;
      if (p) $('#hpFill').style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
      const d = $('#btnDash');
      if (d) { d.disabled = g.dashCd > 0 || g.over; d.textContent = g.dashCd > 0 ? `Relada ${Math.ceil(g.dashCd)}s` : 'Relada'; }
    },
  });
  Sound.launch(); Sound.music(true);
  $('#btnDash').onclick = () => scene.dash();
  $('#btnCash').onclick = () => once(null, async () => {
    if (ended) return;
    $('#btnCash').disabled = true;
    await queue; // garante que todos os cortes ja foram registrados
    if (ended) return;
    try {
      const r = await Api.cashout(round.id);
      ended = true; setBalance(r.balanceCents); Sound.music(false); Sound.cashout(); Sound.say('Recolheu! Boa!', true); scene.reelIn();
      scene.say(`+${brl(r.prizeCents)}`, scene.w / 2, scene.h * 0.35, '#fde047', 1.5);
      setTimeout(() => endGame(`<p class="win">Recolheu ${brl(r.prizeCents)} (${fmtX(r.round.multiplier)}). O vento viraria em ${fmtX(r.round.wind)}.</p>`), 1400);
    } catch (err) { handleErr(err, (t) => { $('#gmsg').textContent = t; }); hud(state.round); }
  });
}

// ---------- Treino ----------
/** Partida sem aposta e sem servidor, com rivais mais faceis para aprender. */
function practice() {
  Sound.unlock();
  $('#setup').hidden = true;
  $('#hp').hidden = false;
  $('#game').innerHTML = `
    <p class="hint">Treino: rivais mais fracos que no jogo valendo. Nada e apostado.</p>
    <div class="controls">
      <button id="btnDash">Relada</button>
      <button id="btnStop">Parar treino</button>
    </div>`;
  let cuts = 0;
  $('#hudMult').textContent = 'TREINO';
  $('#hudInfo').textContent = '0 cortes';
  scene?.destroy();
  scene = new Combat($('#stage'), {
    map: prefs.map, skin: prefs.skin, kid: prefs.kid, practice: true,
    onCut: (kind) => { Sound.cut(); narrateCut(kind); cuts++; $('#hudInfo').textContent = `${cuts} corte(s)`; },
    onPlayerCut: () => { Sound.lose(); Sound.music(false); Sound.say('Cortaram sua pipa!', true); setTimeout(() => endGame(`<p class="lose">Treino encerrado: ${cuts} corte(s). Agora e so treinar mais!</p>`), 1800); },
    onEvent: (type, data) => { narrateEvent(type, data); if (type === 'wave') $('#hudInfo').textContent = `ONDA ${data} · ${cuts} corte(s)`; },
    onTick: (g) => {
      if (g.player) $('#hpFill').style.width = `${Math.max(0, (g.player.hp / g.player.maxHp) * 100)}%`;
      const d = $('#btnDash'); if (d) { d.disabled = g.dashCd > 0 || g.over; d.textContent = g.dashCd > 0 ? `Relada ${Math.ceil(g.dashCd)}s` : 'Relada'; }
    },
  });
  Sound.launch(); Sound.music(true);
  $('#btnDash').onclick = () => scene.dash();
  $('#btnStop').onclick = () => endGame(`<p class="msg">Treino encerrado: ${cuts} corte(s).</p>`);
}

// ---------- Narracao ----------
let streak = { n: 0, t: 0 };
function narrateCut(kind) {
  const now = Date.now();
  streak = now - streak.t < 2200 ? { n: streak.n + 1, t: now } : { n: 1, t: now };
  if (kind === 'chefe') return Sound.say('Chefao no chao!', true);
  if (kind === 'aparar') return Sound.say('Aparou!');
  if (streak.n >= 2) return Sound.say(['', '', 'Corte duplo!', 'Corte triplo!'][streak.n] || 'Massacre no ceu!', true);
  Sound.say(['Cortou!', 'No grau!', 'La se vai!', 'Manda buscar!'][Math.floor(Math.random() * 4)]);
}
function narrateEvent(type, data) {
  if (type === 'wave') Sound.say(data % 5 === 0 ? `Onda ${data}. Cuidado, chefao!` : `Onda ${data}!`, true);
  if (type === 'power') Sound.say({ vento: 'Vento a favor!', ouro: 'Linha de ouro!', escudo: 'Escudo!' }[data]);
  if (type === 'gust') Sound.say('Rajada de vento!');
}

// ---------- Bonequinho ----------
function setupKid() {
  document.querySelectorAll('#kidOpts .dot').forEach((b) => b.style.setProperty('--c', b.dataset.v));
  const draw = () => {
    const c = $('#kidPreview'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    drawKid(ctx, 60, 140, 40, prefs.kid, performance.now() / 1000, Date.now() < partyUntil ? 'festa' : 'linha');
    if (Date.now() < partyUntil + 50 && c.isConnected) requestAnimationFrame(draw);
  };
  let partyUntil = 0;
  draw();
  $('#kidOpts').onclick = (e) => {
    if (e.target.id === 'kidRandom') prefs.kid = randomKid();
    else {
      const row = e.target.closest('.kid-row'), v = e.target.dataset?.v;
      if (!row || !v) return;
      prefs.kid = { ...prefs.kid, [row.dataset.k]: v };
      if (row.dataset.k === 'camisa') prefs.kid.cor2 = KID_OPTS.camisa[(KID_OPTS.camisa.indexOf(v) + 3) % KID_OPTS.camisa.length];
    }
    savePrefs(); Sound.click(); partyUntil = Date.now() + 1500; draw();
    document.querySelectorAll('#kidOpts .kid-row').forEach((r) => r.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', prefs.kid[r.dataset.k] === b.dataset.v)));
  };
}

/** Round aberto apos recarregar: a partida nao pode ser retomada, so encerrada. */
function resumeOpen(g) {
  $('#setup').hidden = true;
  hud(g);
  $('#game').innerHTML = `
    <p class="msg">Voce tem um round em andamento (${fmtX(g.multiplier)}).</p>
    <div class="controls">
      <button id="btnCash" class="cash" ${g.cashoutCents ? '' : 'disabled'}>Recolher ${g.cashoutCents ? brl(g.cashoutCents) : ''}</button>
      <button id="btnQuit">Desistir</button>
    </div>`;
  $('#btnCash').onclick = () => once(null, async () => {
    try { const r = await Api.cashout(g.id); setBalance(r.balanceCents); endGame(`<p class="win">Recolheu ${brl(r.prizeCents)}.</p>`); }
    catch (err) { handleErr(err, () => {}); }
  });
  $('#btnQuit').onclick = () => once(null, async () => { await Api.lose(g.id, 'forfeit').catch(() => {}); endGame('<p class="lose">Round encerrado.</p>'); });
}

function endGame(html) {
  Sound.music(false);
  state.round = null;
  $('#game').innerHTML = html;
  idleHud();
  demo();
  refreshLedger();
  refreshFair();
}

// ---------- Extrato ----------
const END_LABEL = { cashed: 'recolheu', wind: 'vento virou', cut: 'cortaram', forfeit: 'desistiu' };
const LEDGER_LABEL = {
  deposit: 'Deposito', withdraw: 'Saque', withdraw_reversal: 'Estorno de saque',
  bet: 'Aposta', prize: 'Premio', bonus: 'Bonus',
};

async function refreshLedger() {
  const el = $('#ledger'); if (!el) return;
  try {
    const w = await Api.wallet();
    setBalance(w.balanceCents);
    el.innerHTML = w.ledger.length ? w.ledger.map((l) => `
      <li>
        <span>${esc(LEDGER_LABEL[l.type] || l.type)}${l.pixKeyMask ? ` <small>${esc(l.pixKeyMask)}</small>` : ''}</span>
        <span class="${l.deltaCents < 0 ? 'neg' : 'pos'}">${brl(l.deltaCents)}</span>
        <small>${new Date(l.at).toLocaleString('pt-BR')}</small>
      </li>`).join('') : '<li class="hint">Sem movimentacoes.</li>';
  } catch (err) { if (err.status === 401) handleErr(err, () => {}); }
}

// ---------- helpers ----------
/** Multiplicador no formato brasileiro: 1,28x */
const fmtX = (m) => `${m.toFixed(2).replace(".", ",")}x`;

/** Converte "12,50" ou "12.50" em centavos inteiros. */
const reais = (sel) => {
  const v = String($(sel).value || '0').replace(',', '.');
  return Math.round(parseFloat(v) * 100) || 0;
};

boot();
