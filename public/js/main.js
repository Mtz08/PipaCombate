/* Pipa Combate — motor, entrada, render, lobby de aposta, personagem e telas.
   Saldo real em centavos. O servidor e' a autoridade: cada corte e' registrado
   la, um a um (ver Api.cut), e e' ele quem decide quando o vento vira e quanto
   paga. Os rivais tem a mesma forca em toda rodada. */
import { money, SKINS, ENEMIES, ENEMY_LOOKS, THIEF_LOOK, CUTTER_LOOK, BOSSES, NOMES, MAPS, POW, POW_BAG,
  PELES, CORES, CORES_CABELO, KID, randomKid, CUT_TXT, STREAK_TXT } from './data.js?v=d21';
import { P, save as savePrefs, rerollKid, skinById, mapById } from './store.js?v=d21';
import { Sound } from './audio.js?v=d21';
import * as Art from './art.js?v=d21';
import { Api, Auth } from './api.js?v=d21';
import { windPoint } from './game/fair.js';

/* =========================================================
   UTIL
   ========================================================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const KINDS = ['moleque', 'veloz', 'aparador', 'pesadao', 'cortador', 'chefe', 'aparar'];
const KIND_NOME = { moleque: 'Moleque', veloz: 'Veloz', aparador: 'Aparador', pesadao: 'Pesadão', cortador: 'Cortador', chefe: 'Chefão', aparar: 'Aparar pipa' };
const DMG = 30;
const PENDING_KEY = 'pipacombate_pending';

function vib(p) { if (P.opt.vib && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }
function calcWin(stake, counts, cfg) {
  let pct = 0;
  for (const k of KINDS) pct += (counts[k] || 0) * (cfg.pct[k] || 0);
  return { pct, win: Math.min(Math.floor(stake * (100 + pct) / 100), stake * Math.max(1, cfg.cap)) };
}
const pixel = () => P.opt.style === 'pixel';
const TF = () => pixel() ? "'Press Start 2P', monospace" : "'Lilita One', sans-serif";
const TK = () => pixel() ? .55 : 1;   // fonte pixel é larga

/* =========================================================
   PALCO / CENÁRIO (jogo em pé: no desktop vira uma coluna central)
   ========================================================= */
const app = $('#app');
// foco em campo de texto rola containers com overflow:hidden e empurra a tela pra cima: trava
for (const el of [app, ...document.querySelectorAll('.sheet, .screen:not(.center)')]) el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) el.scrollTop = el.scrollLeft = 0; });
const cvs = $('#game'), ctx = cvs.getContext('2d');
let dprCap = 9;
let W = 0, H = 0, AX = 0, AY = 0, DPR = 1, SC = 1, FIG = 1, HAND = 44, skyTop = 120, skyBot = 400, safeTop = 0;
let mapDef = mapById(P.map), city = null, bg = null;
let clouds = [], farKites = [], birds = [], rain = [], confetti = [];
let glowSprite = null;

function resize() {
  const r = app.getBoundingClientRect();
  W = r.width; H = r.height; AX = r.left; AY = r.top;
  const dpr = window.devicePixelRatio || 1;
  DPR = pixel() ? clamp(210 / W, .22, 1) : Math.min(dpr, P.opt.fx === 'baixo' ? 1 : (isTouch ? 1.6 : 2), dprCap);
  cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR);
  cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
  document.body.classList.toggle('pixel', pixel());
  SC = clamp(Math.min(W, H) / 680, .66, 1.05);
  FIG = SC * 1.3;
  HAND = 36 * FIG;
  safeTop = $('#sa').offsetHeight || 0;
  skyTop = safeTop + 112;
  Art.clearCache(); figCache = new WeakMap(); textCache.clear();
  buildScene();
}
function buildScene() {
  city = Art.genCity(mapDef, W, H, SC);
  bg = Art.buildBackground(mapDef, W, H, DPR, SC, city);
  skyBot = Math.max(skyTop + 160, H - city.max - 64 * SC);
  initAmbient();
}
function setMap(id) {
  P.map = id; savePrefs();
  mapDef = mapById(id);
  buildScene();
  if (run && run.demo) demoRun();
  Sound.rain(mapDef.storm ? 1 : 0);
  updMapTag();
}
function anchor(frac) { const x = frac * W; return { x, y: city.roofAt(x) - HAND }; }

function initAmbient() {
  clouds = [];
  for (let i = 0; i < (mapDef.storm ? 9 : 7); i++) clouds.push({ x: rnd(-150, W), y: rnd(H * .05, H * .42), s: rnd(.6, 1.5), v: rnd(4, 12), far: Math.random() < .5 });
  farKites = [];
  if (!mapDef.storm) for (let i = 0; i < 5; i++) farKites.push({ x: rnd(0, W), y: rnd(skyTop, skyBot - 30), s: rnd(.2, .34) * SC, ph: rnd(0, 6), look: pick(ENEMY_LOOKS) });
  birds = []; rain = [];
  if (mapDef.storm) for (let i = 0; i < (P.opt.fx === 'alto' ? 130 : 50); i++) rain.push({ x: rnd(0, W), y: rnd(-H, H), v: rnd(750, 1050), l: rnd(10, 22) });
  const g = document.createElement('canvas'); g.width = g.height = 128;
  const gc = g.getContext('2d'), gr = gc.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,200,.55)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
  gc.fillStyle = gr; gc.fillRect(0, 0, 128, 128); glowSprite = g;
}

/* =========================================================
   ESTADO
   ========================================================= */
let state = 'auth';          // auth | lobby | play | pause | ending | result
let run = null;
let acct = null;
let busy = false;
const hero = { tail: [], x: 0, y: 0, ang: 0, danceT: -9, nextDance: 6, act: '', at: 0, nextAct: 3, bubble: null };

/* =========================================================
   ENTRADA
   ========================================================= */
const inp = { dragId: null, lx: 0, ly: 0, keys: {}, joy: null };
const playing = () => state === 'play' && run && !run.demo;
const px = e => e.clientX - AX, py = e => e.clientY - AY;
function clampAim() { run.aim.x = clamp(run.aim.x, 20, W - 20); run.aim.y = clamp(run.aim.y, skyTop, skyBot); }
function aimDirect(e) { run.aim.x = px(e); run.aim.y = py(e) - (e.pointerType === 'touch' ? 80 * SC : 0); clampAim(); }
cvs.addEventListener('pointerdown', e => {
  Sound.init();
  if (!playing()) return;
  if (e.pointerType === 'mouse') { if (e.button === 2) dash(); else aimDirect(e); return; }
  if (inp.dragId !== null) return;
  inp.dragId = e.pointerId; inp.lx = e.clientX; inp.ly = e.clientY;
  if (P.opt.ctrl === 'dedo') aimDirect(e);
  if (P.opt.ctrl === 'joystick') inp.joy = { bx: px(e), by: py(e), dx: 0, dy: 0 };
});
window.addEventListener('pointermove', e => {
  if (!playing()) return;
  if (e.pointerType === 'mouse') { aimDirect(e); return; }
  if (e.pointerId !== inp.dragId) return;
  if (P.opt.ctrl === 'dedo') aimDirect(e);
  else if (P.opt.ctrl === 'joystick' && inp.joy) {
    let dx = px(e) - inp.joy.bx, dy = py(e) - inp.joy.by; const d = Math.hypot(dx, dy), R = 60;
    if (d > R) { dx *= R / d; dy *= R / d; }
    inp.joy.dx = dx / R; inp.joy.dy = dy / R;
  } else { run.aim.x += (e.clientX - inp.lx) * P.opt.sens; run.aim.y += (e.clientY - inp.ly) * P.opt.sens; clampAim(); }
  inp.lx = e.clientX; inp.ly = e.clientY;
});
const endDrag = e => { if (e.pointerId === inp.dragId) { inp.dragId = null; inp.joy = null; } };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
cvs.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
/* o navegador só deixa tocar som depois de um toque/clique: tenta em todo gesto até o funk rolar */
const UNLOCK = ['pointerup', 'touchend', 'click', 'keydown'];
function unlockAudio() { Sound.init(); setTimeout(updSoundHint, 80); }
UNLOCK.forEach(ev => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
function updSoundHint() {
  const ms = Sound.musicState();
  const ok = (Sound.running() && (ms.on || ms.failed || !P.opt.music)) || (!P.opt.music && !P.opt.sfx);
  const el = $('#soundHint');
  if (el.classList.contains('hidden') !== ok) el.classList.toggle('hidden', ok);
  if (ok && Sound.running() && (ms.on || !P.opt.music)) UNLOCK.forEach(ev => document.removeEventListener(ev, unlockAudio, { capture: true }));
}
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.target.tagName === 'INPUT') return;
  inp.keys[k] = true;
  if (k === ' ' && playing()) { e.preventDefault(); dash(); }
  if (k === 'enter' && playing()) cashOut(false);
  if (k === 'escape' || k === 'p') { if (state === 'play') pause(); else if (state === 'pause') resume(); }
});
window.addEventListener('keyup', e => { inp.keys[e.key.toLowerCase()] = false; });

/* =========================================================
   ENTIDADES
   ========================================================= */
function makeKite(o) {
  const k = Object.assign({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, ang: 0, spd: 0, hp: 100, maxHp: 100, str: 1, alive: true,
    tail: [], pts: [], contact: null, inv: 0, launch: 1, seed: Math.random() * 10, frac: .5, flash: 0, lastContact: -9,
    s: SC, dir: 1, cele: 0, celeT: 0 }, o);
  for (let i = 0; i <= 10; i++) k.pts.push({ x: k.x, y: k.y });
  return k;
}
const botKid = look => randomKid({ cor1: look.c1, cor2: look.c2 === look.c1 ? '#111827' : look.c2 });
function playerKid() { return P.kid; }

function enemySpec(type, n) {
  const T = ENEMIES[type], m = Math.min(n, 16), d = mapDef.diff;
  const F = (run && run.forca) || 1, SF = 1 + (F - 1) * .6;   // vida x F, dano x SF
  return { type, name: pick(NOMES), hp: (60 + m * 7 + rnd(0, 15)) * T.hp * d * F,
    str: clamp((.6 + m * .04 + rnd(-.05, .08)) * T.str * Math.sqrt(d), .45, 1.8) * SF,
    K: (14 + m * 1.1 + rnd(0, 4)) * T.spd, maxV: (330 + m * 16) * T.spd, agg: clamp((.25 + m * .05) * T.agg, .08, .92),
    relA: (60 + m * 6) * T.rel, relF: (5 + m * .35) * T.rel,
    look: T.thief ? THIEF_LOOK : T.redline ? CUTTER_LOOK : pick(ENEMY_LOOKS), shape: T.shape, sc: T.sc, thief: !!T.thief, redline: !!T.redline };
}
function bossSpec(n) {
  const B = BOSSES[(Math.floor(n / 5) - 1) % BOSSES.length], d = mapDef.diff;
  const F = (run && run.forca) || 1, SF = 1 + (F - 1) * .6;
  return { type: 'chefe', bossDef: B, boss: true, name: B.nome, hp: B.hp * (1 + n * .05) * d * F, str: B.str * (1 + n * .015) * Math.sqrt(d) * SF,
    K: 26 * B.spd, maxV: 560 * B.spd, agg: .9, relA: 150, relF: 9, look: B.look, shape: B.shape, sc: 1.35 };
}
function pickType(n) {
  const bag = [];
  for (const k in ENEMIES) if (ENEMIES[k].from <= n) for (let i = 0; i < (k === 'moleque' ? 5 : 2); i++) bag.push(k);
  return pick(bag);
}
function freeFrac() {
  const used = run.bots.map(b => b.frac).concat(run.figs.map(f => f.frac));
  for (let i = 0; i < 40; i++) {
    const f = rnd(.07, .93);
    if (Math.abs(f - .5) < .13) continue;
    if (used.every(u => Math.abs(u - f) > .09)) return f;
  }
  return Math.random() < .5 ? rnd(.07, .35) : rnd(.65, .93);
}
const warmQ = [];
function warmSprites() {
  for (let i = 0; i < 1 && warmQ.length; i++) { const [kid, dir, foco, pose] = warmQ.shift(); figSprite(kid, dir, foco, pose); }
}
function spawnBot(spec) {
  const frac = freeFrac(), a = anchor(frac);
  const b = makeKite(Object.assign({}, spec, { spec, frac, x: a.x, y: a.y - 10, tx: a.x + rnd(-120, 120), ty: rnd(skyTop + 20, skyBot - 40),
    maxHp: spec.hp, s: SC * spec.sc, launch: 1.4, ai: { t: rnd(1, 2), mode: 'wander', ph: 0, cx: 0, cy: 0, inC: false },
    kid: spec.kid || botKid(spec.look), sumT: 11, gustT: 9 }));
  run.bots.push(b);
  return b;
}
function spawnPlayer() {
  const a = anchor(.5), sk = skinById(P.skin);
  run.player = makeKite({ isPlayer: true, frac: .5, x: a.x, y: a.y - 20, look: sk, shape: sk.shape, s: SC, inv: 1.5, launch: .6, ghosts: [] });
  run.aim.x = a.x; run.aim.y = lerp(skyTop, skyBot, .45);
}

/* =========================================================
   MUNDO
   ========================================================= */
function newRun(demo) {
  return { demo, time: 0, real: 0, wave: 0, bots: [], falling: [], parts: [], texts: [], powers: [], figs: [], streaks: [], snaps: [],
    player: null, aim: { x: W / 2, y: H * .35 }, queue: [], maxAlive: 1, spawnT: 1, powerT: rnd(9, 13),
    gust: null, gustF: 0, gustT: rnd(16, 26), waveClearT: 0, overT: 0, shake: 0, slowT: 0, slowK: 1,
    wind: mapDef.wind, flashT: 0, whiteT: 0, boltT: rnd(5, 10), bolt: null, birdT: rnd(3, 8), cam: null, impact: null,
    dashT: 0, dashCd: 0, streak: 0, streakT: -9, boss: null, pCele: 0, pCeleT: 0, ending: false, flapT: 0,
    cuts: 0, counts: Object.fromEntries(KINDS.map(k => [k, 0])), bet: null, practice: false,
    bubbles: [], reelA: 0, idle: { act: '', at: 0, next: rnd(5, 8) }, pLaunchT: 0, pSadT: 0,
    buffs: { vento: 0, ouro: 0, escudo: 0 }, tips: null };
}
function demoRun() {
  run = newRun(true);
  for (let i = 0; i < 3; i++) {
    const b = spawnBot(enemySpec(pickType(4), 3));
    b.launch = 0; b.x = anchor(b.frac).x + rnd(-80, 80); b.y = rnd(skyTop, skyBot - 40);
  }
}
function waveList(n) {
  const list = [];
  if (n % 5 === 0) { list.push(bossSpec(n)); for (let i = 0; i < 1 + Math.floor(n / 5); i++) list.push(enemySpec(pickType(n), n)); }
  else for (let i = 0; i < Math.min(2 + n, 14); i++) list.push(enemySpec(pickType(n), n));
  return list;
}
function startWave(n) {
  const r = run;
  r.wave = n; r.queue = waveList(n);
  for (const sp of r.queue) { sp.kid = botKid(sp.look); for (const d of [1, -1]) warmQ.push([sp.kid, d, false], [sp.kid, d, true], [sp.kid, d, false, 'triste']); }
  const boss = n % 5 === 0;
  r.maxAlive = boss ? 3 : Math.min(1 + Math.ceil(n / 2), 4);
  r.spawnT = boss ? 2.2 : 1.2;
  if (boss) banner(`ONDA ${n}`, `⚠️ ${r.queue[0].name} vem aí`);
  else {
    const c = {};
    for (const s of r.queue) c[s.type] = (c[s.type] || 0) + 1;
    banner(`ONDA ${n}`, Object.entries(c).map(([k, v]) => `${v} ${ENEMIES[k].nome}${v > 1 ? 's' : ''}`).join(' · '));
  }
  if (n > 1 || !Sound.hasVoice('vai')) Sound.waveStart();
}
function waveClear() {
  const r = run;
  banner(`ONDA ${r.wave} LIMPA!`, 'Prepare-se para a próxima…');
  Sound.waveClear(); Sound.cheer(.7);
  r.waveClearT = 3;
  if (!r.boss) Sound.music('game');
}

/* =========================================================
   FÍSICA
   ========================================================= */
function physics(k, dt, K, C, maxV) {
  const r = run;
  const tx = clamp(k.tx + r.gustF * .45, 24, W - 24), ty = clamp(k.ty, skyTop, skyBot);
  k.vx += ((tx - k.x) * K - k.vx * C) * dt;
  k.vy += ((ty - k.y) * K - k.vy * C) * dt;
  k.vx += Math.sin(r.time * 1.3 + k.seed) * 18 * dt;
  const sp = Math.hypot(k.vx, k.vy);
  if (sp > maxV) { k.vx *= maxV / sp; k.vy *= maxV / sp; }
  k.x = clamp(k.x + k.vx * dt, 16, W - 16);
  k.y = clamp(k.y + k.vy * dt, skyTop - 30, skyBot + 24);
  const tgt = clamp(k.vx / 520, -.7, .7) + Math.sin(r.time * 2.2 + k.seed) * .06;
  k.ang += (tgt - k.ang) * Math.min(1, dt * 8);
  k.spd += (sp - k.spd) * Math.min(1, dt * 6);
  k.dir += (((k.x >= k.frac * W) ? 1 : -1) - k.dir) * Math.min(1, dt * 4);
}
function updLine(k) {
  const a = anchor(k.frac);
  const ex = k.x, ey = k.y + 2 * k.s, d = Math.hypot(ex - a.x, ey - a.y);
  const cx = (a.x + ex) / 2, cy = (a.y + ey) / 2 + d * .12, N = k.pts.length - 1;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    k.pts[i].x = u * u * a.x + 2 * u * t * cx + t * t * ex;
    k.pts[i].y = u * u * a.y + 2 * u * t * cy + t * t * ey;
  }
}
function rope(arr, hx, hy, n, seg, dt, grav) {
  if (!arr.length) for (let i = 0; i < n; i++) arr.push({ x: hx, y: hy + i * seg });
  arr[0].x = hx; arr[0].y = hy;
  const wind = run ? (run.wind * .6 + run.gustF * .5) : 8;
  for (let i = 1; i < arr.length; i++) {
    const p = arr[i], q = arr[i - 1];
    p.y += grav * dt; p.x -= wind * dt;
    const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
    p.x = q.x + dx / d * seg; p.y = q.y + dy / d * seg;
  }
}
function updTail(k, dt) {
  const L = Art.TAIL_Y[k.shape] * k.s;
  rope(k.tail, k.x - Math.sin(k.ang) * L, k.y + Math.cos(k.ang) * L, k.shape === 'capucheta' ? 8 : 14, 7 * k.s, dt, 70);
}
function segX(a, b, c, d) {
  const r1x = b.x - a.x, r1y = b.y - a.y, r2x = d.x - c.x, r2y = d.y - c.y;
  const den = r1x * r2y - r1y * r2x;
  if (!den) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * r2y - qy * r2x) / den, u = (qx * r1y - qy * r1x) / den;
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? { x: a.x + t * r1x, y: a.y + t * r1y } : null;
}
function lineHit(A, B) {
  for (let i = 1; i < A.length - 1; i++)
    for (let j = 1; j < B.length - 1; j++) { const p = segX(A[i], A[i + 1], B[j], B[j + 1]); if (p) return p; }
  return null;
}
const power = k => k.str * (.3 + Math.min(k.spd / 420, 1) * 1.1);

/* =========================================================
   IA
   ========================================================= */
function crossTarget(b, k) {
  const a = k.pts[0], e = k.pts[k.pts.length - 1], m = k.pts[Math.floor(k.pts.length * .6)];
  const lx = e.x - a.x, ly = e.y - a.y, L = Math.hypot(lx, ly) || 1, nx = -ly / L, ny = lx / L;
  const side = Math.sign((b.x - a.x) * nx + (b.y - a.y) * ny) || 1;
  b.tx = m.x - nx * side * 110; b.ty = m.y - ny * side * 110;
}
function botThink(b, dt, p) {
  const ai = b.ai;
  ai.t -= dt;
  b.cele = Math.max(0, b.cele - dt); b.celeT += dt; b.alertT = Math.max(0, (b.alertT || 0) - dt);
  if (b.boss) bossAbilities(b, dt, p);
  if (b.contact) {
    if (!ai.inC) { ai.inC = true; ai.cx = b.x; ai.cy = b.y; }
    ai.ph += dt * b.relF;
    b.tx = ai.cx + Math.sin(ai.ph) * b.relA;
    b.ty = ai.cy + Math.cos(ai.ph * 1.3) * b.relA * .6;
    if (b.hp < b.maxHp * .25 && !b.boss && Math.random() < dt * .7) { ai.mode = 'flee'; ai.t = 2; }
    if (ai.mode !== 'flee') return;
  } else ai.inC = false;
  if (b.thief) {
    let best = null, bd = 1e9;
    for (const f of run.falling) if (!f.caught && !f.stolen && f.y < skyBot + 30) { const d = dist(b, f); if (d < bd) { bd = d; best = f; } }
    if (best) {
      b.tx = best.x; b.ty = best.y;
      if (bd < 34 * b.s) {
        best.stolen = true;
        floatText(best.x, best.y - 20, 'ROUBOU!', '#fca5a5', 18, 1.1);
        burst(best.x, best.y, 10, ['#fca5a5', '#fff'], 140, .5, 2.5);
        Sound.steal();
      }
      return;
    }
  }
  if (ai.t <= 0) {
    const roll = Math.random();
    const others = run.bots.filter(o => o !== b && o.alive && !o.boss && !b.boss && o.launch <= 0);
    if (p && p.alive && p.launch <= 0 && roll < b.agg) { if (ai.target !== p || ai.mode !== 'attack') b.alertT = 1.1; ai.mode = 'attack'; ai.target = p; ai.t = rnd(2.5, 4.5); }
    else if (others.length && roll < b.agg + .18) { ai.mode = 'attack'; ai.target = pick(others); ai.t = rnd(2, 3.5); }
    else { ai.mode = 'wander'; ai.t = rnd(1.5, 3.5); b.tx = rnd(W * .08, W * .92); b.ty = rnd(skyTop + 10, skyBot - 10); }
  }
  if (ai.mode === 'attack') { if (ai.target && ai.target.alive) crossTarget(b, ai.target); else ai.t = 0; }
  else if (ai.mode === 'flee') { b.tx = b.x < W / 2 ? W * .06 : W * .94; b.ty = skyTop + 10; if (ai.t <= 0) ai.mode = 'wander'; }
}
function bossAbilities(b, dt, p) {
  const A = b.bossDef.abil;
  if (!b.enraged && A.includes('enrage') && b.hp < b.maxHp * .5) {
    b.enraged = true; b.K *= 1.3; b.maxV *= 1.25; b.relA *= 1.3; b.str *= 1.15;
    announce('ENFURECIDO!', 'red'); Sound.bossWarn(); run.shake = Math.max(run.shake, 8);
  }
  if (A.includes('summon')) {
    b.sumT -= dt;
    if (b.sumT <= 0) {
      b.sumT = b.enraged ? 9 : 13;
      if (run.bots.length < 5) { const m = spawnBot(enemySpec('moleque', run.wave)); floatText(anchor(m.frac).x, anchor(m.frac).y - 60, 'REFORÇO!', '#fca5a5', 18, 1.2); }
    }
  }
  if (A.includes('gust')) {
    b.gustT -= dt;
    if (b.gustT <= 0) { b.gustT = rnd(9, 13); startGust(p && p.alive ? (Math.sign(p.x - b.x) || 1) : pick([-1, 1]), 1.3); }
  }
}

/* =========================================================
   EFEITOS
   ========================================================= */
function burst(x, y, n, cols, sp = 220, life = .7, size = 3) {
  const cap = P.opt.fx === 'alto' ? 500 : 160;
  for (let i = 0; i < n && run.parts.length < cap; i++) {
    const a = Math.random() * Math.PI * 2, v = rnd(sp * .3, sp);
    run.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col: pick(cols), size: rnd(size * .6, size * 1.4) });
  }
}
function floatText(x, y, txt, col = '#fff', size = 22, life = 1.2) {
  x = clamp(x, 70, W - 70);
  for (let i = 0; i < 4; i++) { // não empilha texto em cima de texto
    const hit = run.texts.find(t => Math.abs(t.x - x) < 90 && Math.abs(t.y - y) < 24 && t.max - t.life < .6);
    if (!hit) break;
    y = hit.y - 28;
  }
  run.texts.push({ x, y, txt, col, size: size * Math.max(SC, .9), life, max: life });
}
const FALA_TXT = { vai: 'UM, DOIS... VAI!', buscar: 'MANDA BUSCAR!', saidai: 'SAI DAÍ, BRAÇO DE VIOLÃO!', dalinha: 'DÁ LINHA, MANÉ!' };
function bubble(frac, txt, col = '#1b1433') {
  const r = run; if (!r) return;
  r.bubbles = r.bubbles.filter(b => b.frac !== frac);
  if (r.bubbles.length >= 3) r.bubbles.shift();
  r.bubbles.push({ frac, txt, col, t: 1.6, max: 1.6 });
}
function drawBubbles() {
  for (const b of run.bubbles) {
    const a = anchor(b.frac), feet = city.roofAt(a.x), x = clamp(a.x - 19 * FIG * (a.x > W / 2 ? 1 : -1) * 0, 50, W - 50);
    const y = feet - 74 * FIG, age = b.max - b.t, k = age < .18 ? age / .18 : b.t < .3 ? b.t / .3 : 1;
    const sc = age < .18 ? .6 + .5 * Math.sin(k * Math.PI / 2) * 1.1 : 1;
    ctx.save(); ctx.translate(x, y - (1 - Math.min(1, age * 4)) * 6); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, k);
    ctx.font = `${Math.round(14 * TK())}px ${TF()}`;
    const w = ctx.measureText(b.txt).width + 16, h = 24;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1433'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 8, -h); ctx.arcTo(w / 2, -h, w / 2, 0, 8); ctx.arcTo(w / 2, 0, -w / 2, 0, 8);
    ctx.lineTo(4, 0); ctx.lineTo(-2, 8); ctx.lineTo(-6, 0); ctx.arcTo(-w / 2, 0, -w / 2, -h, 8); ctx.arcTo(-w / 2, -h, w / 2, -h, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = b.col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.txt, 0, -h / 2 + 1);
    ctx.restore();
  }
}
/* caixa de som na laje pulsando no grave */
function drawSpeaker(c, x, feet, s, beat) {
  const w = 16 * s, h = 22 * s, bx = x - w / 2, by = feet - h, pump = 1 + beat * .18;
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x, feet, w * .7, 2.6 * s, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1f2937'; c.strokeStyle = '#1b1433'; c.lineWidth = 1.8 * Math.min(s, 1.4);
  c.beginPath(); c.roundRect ? c.roundRect(bx, by, w, h, 2.5 * s) : c.rect(bx, by, w, h); c.fill(); c.stroke();
  c.fillStyle = '#374151'; c.beginPath(); c.arc(x, by + h * .64, 5.4 * s * pump, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#111827'; c.beginPath(); c.arc(x, by + h * .64, 2.2 * s * pump, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#374151'; c.beginPath(); c.arc(x, by + h * .24, 2.6 * s, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = `rgba(250,204,21,${.35 + beat * .6})`; c.fillRect(bx + 2 * s, by + 1.6 * s, 2.4 * s, 1.4 * s);
  if (beat > .35) { c.strokeStyle = `rgba(255,255,255,${(beat - .35) * 1.2})`; c.lineWidth = 1.2; for (let i = 1; i <= 2; i++) { c.beginPath(); c.arc(x, by + h * .64, (7 + i * 3.5) * s * (2 - beat), -.9, .9); c.stroke(); c.beginPath(); c.arc(x, by + h * .64, (7 + i * 3.5) * s * (2 - beat), Math.PI - .9, Math.PI + .9); c.stroke(); } }
}
function slowmo(dur, k) { run.slowT = Math.max(run.slowT, dur); run.slowK = Math.min(run.slowK, k); }
function confettiBurst(n = 90, y = H * .35) {
  const cols = ['#facc15', '#22c55e', '#38bdf8', '#f43f5e', '#a78bfa', '#fb923c', '#fff'];
  for (let i = 0; i < n; i++) confetti.push({ x: W / 2 + rnd(-60, 60), y, vx: rnd(-420, 420), vy: rnd(-640, -200), r: rnd(0, 6), vr: rnd(-8, 8), w: rnd(5, 10), h: rnd(3, 6), col: pick(cols), life: rnd(1.8, 3) });
}
function startGust(dir, k = 1) {
  run.gust = { t: 0, dur: 3.2, dir, force: 260 * mapDef.gust * k };
  announce(dir > 0 ? 'RAJADA →' : '← RAJADA', 'wind');
  Sound.gust();
}
function bolt() {
  run.flashT = .45;
  const x0 = rnd(W * .1, W * .9), pts = [{ x: x0, y: 0 }];
  let x = x0, y = 0;
  while (y < skyBot * .9) { y += rnd(20, 50); x += rnd(-30, 30); pts.push({ x, y }); }
  run.bolt = { pts, t: .18 };
  setTimeout(() => Sound.thunder(), 150 + Math.random() * 500);
}
/* corte cinematográfico: zoom rápido, flash, linhas de impacto, linha partida caindo */
function cinematic(k, hit, big) {
  const r = run;
  if (big) r.cam = { peak: 1.12, x: k.x, y: k.y, t: 0, dur: .5 };
  if (big) r.whiteT = .08;
  if (hit) {
    r.impact = { x: hit.x, y: hit.y, t: .32 };
    // pedaço de linha que fica preso na mão do dono e desaba
    const a = anchor(k.frac);
    let idx = 1, bd = 1e9;
    k.pts.forEach((q, i) => { const d = Math.hypot(q.x - hit.x, q.y - hit.y); if (d < bd) { bd = d; idx = i; } });
    const len = Math.max(20, Math.hypot(hit.x - a.x, hit.y - a.y));
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1); pts.push({ x: lerp(a.x, hit.x, t), y: lerp(a.y, hit.y, t) }); }
    r.snaps.push({ frac: k.frac, pts, seg: len / (n - 1) * 1.02, t: 1.8, col: k.isPlayer ? '#ffffff' : 'rgba(30,41,59,.85)' });
  }
}

/* =========================================================
   JOGADAS
   ========================================================= */
function dash() {
  const r = run, p = r && r.player;
  if (!playing() || !p || !p.alive) return;
  if (r.dashCd > 0) { Sound.deny(); return; }
  let dx = r.aim.x - p.x, dy = r.aim.y - p.y, d = Math.hypot(dx, dy);
  if (d < 20) { dx = p.vx; dy = p.vy; d = Math.hypot(dx, dy); }
  if (d < 1) { dx = 0; dy = -1; d = 1; }
  p.vx += dx / d * 950; p.vy += dy / d * 950;
  r.dashT = .45; r.dashCd = 4;
  Sound.dash(); vib(15);
  burst(p.x, p.y, 14, ['#fde047', '#fff'], 200, .4, 2.5);
}

function cutKite(k, by) {
  const r = run;
  const hit = by === 'player' ? k.withP : k.contact;
  k.alive = false;
  r.falling.push({ x: k.x, y: k.y, vx: k.vx * .3, vy: -60, ang: k.ang, spin: rnd(7, 11) * (Math.random() < .5 ? -1 : 1), t: 0, look: k.look, shape: k.shape, s: k.s, own: !!k.isPlayer,
    tail: k.tail, rope: [], caught: false, stolen: false, ct: 0, boss: !!k.boss });
  burst(k.x, k.y, 30, [k.look.c1, k.look.c2, '#fff'], 300, .9, 3.5);
  if (!k.isPlayer) r.figs.push({ frac: k.frac, kid: k.kid, dir: k.dir, t: 1.9, td: 0 });
  if (by && by !== 'player' && by.alive) { by.cele = 1.5; by.celeT = 0; bubble(by.frac, pick(k.isPlayer ? ['HAHA!', 'CHORA!', 'É MEU!', 'VOLTA PRA CASA!'] : ['HAHA!', 'É MEU!', 'CORTEI!']), '#b91c1c'); }
  if (!k.isPlayer) bubble(k.frac, pick(['AAAH!', 'NÃÃO!', 'POXA!', 'XIII!', 'MINHA PIPA!']), '#1d4ed8');
  Sound.fall();
  if (k.isPlayer) {
    cinematic(k, k.contact, true);
    r.shake = Math.max(r.shake, 8);
    floatText(k.x, k.y - 30, r.windHit ? 'O VENTO VIROU!' : 'CORTARAM SUA PIPA!', '#fca5a5', 24, 1.8);
    bubble(.5, 'NÃÃÃO!', '#b91c1c'); r.pSadT = 0;
    Sound.cut(); Sound.lose(); Sound.aww(); vib([60, 40, 90]); slowmo(.35, .45);
    r.overT = 2; Sound.grind(0);
    return;
  }
  if (by === 'player') {
    const kind = k.boss ? 'chefe' : k.type;
    r.counts[kind]++; r.cuts++;
    r.pCele = 1.5; r.pCeleT = 0;
    { const v = pick(['buscar', 'saidai']); bubble(.5, Sound.voice(v, 2) ? FALA_TXT[v] : (k.boss ? 'CHEFÃO NO CHÃO!' : pick(['É NÓIS!', 'CORTOU!', 'NO GRAU!', 'AÍ SIM!', 'TCHAU!'])), '#15803d'); }
    r.streak = r.time - r.streakT < 2.2 ? r.streak + 1 : 1; r.streakT = r.time;
    cinematic(k, hit, k.boss);
    if (r.streak >= 2) { announce(STREAK_TXT[Math.min(r.streak, 5)], 'gold'); Sound.streak(); }
    floatText(k.x, k.y - 36, k.boss ? 'CHEFÃO CORTADO!' : pick(CUT_TXT), k.boss ? '#fde047' : '#fff', k.boss ? 30 : 26, 1.3);
    if (r.dashT > 0 || r.time - (k.dashHit || -9) < .4) floatText(k.x, k.y - 62, '⚡ RELADA!', '#fde047', 18, 1.2);
    if (r.bet) {
      floatText(k.x, k.y - 8, `+${acct.cfg.pct[kind] || 0}%`, '#86efac', 28, 1.4);
      pulse('#betBox');
      serverCut(kind);
      // ganho máximo por rodada (cap): recolhe sozinho
      const { win } = calcWin(r.bet.stake, r.counts, acct.cfg);
      if (win >= r.bet.stake * acct.cfg.cap) { announce('GANHO MÁXIMO!', 'gold'); setTimeout(() => cashOut(true), 700); }
    }
    Sound.mult(r.cuts); Sound.cut(k.boss); Sound.cheer(k.boss ? 1.4 : .8);
    vib(k.boss ? [40, 30, 80] : 25);
    if (k.boss) slowmo(.3, .5);
    if (k.boss) r.shake = Math.max(r.shake, 9);
    if (k.boss) { r.boss = null; banner('CHEFÃO CORTADO!', r.bet ? `+${acct.cfg.pct.chefe}% na aposta` : 'Mandou muito!'); Sound.music('game'); confettiBurst(60); }
    tip('cut');
  } else {
    cinematicLite(k, hit);
    floatText(k.x, k.y - 26, 'CORTADA!', '#e2e8f0', 15, 1);
    Sound.snap();
  }
}
function cinematicLite(k, hit) { if (hit) { const save = run.cam; cinematic(k, hit, false); run.cam = save; run.whiteT = 0; } }

function catchKite(f) {
  const r = run;
  f.caught = true;
  r.counts.aparar++;
  floatText(f.x, f.y - 28, 'APARADA!', '#86efac', 26, 1.3);
  bubble(.5, pick(['É MINHA!', 'APAREI!', 'VEM NI MIM!']), '#15803d');
  if (r.bet) { floatText(f.x, f.y, `+${acct.cfg.pct.aparar}%`, '#86efac', 20, 1.2); pulse('#betBox'); serverCut('aparar'); }
  burst(f.x, f.y, 22, ['#86efac', '#fff', '#fde047'], 200, .7, 3);
  Sound.catch(); Sound.pop(); vib(15);
  tip('catch');
}
function pickPower(pw) {
  const Pw = POW[pw.type];
  run.buffs[pw.type] = Pw.dur;
  floatText(pw.x, pw.y - 20, Pw.nome, Pw.col, 22, 1.3);
  burst(pw.x, pw.y, 18, [Pw.col, '#fff'], 180, .6, 3);
  Sound.power(); Sound.boing(); vib(12);
}

/* =========================================================
   UPDATE
   ========================================================= */
function update(dt) {
  const r = run;
  r.time += dt;
  r.wind = mapDef.wind + Math.sin(r.time * .15) * 10;
  for (const c of clouds) {
    c.x += (c.v * (c.far ? .6 : 1.2) + r.wind * .3 + r.gustF * .12) * dt;
    if (c.x > W + 180) { c.x = -180; c.y = rnd(H * .05, H * .42); }
    if (c.x < -200) c.x = W + 170;
  }
  for (const f of farKites) f.ph += dt;
  if (!mapDef.night && !mapDef.storm) {
    r.birdT -= dt;
    if (r.birdT <= 0) {
      r.birdT = rnd(8, 16);
      const left = Math.random() < .5, y = rnd(H * .1, H * .35), n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) birds.push({ x: left ? -20 - i * 18 : W + 20 + i * 18, y: y + Math.abs(i - n / 2) * 8, v: (left ? 1 : -1) * rnd(55, 75), ph: rnd(0, 6) });
    }
    for (const b of birds) { b.x += b.v * dt; b.ph += dt * 9; }
    birds = birds.filter(b => b.x > -80 && b.x < W + 80);
  }
  if (mapDef.storm) {
    for (const d of rain) { d.y += d.v * dt; d.x += (r.wind * 3 + r.gustF) * dt * .3; if (d.y > H) { d.y = rnd(-60, -10); d.x = rnd(-40, W + 40); } }
    r.boltT -= dt;
    if (r.boltT <= 0) { r.boltT = rnd(6, 13); bolt(); }
  }
  r.flashT = Math.max(0, r.flashT - dt); r.whiteT = Math.max(0, r.whiteT - dt);
  if (r.bolt) { r.bolt.t -= dt; if (r.bolt.t <= 0) r.bolt = null; }
  if (r.cam) { r.cam.t += dt; if (r.cam.t > r.cam.dur) r.cam = null; }
  if (r.impact) { r.impact.t -= dt; if (r.impact.t <= 0) r.impact = null; }
  for (const s of r.snaps) { s.t -= dt; const a = anchor(s.frac); rope(s.pts, a.x, a.y, s.pts.length, s.seg, dt, 320); }
  r.snaps = r.snaps.filter(s => s.t > 0);

  if (r.gust) {
    const g = r.gust; g.t += dt;
    r.gustF = g.dir * g.force * Math.sin(Math.PI * clamp(g.t / g.dur, 0, 1));
    if (Math.random() < dt * 40) r.streaks.push({ x: g.dir > 0 ? rnd(-200, W * .3) : rnd(W * .7, W + 200), y: rnd(skyTop, skyBot + 40), l: rnd(40, 110), v: g.dir * rnd(700, 1000), a: rnd(.2, .45) });
    if (g.t >= g.dur) { r.gust = null; r.gustF = 0; }
  } else if (!r.demo) {
    r.gustT -= dt;
    if (r.gustT <= 0) { r.gustT = rnd(18, 28) / mapDef.gust; startGust(pick([-1, 1])); }
  }
  for (const s of r.streaks) s.x += s.v * dt;
  r.streaks = r.streaks.filter(s => s.x > -300 && s.x < W + 300);

  const live = !r.demo;
  const p = live ? r.player : null;

  if (live) {
    for (const b in r.buffs) r.buffs[b] = Math.max(0, r.buffs[b] - dt);
    r.dashCd = Math.max(0, r.dashCd - dt); r.dashT = Math.max(0, r.dashT - dt); r.pCele = Math.max(0, r.pCele - dt); r.pCeleT += dt;
    if (p && p.alive) {
      const kx = (inp.keys.arrowright || inp.keys.d ? 1 : 0) - (inp.keys.arrowleft || inp.keys.a ? 1 : 0);
      const ky = (inp.keys.arrowdown || inp.keys.s ? 1 : 0) - (inp.keys.arrowup || inp.keys.w ? 1 : 0);
      if (kx || ky) { r.aim.x = clamp(p.x + kx * 170, 20, W - 20); r.aim.y = clamp(p.y + ky * 170, skyTop, skyBot); }
      if (inp.joy) { r.aim.x += inp.joy.dx * 820 * dt * P.opt.sens / 1.6; r.aim.y += inp.joy.dy * 820 * dt * P.opt.sens / 1.6; clampAim(); }
      p.tx = r.aim.x; p.ty = r.aim.y;
      const ag = r.buffs.vento > 0 ? 1.4 : 1;
      physics(p, dt, 36 * ag, 9, 700 * ag * (r.dashT > 0 ? 1.8 : 1));
      p.inv = Math.max(0, p.inv - dt); p.launch = Math.max(0, p.launch - dt);
      if (r.dashT > 0) { p.ghosts.push({ x: p.x, y: p.y, ang: p.ang, a: .5 }); if (p.ghosts.length > 6) p.ghosts.shift(); }
      for (const g of p.ghosts) g.a -= dt * 2.2;
      p.ghosts = p.ghosts.filter(g => g.a > 0);
      r.reelA += dt * (p.vy < 0 ? 1 : -.6) * clamp(p.spd / 40, 0, 12);
      r.pLaunchT += dt;
      const id = r.idle;
      if (id.act) { id.at += dt; if (id.at > 1.25) id.act = ''; }
      else if (!p.contact && p.spd < 220 && r.pCele <= 0) { id.next -= dt; if (id.next <= 0) { id.act = pick(['suor', 'bone', 'olha', 'pulo', 'olha', 'suor']); id.at = 0; id.next = rnd(5, 9); } }
      if (p.contact) id.act = '';
      r.flapT -= dt * clamp(p.spd / 260, 0, 3);
      if (r.flapT <= 0) { r.flapT = .12; if (p.spd > 180) Sound.flap(); }
    }
    if (r.overT > 0) { r.pSadT += dt; r.overT -= dt; if (r.overT <= 0) { playerLost(); return; } }
    else {
      if (r.waveClearT > 0) { r.waveClearT -= dt; if (r.waveClearT <= 0) startWave(r.wave + 1); }
      else {
        r.spawnT -= dt;
        if (r.queue.length && r.bots.length < r.maxAlive && r.spawnT <= 0) {
          const b = spawnBot(r.queue.shift());
          r.spawnT = rnd(1.1, 2.2);
          if (b.boss) { r.boss = b; bubble(b.frac, 'CHEGUEI!', '#b91c1c'); announce(b.name, 'red'); Sound.bossWarn(); Sound.music('boss'); }
        }
        if (!r.queue.length && !r.bots.length) waveClear();
      }
      r.powerT -= dt;
      if (r.powerT <= 0) {
        r.powerT = rnd(11, 16);
        const left = Math.random() < .5;
        r.powers.push({ type: pick(POW_BAG), x: left ? -30 : W + 30, y: rnd(skyTop + 30, skyBot - 30), vx: (left ? 1 : -1) * rnd(45, 75), t: 0 });
      }
    }
    for (const pw of r.powers) {
      pw.t += dt; pw.x += pw.vx * dt; pw.y += Math.sin(pw.t * 2) * 20 * dt;
      if (p && p.alive && Math.hypot(p.x - pw.x, p.y - pw.y) < 42 * SC) { pw.dead = true; pickPower(pw); }
      if (pw.x < -60 || pw.x > W + 60) pw.dead = true;
    }
    r.powers = r.powers.filter(pw => !pw.dead);
  } else {
    r.spawnT -= dt;
    if (r.bots.length < 3 && r.spawnT <= 0) { spawnBot(enemySpec(pickType(4), 3)); r.spawnT = rnd(1.5, 3); }
    updHero(dt);
  }

  for (const b of r.bots) { botThink(b, dt, p); physics(b, dt, b.K, 8, b.maxV); b.launch = Math.max(0, b.launch - dt); }
  const kites = p && p.alive ? [p, ...r.bots] : r.bots;
  for (const k of kites) { updLine(k); updTail(k, dt); k.flash = Math.max(0, k.flash - dt); }
  contacts(dt, p);
  for (const k of kites) if (k.alive && r.time - k.lastContact > 1.2) k.hp = Math.min(k.maxHp, k.hp + 6 * dt);

  const reach = 44 * SC;
  for (const f of r.falling) {
    f.t += dt;
    if (f.caught || f.stolen) { f.ct += dt; f.y -= 60 * dt; continue; }
    f.vy = Math.min(f.vy + 60 * dt, 80);
    f.vx += ((r.wind * .8 + r.gustF * .5 - f.vx) * .5 + Math.sin(f.t * 2) * 30) * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.spin *= Math.pow(.25, dt);
    f.ang += f.spin * dt;
    f.ang += (Math.sin(f.t * 2.6) * .7 - f.ang) * Math.min(1, dt * (f.t > 1 ? 2 : 0));
    rope(f.rope, f.x, f.y + 2 * f.s, 12, 10 * f.s, dt, 90);
    const L = Art.TAIL_Y[f.shape] * f.s;
    rope(f.tail, f.x - Math.sin(f.ang) * L, f.y + Math.cos(f.ang) * L, f.shape === 'capucheta' ? 8 : 14, 7 * f.s, dt, 70);
    if (live && !f.own && p && p.alive && r.overT <= 0 && f.y < skyBot + 40 && Math.hypot(p.x - f.x, p.y - f.y) < reach) catchKite(f);
  }
  r.falling = r.falling.filter(f => f.y < H + 80 && !((f.caught || f.stolen) && f.ct > .7) && f.x > -120 && f.x < W + 120);
  for (const g of r.figs) { g.t -= dt; g.td += dt; }
  for (const b of r.bubbles) b.t -= dt;
  r.bubbles = r.bubbles.filter(b => b.t > 0);
  r.figs = r.figs.filter(g => g.t > 0);
  for (const q of r.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 260 * dt; q.vx *= .98; }
  r.parts = r.parts.filter(q => q.life > 0);
  for (const t of r.texts) { t.life -= dt; t.y -= 40 * dt; }
  r.texts = r.texts.filter(t => t.life > 0);
  r.shake = Math.max(0, r.shake - dt * 30);

  Sound.wind(p && p.alive ? clamp(p.spd / 700, 0, 1) * .8 + (r.gust ? .4 : 0) : (r.gust ? .4 : .08));
  if (live) { updHud(); tipsUpdate(dt); }
}

function contacts(dt, p) {
  const r = run;
  for (const b of r.bots) { b.prevP = b.withP; b.withP = null; b.contact = null; }
  let grind = 0, ratio = .5;
  if (p && p.alive) {
    p.contact = null;
    if (p.launch <= 0 && r.overT <= 0) for (const b of r.bots) {
      if (b.launch > 0 || !b.alive) continue;
      const hit = lineHit(p.pts, b.pts);
      if (!hit) continue;
      b.withP = hit; b.contact = hit; p.contact = hit;
      b.lastContact = p.lastContact = r.time;
      const dashing = r.dashT > 0;
      const pp = power(p) * (r.buffs.ouro > 0 ? 2 : 1) * (dashing ? 2.5 : 1), bp = power(b);
      if (!b.prevP && (p.spd > 480 || dashing)) {
        b.hp -= b.maxHp * .22 * (dashing ? 1.5 : 1);
        floatText(hit.x, hit.y - 36, 'CHEGADA!', '#fde047', 20, 1);
        Sound.chegada(); r.shake = Math.max(r.shake, 3); vib(20);
        burst(hit.x, hit.y, 14, ['#fde047', '#fff'], 240, .5, 3);
      }
      if (!b.prevP) { tip('contact'); if (r.time - (r.lastDaLinha || -99) > 7 && Sound.voice('dalinha')) { r.lastDaLinha = r.time; bubble(.5, FALA_TXT.dalinha, '#b45309'); } }
      hit.pp = pp; hit.bp = bp;
      b.hp -= pp * DMG * dt; b.flash = .08;
      if (dashing) b.dashHit = r.time;
      if (p.inv <= 0 && r.buffs.escudo <= 0) { p.hp -= bp * DMG * dt; p.flash = .08; }
      if (Math.random() < .75) burst(hit.x, hit.y, 2, ['#fff7ae', '#fde047', '#ffffff'], 170, .35, 2);
      grind = 1; ratio = pp / (pp + bp);
      if (b.hp <= 0) cutKite(b, 'player');
      else if (p.hp <= 0) { cutKite(p, b); break; }
    }
  }
  const bs = r.bots;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    if (!a.alive || !b.alive || a.launch > 0 || b.launch > 0 || a.boss || b.boss) continue;
    const hit = lineHit(a.pts, b.pts);
    if (!hit) continue;
    a.contact = a.contact || hit; b.contact = b.contact || hit;
    a.lastContact = b.lastContact = r.time;
    a.hp -= power(b) * DMG * .55 * dt; b.hp -= power(a) * DMG * .55 * dt;
    a.flash = b.flash = .08;
    if (Math.random() < .35) burst(hit.x, hit.y, 1, ['#fff7ae', '#fff'], 120, .3, 2);
    if (a.hp <= 0) cutKite(a, b); else if (b.hp <= 0) cutKite(b, a);
  }
  r.bots = r.bots.filter(b => b.alive);
  if (!r.demo) Sound.grind(grind, ratio);
}

/* ---------- bonequinhos rivais pré-desenhados (desempenho no celular) ---------- */
let figCache = new WeakMap();
function figSprite(kid, dir, foco, pose = 'pipa') {
  let m = figCache.get(kid);
  if (!m) { m = {}; figCache.set(kid, m); }
  const key = dir + (foco ? 'f' : 'n') + pose;
  if (m[key]) return m[key];
  const s = FIG, w = 84 * s, h = 70 * s, cv = document.createElement('canvas');
  cv.width = Math.ceil(w * DPR); cv.height = Math.ceil(h * DPR);
  const c = cv.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sx = 42 * s, sy = 64 * s;
  Art.drawFigure(c, sx, sy, sx, sy - HAND, kid, s, { dir, pose, t: 1, td: 1, pull: foco ? .6 : 0, foco });
  return (m[key] = { cv, w, h, sx, sy });
}
function drawFigCached(kid, x, feet, dir, foco, pose) {
  const sp = figSprite(kid, dir, foco, pose);
  ctx.drawImage(sp.cv, x - sp.sx, feet - sp.sy, sp.w, sp.h);
}

/* ---------- herói do lobby (seu bonequinho grande + sua pipa) ---------- */
function heroLayout() {
  if (state !== 'lobby') return null;
  const box = $('#heroBox');
  if (!box) return null;
  const r = box.getBoundingClientRect(), top = r.top - AY, h = r.height;
  if (h < 60 || top + h < 30) return null;
  const s = clamp(h / 190, 1.25, 2.1), feet = top + h - 27 * s, cx = W / 2;
  return { s, feet, cx, top, h };
}
function updHero(dt) {
  const L = heroLayout(), t = run.time;
  if (!L) return;
  hero.x = L.cx + Math.sin(t * .55) * W * .26;
  hero.y = L.top + L.h * .33 + Math.sin(t * 1.1) * L.h * .05;
  hero.ang = Math.cos(t * .55) * .35;
  const sk = skinById(P.skin), s = SC * 1.5;
  const TL = Art.TAIL_Y[sk.shape] * s;
  rope(hero.tail, hero.x - Math.sin(hero.ang) * TL, hero.y + Math.cos(hero.ang) * TL, 16, 8 * s, dt, 70);
  hero.nextDance -= dt;
  if (hero.nextDance <= 0) { hero.danceT = 0; hero.nextDance = rnd(9, 13); }
  hero.danceT += dt;
  if (hero.act) { hero.at += dt; if (hero.at > 1.25) hero.act = ''; }
  else if (hero.danceT > 2) { hero.nextAct = (hero.nextAct || 3) - dt; if (hero.nextAct <= 0) { hero.act = pick(['acena', 'bone', 'olha', 'suor', 'pulo', 'acena']); hero.at = 0; hero.nextAct = rnd(3, 5); } }
  if (hero.bubble) hero.bubble.t -= dt;
}
function drawHero() {
  const L = heroLayout(), sk = skinById(P.skin), s = SC * 1.5, t = run.time;
  if (!L || !hero.tail.length) return;
  const spot = ctx.createRadialGradient(L.cx, L.feet - 34 * L.s, 4, L.cx, L.feet - 34 * L.s, 70 * L.s);
  spot.addColorStop(0, mapDef.night ? 'rgba(255,240,200,.28)' : 'rgba(255,255,255,.22)'); spot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spot; ctx.fillRect(L.cx - 70 * L.s, L.feet - 104 * L.s, 140 * L.s, 110 * L.s);
  Art.drawPlatform(ctx, L.cx, L.feet, Math.min(W * .62, 250 * L.s / 2.05), L.s * .55, !!mapDef.night, t);
  Art.drawTail(ctx, hero.tail, sk, s);
  Art.drawKite(ctx, hero.x, hero.y, hero.ang, sk, sk.shape, s, DPR);
  const dancing = hero.danceT >= 0 && hero.danceT < 1.8, beat = Sound.beat();
  drawSpeaker(ctx, L.cx - 30 * L.s, L.feet, L.s * .62, beat);
  // olha pra você (câmera) e de vez em quando pra pipa
  const toKite = Math.sin(t * .5) > .2, hy0 = L.feet - 43 * L.s, lx = hero.x - L.cx, ly = hero.y - hy0, ll = Math.hypot(lx, ly) || 1;
  const look = toKite ? [lx / ll, ly / ll] : [0, 0];
  const hand = Art.drawFigure(ctx, L.cx, L.feet, 0, 0, playerKid(), L.s, { view: 'front', pose: dancing ? 'festa' : 'pipa', t, td: hero.danceT, pull: .15, beat,
    look, reel: t * 2, act: hero.act, at: hero.at, talk: hero.bubble && hero.bubble.t > .35 ? 1 : 0 });
  ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.quadraticCurveTo((hand.x + hero.x) / 2, (hand.y + hero.y) / 2 + 36, hero.x, hero.y + 2 * s); ctx.stroke();
  if (hero.bubble && hero.bubble.t > 0) {
    const b = hero.bubble; b.max = b.max || b.t; const age = b.max - b.t, sc = age < .15 ? .6 + age * 2.7 : 1;
    ctx.save(); ctx.translate(L.cx - 14 * L.s, L.feet - 70 * L.s); ctx.scale(sc, sc);
    ctx.font = `${Math.round((b.txt.length > 16 ? 14 : 18) * TK())}px ${TF()}`; const w = ctx.measureText(b.txt).width + 20, h = 30;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1433'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 10, -h); ctx.arcTo(w / 2, -h, w / 2, 0, 10); ctx.arcTo(w / 2, 0, -w / 2, 0, 10); ctx.lineTo(6, 0); ctx.lineTo(-2, 10); ctx.lineTo(-8, 0); ctx.arcTo(-w / 2, 0, -w / 2, -h, 10); ctx.arcTo(-w / 2, -h, w / 2, -h, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#15803d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.txt, 0, -h / 2 + 1);
    ctx.restore();
  }
}

/* =========================================================
   DESENHO
   ========================================================= */
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function path(pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
function drawPlayerLine(k) {
  const gold = run.buffs.ouro > 0;
  path(k.pts);
  ctx.strokeStyle = gold ? 'rgba(250,204,21,.45)' : 'rgba(255,255,255,.28)'; ctx.lineWidth = 5.5; ctx.stroke();
  ctx.strokeStyle = k.flash > 0 ? '#fca5a5' : gold ? '#fde047' : '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
}
function drawEnemyLine(k) {
  path(k.pts);
  if (k.redline) ctx.strokeStyle = k.contact ? '#ef4444' : 'rgba(185,28,28,.85)';
  else if (k.boss) ctx.strokeStyle = k.enraged ? '#ef4444' : (mapDef.night ? 'rgba(248,250,252,.7)' : 'rgba(15,23,42,.9)');
  else ctx.strokeStyle = mapDef.night || mapDef.storm ? 'rgba(226,232,240,.55)' : 'rgba(30,41,59,.8)';
  ctx.lineWidth = k.boss ? 2.2 : 1.4;
  ctx.stroke();
}
function drawBar(x, y, w, v, max) {
  ctx.fillStyle = '#1b1433'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 9);
  const f = clamp(v / max, 0, 1);
  ctx.fillStyle = f > .5 ? '#22c55e' : f > .25 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(x - w / 2, y, w * f, 5);
}
/* texto com contorno pré-desenhado (evita redesenhar letras a cada quadro) */
const textCache = new Map();
function textSprite(txt, size, col, lw = 5.5) {
  const key = txt + '|' + size + '|' + col + '|' + lw + '|' + P.opt.style;
  let sp = textCache.get(key);
  if (sp) return sp;
  const font = `${Math.round(size * TK())}px ${TF()}`, cv = document.createElement('canvas'), c = cv.getContext('2d');
  c.font = font;
  const w = Math.ceil(c.measureText(txt).width) + 16, h = Math.ceil(size * 1.45) + 12, k = Math.min(2.4, DPR * 1.35);
  cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
  c.scale(k, k); c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.lineWidth = lw; c.strokeStyle = '#1b1433'; c.strokeText(txt, w / 2, h / 2); c.fillStyle = col; c.fillText(txt, w / 2, h / 2);
  sp = { cv, w, h }; textCache.set(key, sp);
  if (textCache.size > 90) textCache.delete(textCache.keys().next().value);
  return sp;
}
function warmTexts() {
  const S = n => Math.round(n * Math.max(SC, .9)), cfg = acct && acct.cfg;
  const list = [...CUT_TXT.map(t => [t, S(26), '#fff']), ['CHEFÃO CORTADO!', S(30), '#fde047'], ['⚡ RELADA!', S(18), '#fde047'],
    ['CORTADA!', S(15), '#e2e8f0'], ['APARADA!', S(26), '#86efac'], ['CORTARAM SUA PIPA!', S(24), '#fca5a5']];
  if (cfg && cfg.pct) for (const k in cfg.pct) list.push([`+${cfg.pct[k]}%`, S(k === 'aparar' ? 20 : 28), '#86efac']);
  for (const [t, z, c] of list) textSprite(t, z, c);
}
function textO(t, x, y, size, col, lw = 5) {
  ctx.font = `${Math.round(size * TK())}px ${TF()}`;
  ctx.lineWidth = lw; ctx.strokeStyle = '#1b1433'; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
  ctx.fillStyle = col; ctx.fillText(t, x, y);
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = !pixel();
  const r = run;
  ctx.save();
  if (r && r.shake > 0 && P.opt.fx === 'alto') { const q = r.real * 38; ctx.translate(Math.sin(q) * r.shake * .5, Math.cos(q * 1.3) * r.shake * .35); }
  if (r && r.cam) {
    const k = 1 - r.cam.t / r.cam.dur, z = 1 + (r.cam.peak - 1) * k * k;
    ctx.translate(r.cam.x, r.cam.y); ctx.scale(z, z); ctx.translate(-r.cam.x, -r.cam.y);
  }
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  if (!r) { ctx.restore(); return; }

  for (const c of clouds) {
    const s = c.s * SC * (c.far ? 1 : 1.35);
    ctx.fillStyle = mapDef.storm ? `rgba(55,65,81,${c.far ? .7 : .85})` : mapDef.night ? `rgba(148,163,184,${c.far ? .12 : .2})` : `rgba(255,255,255,${c.far ? .55 : .88})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 18 * s, 0, Math.PI * 2); ctx.arc(c.x + 20 * s, c.y - 8 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(c.x + 44 * s, c.y, 17 * s, 0, Math.PI * 2); ctx.arc(c.x + 22 * s, c.y + 6 * s, 18 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const f of farKites) {
    const x = f.x + Math.sin(f.ph * .7) * 12, y = f.y + Math.cos(f.ph * .9) * 6;
    ctx.strokeStyle = mapDef.night ? 'rgba(226,232,240,.16)' : 'rgba(30,41,59,.16)'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20, (y + H) / 2, x + 40, H - city.max); ctx.stroke();
    Art.drawKite(ctx, x, y, Math.sin(f.ph) * .2, f.look, 'raia', f.s, DPR, mapDef.night ? .5 : .75);
  }
  ctx.strokeStyle = 'rgba(30,41,59,.75)'; ctx.lineWidth = 1.8;
  for (const b of birds) {
    const w = 6 * SC, fl = Math.sin(b.ph) * 3 * SC;
    ctx.beginPath(); ctx.moveTo(b.x - w, b.y - fl); ctx.quadraticCurveTo(b.x - w / 2, b.y - 3 * SC, b.x, b.y); ctx.quadraticCurveTo(b.x + w / 2, b.y - 3 * SC, b.x + w, b.y - fl); ctx.stroke();
  }
  for (const s of r.streaks) { ctx.strokeStyle = `rgba(255,255,255,${s.a})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.sign(s.v) * s.l, s.y); ctx.stroke(); }

  const p = r.player, pAlive = p && p.alive && !r.demo;
  for (const b of r.bots) drawEnemyLine(b);
  if (pAlive) drawPlayerLine(p);
  for (const s of r.snaps) { ctx.globalAlpha = clamp(s.t / .6, 0, 1); ctx.strokeStyle = s.col; ctx.lineWidth = 1.6; path(s.pts); ctx.stroke(); ctx.globalAlpha = 1; }

  for (const f of r.falling) {
    const a = (f.caught || f.stolen) ? Math.max(0, 1 - f.ct / .7) : 1;
    ctx.globalAlpha = a;
    if (f.rope.length) { ctx.strokeStyle = 'rgba(30,41,59,.55)'; ctx.lineWidth = 1; path(f.rope); ctx.stroke(); }
    Art.drawTail(ctx, f.tail, f.look, f.s);
    Art.drawKite(ctx, f.x, f.y, f.ang, f.look, f.shape, f.s, DPR, a);
    ctx.globalAlpha = 1;
    if (!f.own && !f.caught && !f.stolen && !r.demo) {
      ctx.strokeStyle = `rgba(134,239,172,${.5 + Math.sin(r.time * 8) * .3})`; ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(f.x, f.y, 36 * f.s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  for (const pw of r.powers) Art.drawPower(ctx, pw.type, pw.x, pw.y, 18 * SC, pw.t);

  // bonequinhos
  const beat = Sound.beat();
  if (!r.demo) { const a = anchor(.5); drawSpeaker(ctx, a.x - 44 * FIG, city.roofAt(a.x), FIG, beat); }
  for (const g of r.figs) {
    const a = anchor(g.frac);
    ctx.globalAlpha = clamp(g.t / .6, 0, 1);
    drawFigCached(g.kid, a.x, city.roofAt(a.x), g.dir > 0 ? 1 : -1, false, 'triste');
    ctx.globalAlpha = 1;
  }
  for (const b of r.bots) {
    const a = anchor(b.frac), feet = city.roofAt(a.x), dir = b.dir > 0 ? 1 : -1;
    if (b.cele > 0) Art.drawFigure(ctx, a.x, feet, a.x, a.y, b.kid, FIG, { dir, pose: 'festa', t: r.time, td: b.celeT, beat });
    else drawFigCached(b.kid, a.x, feet, dir, !!b.contact);
    if (b.alertT > 0 && !r.demo) { // "!" de ataque
      const ax = a.x - dir * 19 * FIG, ay = feet - 70 * FIG - Math.abs(Math.sin(b.alertT * 12)) * 4, sc = Math.min(1, (1.1 - b.alertT) * 6 + .3);
      ctx.save(); ctx.translate(ax, ay); ctx.scale(sc, sc);
      ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#1b1433'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold 15px ${TF()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 1);
      ctx.restore();
    }
  }
  if (p && !r.demo) {
    const a = anchor(.5);
    const dir = p.dir > 0 ? 1 : -1, hx = a.x - dir * 19 * FIG, hy = city.roofAt(a.x) - 41 * FIG;
    const lx = p.x - hx, ly = p.y - hy, ll = Math.hypot(lx, ly) || 1;
    const pose = !p.alive ? 'triste' : r.pCele > 0 ? 'festa' : r.pLaunchT < .7 ? 'lanca' : 'pipa';
    Art.drawFigure(ctx, a.x, city.roofAt(a.x), a.x, a.y, playerKid(), FIG, { dir, me: true, t: r.time, beat, reel: r.reelA,
      td: pose === 'triste' ? r.pSadT : pose === 'lanca' ? r.pLaunchT : r.pCeleT, foco: !!p.contact, look: [lx / ll * dir, ly / ll],
      act: r.idle.act, at: r.idle.at, pose, pull: p.contact ? 1 : clamp(p.spd / 900, 0, .6) });
  }

  const kites = pAlive ? [...r.bots, p] : r.bots;
  for (const k of kites) {
    if (mapDef.night && glowSprite) { const gs = 70 * k.s; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .6; ctx.drawImage(glowSprite, k.x - gs, k.y - gs, gs * 2, gs * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    if (k.boss && k.enraged) { ctx.fillStyle = `rgba(239,68,68,${.22 + Math.sin(r.time * 10) * .1})`; ctx.beginPath(); ctx.arc(k.x, k.y, 46 * k.s, 0, Math.PI * 2); ctx.fill(); }
    Art.drawTail(ctx, k.tail, k.look, k.s);
    if (k.isPlayer) for (const g of k.ghosts) Art.drawKite(ctx, g.x, g.y, g.ang, k.look, k.shape, k.s, DPR, g.a * .6);
    const blink = k.inv > 0 && Math.floor(r.time * 10) % 2 === 0;
    Art.drawKite(ctx, k.x, k.y, k.ang, k.look, k.shape, k.s, DPR, blink ? .45 : 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (k.isPlayer) {
      if (r.buffs.escudo > 0) { ctx.strokeStyle = `rgba(167,139,250,${.5 + Math.sin(r.time * 6) * .25})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(k.x, k.y, 38 * k.s, 0, Math.PI * 2); ctx.stroke(); }
      const ay = k.y - 44 * k.s + Math.sin(r.time * 5) * 3;
      ctx.fillStyle = '#fde047'; ctx.strokeStyle = '#1b1433'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(k.x - 8, ay - 10); ctx.lineTo(k.x + 8, ay - 10); ctx.lineTo(k.x, ay); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (k.hp < k.maxHp) drawBar(k.x, k.y + 34 * k.s, 48, k.hp, k.maxHp);
    } else if (!r.demo) {
      if (k.hp < k.maxHp || k.boss) drawBar(k.x, k.y - 42 * k.s, k.boss ? 72 : 42, k.hp, k.maxHp);
      const nm = k.boss ? k.name : `${k.name} · ${ENEMIES[k.type].nome}`;
      ctx.font = `900 ${k.boss ? 13 : 11}px Nunito, sans-serif`; ctx.lineWidth = 3.5; ctx.strokeStyle = '#1b1433';
      ctx.strokeText(nm, k.x, k.y - 45 * k.s); ctx.fillStyle = k.boss ? '#fca5a5' : k.thief ? '#fde047' : '#fff'; ctx.fillText(nm, k.x, k.y - 45 * k.s);
    }
  }
  if (r.demo && state === 'lobby') drawHero();
  if (!r.demo || state === 'lobby') drawBubbles();

  for (const b of r.bots) {
    const h = b.contact;
    if (!h) continue;
    const rr = 9 + Math.sin(r.time * 30) * 3;
    ctx.fillStyle = 'rgba(255,247,174,.6)'; ctx.beginPath(); ctx.arc(h.x, h.y, rr, 0, Math.PI * 2); ctx.fill();
    if (h.pp != null && b.withP) {
      const w = 76, f = h.pp / (h.pp + h.bp), y = h.y - 26;
      ctx.fillStyle = '#1b1433'; ctx.fillRect(h.x - w / 2 - 3, y - 3, w + 6, 13);
      ctx.fillStyle = '#22c55e'; ctx.fillRect(h.x - w / 2, y, w * f, 7);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(h.x - w / 2 + w * f, y, w * (1 - f), 7);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const lb = textSprite(f >= .5 ? 'RELA!' : 'RELA MAIS RÁPIDO!', 15, f >= .5 ? '#86efac' : '#fca5a5', 4);
      ctx.drawImage(lb.cv, h.x - lb.w / 2, y - 5 - lb.h + 6, lb.w, lb.h);
    }
  }
  if (r.impact) {
    const im = r.impact, k = im.t / .32;
    ctx.strokeStyle = `rgba(255,255,255,${k * .5})`; ctx.lineWidth = 1.8;
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + im.x; const r1 = 26 + (1 - k) * 30, r2 = r1 + 30 + (1 - k) * 40; ctx.beginPath(); ctx.moveTo(im.x + Math.cos(a) * r1, im.y + Math.sin(a) * r1); ctx.lineTo(im.x + Math.cos(a) * r2, im.y + Math.sin(a) * r2); ctx.stroke(); }
  }
  for (const q of r.parts) { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); ctx.fillStyle = q.col; ctx.fillRect(q.x, q.y, q.size, q.size); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of r.texts) {
    const a = clamp(t.life / t.max * 1.6, 0, 1), sc = 1 + Math.max(0, (t.life / t.max) - .85) * 2.4;
    const sp = textSprite(t.txt, Math.round(t.size), t.col), ww = sp.w * sc, hh = sp.h * sc;
    ctx.globalAlpha = a; ctx.drawImage(sp.cv, t.x - ww / 2, t.y - hh / 2, ww, hh);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (mapDef.storm) {
    ctx.strokeStyle = 'rgba(186,200,225,.45)'; ctx.lineWidth = 1.1; ctx.beginPath();
    const sl = (r.wind * 3 + r.gustF) * .02;
    for (const d of rain) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + sl * d.l * .3, d.y + d.l); }
    ctx.stroke();
  }
  if (r.bolt) { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; path(r.bolt.pts); ctx.stroke(); }
  if (r.flashT > 0) { ctx.fillStyle = `rgba(230,240,255,${r.flashT * .9})`; ctx.fillRect(0, 0, W, H); }
  if (r.whiteT > 0) { ctx.fillStyle = `rgba(255,255,255,${r.whiteT * .65})`; ctx.fillRect(0, 0, W, H); }

  if (playing() && isTouch && inp.dragId !== null && pAlive) {
    if (P.opt.ctrl === 'joystick' && inp.joy) {
      const j = inp.joy;
      ctx.fillStyle = 'rgba(15,23,42,.35)'; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(j.bx, j.by, 60, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(250,204,21,.9)'; ctx.strokeStyle = '#1b1433';
      ctx.beginPath(); ctx.arc(j.bx + j.dx * 60, j.by + j.dy * 60, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (P.opt.ctrl === 'arrastar') {
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(r.aim.x, r.aim.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(r.aim.x, r.aim.y, 13, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
function drawConfetti(dt) {
  if (!confetti.length) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const c of confetti) {
    c.life -= dt; c.vy += 900 * dt; c.vx *= .99; c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.globalAlpha = clamp(c.life, 0, 1);
    ctx.fillStyle = c.col; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
  }
  confetti = confetti.filter(c => c.life > 0 && c.y < H + 40);
}

/* =========================================================
   HUD
   ========================================================= */
let lastHud = {};
function setTxt(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }
function setHtml(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).innerHTML = v; } }
const POP_K = [{ scale: 1 }, { scale: 1.16, offset: .4 }, { scale: 1 }];
function pulse(sel) {
  const el = $(sel); if (!el) return;
  if (el.animate) { if (el._pop) el._pop.cancel(); el._pop = el.animate(POP_K, { duration: 320, easing: 'ease-out' }); return; }
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}
function replay(el, cls) { // reinicia a animação CSS sem forçar layout
  el.classList.remove(cls);
  requestAnimationFrame(() => el.classList.add(cls));
}
function updHud() {
  const r = run, p = r.player;
  setTxt('#hWave', `ONDA ${r.wave}`);
  setTxt('#hCuts', String(r.cuts));
  const f = p && p.alive ? clamp(p.hp / p.maxHp, 0, 1) : 0, fw = Math.round(f * 100);
  if (lastHud.hp !== fw) { lastHud.hp = fw; const hp = $('#hHp'); hp.style.width = fw + '%'; hp.classList.toggle('low', f < .35); }
  if (r.bet) {
    const { pct, win } = calcWin(r.bet.stake, r.counts, acct.cfg);
    setTxt('#betPct', `+${pct}%`); setTxt('#betWin', money(win)); setTxt('#cashVal', money(win));
    const blocked = !p || !p.alive || !!p.contact || p.launch > 0 || r.overT > 0;
    if (lastHud.cashBlk !== blocked) { lastHud.cashBlk = blocked; $('#btnCash').classList.toggle('off', blocked); }
    setTxt('#cashLbl', p && p.contact ? 'EM CRUZADA' : 'SACAR');
  }
  const bb = $('#bossBar');
  if (r.boss && r.boss.alive) {
    bb.classList.remove('hidden');
    setTxt('#bossName', r.boss.name + (r.boss.enraged ? ' · ENFURECIDO' : ''));
    const bw = Math.round(clamp(r.boss.hp / r.boss.maxHp, 0, 1) * 100);
    if (lastHud.bw !== bw) { lastHud.bw = bw; $('#bossHp').style.width = bw + '%'; }
  } else if (!bb.classList.contains('hidden')) bb.classList.add('hidden');
  let bf = '';
  const ICO = { vento: '💨', ouro: '⭐', escudo: '🛡️' };
  for (const k in r.buffs) if (r.buffs[k] > 0) bf += `<span style="--c:${POW[k].col}">${ICO[k]} ${Math.ceil(r.buffs[k])}s</span>`;
  setHtml('#hBuffs', bf);
  const cd = (r.dashCd / 4).toFixed(2);
  if (lastHud.cd !== cd) { lastHud.cd = cd; const d = $('#btnDash'); d.style.setProperty('--cd', cd); d.classList.toggle('ready', r.dashCd <= 0); }
  const low = p && p.alive ? clamp((.4 - p.hp / p.maxHp) / .4, 0, 1) : 0;
  const vo = (low * .85 + (p && p.flash > 0 ? .25 : 0)).toFixed(1);
  if (lastHud.vo !== vo) { lastHud.vo = vo; $('#vignette').style.opacity = vo; }
}
function banner(t, sub) {
  const el = $('#banner');
  el.innerHTML = `<b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  replay(el, 'show');
}
function announce(t, cls = '') { const el = $('#announce'); el.textContent = t; el.className = cls; requestAnimationFrame(() => el.classList.add('show')); }
function toast(html, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls; el.innerHTML = html;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

/* dicas da primeira partida */
function tipsStart() {
  run.tips = P.tips ? { shown: {}, t: 0, cur: '', hideAt: 0 } : null;
  if (run.tips) showTip(isTouch ? (P.opt.ctrl === 'joystick' ? 'Encoste e arraste: joystick aparece ☝️' : 'Arraste o dedo em qualquer lugar ☝️') : 'Mova o mouse para pilotar 🖱️', 6);
}
function showTip(txt, dur) { const t = run.tips; if (!t) return; t.cur = txt; t.hideAt = t.t + dur; $('#hintTxt').textContent = txt; const h = $('#hint'); h.classList.remove('hidden'); pulse('#hint'); }
function tip(ev) {
  const t = run && run.tips;
  if (!t || t.shown[ev]) return;
  t.shown[ev] = true;
  if (ev === 'contact') showTip('Cruzou! RELE: mexa bem rápido 🔥', 5);
  if (ev === 'cut') showTip(run.bet ? 'Cada corte soma %. SACAR garante 💰' : 'Cortou! Na aposta, cada corte soma % 💰', 6);
  if (ev === 'catch') showTip('Aparou! Também soma 🤲', 4);
}
function tipsUpdate(dt) {
  const t = run.tips; if (!t) return;
  t.t += dt;
  if (t.cur && t.t > t.hideAt) { t.cur = ''; $('#hint').classList.add('hidden'); }
  if (!t.shown.dashTip && t.t > 14) { t.shown.dashTip = true; showTip(isTouch ? '⚡ RELADA dá um tranco na cruzada' : 'ESPAÇO = ⚡ RELADA', 5); }
}

/* =========================================================
   RODADA
   ========================================================= */
function setPending(v) { try { v ? localStorage.setItem(PENDING_KEY, JSON.stringify(v)) : localStorage.removeItem(PENDING_KEY); } catch (e) {} }
function getPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)); } catch (e) { return null; } }

async function startRound(practice) {
  Sound.init();
  if (busy || state === 'play') return;
  if (!practice) {
    const c = acct && acct.cfg;
    if (!c) return;
    if (P.stake < c.stake_min || P.stake > c.stake_max) { toast(`Aposta entre 🪙 ${money(c.stake_min)} e 🪙 ${money(c.stake_max)}.`, 'bad'); Sound.deny(); return; }
    if (P.stake > acct.balance) { toast('Saldo insuficiente para essa aposta.', 'bad'); Sound.deny(); pulse('#balBox'); return; }
    busy = true; setBusyBtn(true);
    try {
      const j = await Api.start(P.stake, mapDef.id);
      acct.balance = j.balance; acct.cfg = j.cfg;
      beginRun({ round: j.round, stake: j.stake });
    } catch (e) { apiError(e); }
    finally { busy = false; setBusyBtn(false); }
  } else beginRun(null);
}
function beginRun(bet) {
  closeSheets(true);
  run = newRun(false);
  run.bet = bet; run.practice = !bet;
  // Força das linhas rivais: um valor só, igual em toda rodada, apostada ou treino.
  run.forca = +((acct && acct.cfg && acct.cfg.forca) || 1.4);
  run.cutQ = Promise.resolve(); run.cutAt = 0; run.windT = 0;
  spawnPlayer(); startWave(1);
  warmTexts();
  if (Sound.voice('vai', 2)) run.bubbles.push({ frac: .5, txt: FALA_TXT.vai, col: '#15803d', t: 2.2, max: 2.2 });
  state = 'play';
  showScreen(null);
  const hud = $('#hud');
  hud.classList.remove('hidden'); hud.classList.toggle('practice', !bet);
  if (bet) $('#betStake').textContent = money(bet.stake);
  lastHud = {};
  Sound.init(); Sound.music('game'); Sound.rain(mapDef.storm ? 1 : 0); Sound.muffle(false); Sound.crowdAmb(.7); Sound.whoosh();
  keepAwake(true); tipsStart(); vib(20);
}
async function cashOut(auto) {
  const r = run;
  if (!r || r.demo || !r.bet || r.ending) return;
  const p = r.player;
  if (!auto && (!p || !p.alive || p.contact || p.launch > 0 || r.overT > 0)) {
    Sound.deny(); if (p && p.contact) announce('SOLTE A CRUZADA PRA SACAR', 'red');
    return;
  }
  // Não dá pra recolher sem cortar nenhuma pipa (o servidor também recusa).
  if (!auto && r.bet && r.cuts < 1) {
    Sound.deny(); announce('CORTE UMA LINHA PRA PODER SACAR', 'red');
    return;
  }
  r.ending = true; state = 'ending';
  Sound.silence();
  const payload = { round: r.bet.round, counts: { ...r.counts } };
  setPending({ action: 'cashout', ...payload });
  showBusy('Confirmando saque…');
  await r.cutQ; // todos os cortes precisam chegar ao servidor antes do saque
  if (r.windHit) { hideBusy(); setPending(null); return windResult(r); }
  await sendCashout(payload);
}
async function sendCashout(payload) {
  showBusy('Confirmando saque…');
  try {
    const j = await Api.cashout(payload.round);
    setPending(null);
    const before = acct.balance;
    acct.balance = j.balance;
    hideBusy();
    const stake = run && run.bet ? run.bet.stake : 0;
    if ((j.win || 0) > 0) {
      Sound.cashout(); Sound.cheer(1.3); vib([30, 30, 60]); confettiBurst();
      showResult('won', { win: j.win, pct: j.pct, stake, counts: payload.counts, before });
    } else {
      // Servidor não pagou (rodada perdedora): mostra derrota, não "ganhou 0".
      Sound.lose(); vib([60, 40, 90]);
      showResult('lost', { stake, pct: j.pct, counts: payload.counts });
    }
  } catch (e) {
    hideBusy();
    if (e.status === 0) {
      openModal(`<div class="m-ic">📡</div><h2>Sem conexão</h2><p>Não deu pra confirmar o saque. Seu ganho fica guardado e é confirmado assim que a internet voltar.</p>
        <button class="btn btn-play" id="mRetry"><span>TENTAR DE NOVO</span></button>`);
      $('#mRetry').onclick = () => { closeModal(); sendCashout(payload); };
    } else { setPending(null); showResult('error', { msg: e.message }); }
  }
}
function playerLost() {
  const r = run;
  r.ending = true; state = 'ending';
  Sound.silence();
  if (r.bet && r.windHit) return windResult(r);
  if (r.bet) {
    const { pct } = calcWin(r.bet.stake, r.counts, acct.cfg);
    const payload = { action: 'lose', round: r.bet.round, counts: { ...r.counts } };
    setPending(payload);
    r.lostSent = true;
    r.cutQ.then(() => Api.lose(payload.round)).then(j => { acct.balance = j.balance; setPending(null); updBalance(); }).catch(() => {});
    showResult('lost', { stake: r.bet.stake, pct, counts: payload.counts });
  } else showResult('practice', {});
}
/* Vento virou: o servidor encerrou a rodada sem prêmio (regra declarada no "Como jogar"). */
function windResult(r) {
  const { pct } = calcWin(r.bet.stake, r.counts, acct.cfg);
  Api.me().then(j => { acct.balance = j.balance; updBalance(); }).catch(() => {});
  showResult('wind', { stake: r.bet.stake, pct, counts: { ...r.counts }, windAt: r.windHit.at });
}

/* Registra cada corte no servidor, em fila: o servidor recusa cortes com
   menos de 250 ms de intervalo. Se o vento virar, a rodada acaba ali. */
const CUT_GAP_MS = 300;
function serverCut(kind) {
  const r = run;
  if (!r || !r.bet) return;
  r.cutQ = r.cutQ.then(async () => {
    if (r.windHit || r.lostSent) return;
    for (let tent = 0; tent < 2; tent++) {
      const wait = r.cutAt + CUT_GAP_MS - Date.now();
      if (wait > 0) await new Promise(ok => setTimeout(ok, wait));
      try {
        const j = await Api.cut(r.bet.round, kind);
        r.cutAt = Date.now();
        if (j.wind) { r.windHit = { at: j.windAt }; if (run === r && state === 'play') windTurn(); }
        return;
      } catch (e) {
        r.cutAt = Date.now();
        if (e.status !== 0) return; // recusado pelo servidor: não conta
      }
    }
  });
}
/* Encena o vento virando: rajada forte e a linha do jogador arrebenta. */
function windTurn() {
  const r = run, p = r.player;
  startGust(Math.random() < .5 ? -1 : 1, 2.2); bolt();
  announce('O VENTO VIROU!', 'red');
  if (p && p.alive) cutKite(p, null);
  else { r.overT = Math.max(r.overT, 1.2); }
}
async function retryPending() {
  const pd = getPending();
  if (!pd || !Auth.logged) return;
  try {
    if (pd.action === 'cashout') { const j = await Api.cashout(pd.round); acct.balance = j.balance; toast(`💰 Saque confirmado: 🪙 ${money(j.win)}`, 'green'); }
    else { const j = await Api.lose(pd.round); acct.balance = j.balance; }
    setPending(null); updBalance();
  } catch (e) { if (e.status && e.status !== 0) setPending(null); }
}

/* contador subindo */
function countUp(el, from, to, dur = 900, fmtFn = money, silent = false) {
  const t0 = performance.now();
  let lastTick = 0;
  const step = now => {
    const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtFn(Math.round(lerp(from, to, e)));
    if (!silent && now - lastTick > 60 && k < 1) { Sound.tick(); lastTick = now; }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/* moedas voando até um alvo */
function flyCoins(fromEl, toEl, n = 12) {
  if (!fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('span'); c.className = 'coin flycoin'; app.appendChild(c);
    const sx = a.left + a.width / 2 - AX + rnd(-30, 30), sy = a.top + a.height / 2 - AY + rnd(-10, 10);
    const ex = b.left + b.width / 2 - AX, ey = b.top + b.height / 2 - AY;
    c.style.left = sx + 'px'; c.style.top = sy + 'px';
    const anim = c.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
      { transform: `translate(calc(-50% + ${rnd(-50, 50)}px), calc(-50% - ${rnd(40, 90)}px)) scale(1.2)`, opacity: 1, offset: .35 },
      { transform: `translate(calc(-50% + ${ex - sx}px), calc(-50% + ${ey - sy}px)) scale(.7)`, opacity: 1 },
    ], { duration: 750 + i * 45, easing: 'cubic-bezier(.5,0,.3,1)', delay: i * 35 });
    anim.onfinish = () => { c.remove(); Sound.coin(); pulse('#resBal'); };
  }
}

function showResult(kind, d) {
  state = 'result'; resHero.kind = kind; resHero.t = 0;
  const r = run;
  $('#hud').classList.add('hidden'); $('#hint').classList.add('hidden');
  Sound.silence(); Sound.music('menu'); keepAwake(false);
  const el = $('#result'), box = $('#resBox');
  el.className = 'screen center res-' + kind;
  const counts = d.counts || (r && r.counts) || {};
  const rows = KINDS.filter(k => counts[k]).map(k => `<li><span>${KIND_NOME[k]} × ${counts[k]}</span><b>${r && r.bet ? '+' + (counts[k] * (acct.cfg.pct[k] || 0)) + '%' : ''}</b></li>`).join('');
  let h = '';
  if (kind === 'won') {
    const lucro = d.win - d.stake;
    h = `<div class="ribbon green">${lucro > 0 ? 'SACOU!' : 'DEVOLVIDA'}</div><canvas id="resHero" class="res-hero"></canvas>
      <div class="res-big"><span class="coin"></span><span id="resNum">0,00</span></div>
      <div class="res-sub">Aposta 🪙 ${money(d.stake)} · <b>+${d.pct}%</b> · lucro <b>${lucro > 0 ? '+' : ''}${money(lucro)}</b></div>`;
  } else if (kind === 'lost') {
    h = `<div class="ribbon red">CORTADO!</div><canvas id="resHero" class="res-hero"></canvas>
      <div class="res-big bad">−<span class="coin"></span>${money(d.stake)}</div>
      <div class="res-sub">${d.pct ? `Você tinha <b>+${d.pct}%</b> acumulado. Da próxima, saque antes!` : 'Treine a relada e tente de novo.'}</div>`;
  } else if (kind === 'wind') {
    h = `<div class="ribbon red">O VENTO VIROU!</div><canvas id="resHero" class="res-hero"></canvas>
      <div class="res-big bad">−<span class="coin"></span>${money(d.stake)}</div>
      <div class="res-sub">O vento desta rodada virava em <b>${d.windAt ? d.windAt.toFixed(2).replace('.', ',') + 'x' : '—'}</b> e você chegou nele com <b>+${d.pct}%</b>. Da próxima, saque antes!</div>`;
  } else if (kind === 'practice') {
    h = `<div class="ribbon blue">FIM DO TREINO</div><canvas id="resHero" class="res-hero"></canvas>
      <div class="res-big">${r ? r.cuts : 0} corte${r && r.cuts === 1 ? '' : 's'}</div>
      <div class="res-sub">Chegou na onda <b>${r ? r.wave : 1}</b>. Sem aposta, sem risco.</div>`;
  } else h = `<div class="ribbon red">ENCERRADA</div><div class="res-ic">⚠️</div><div class="res-sub">${esc(d.msg || 'Algo deu errado.')}</div>`;
  if (rows) h += `<ul class="res-list">${rows}</ul>`;
  if (acct) h += `<div class="res-bal" id="resBal">Saldo <span class="coin"></span><b id="resBalV">${money(kind === 'won' ? d.before : acct.balance)}</b></div>`;
  const againLbl = kind === 'practice' ? 'TREINAR DE NOVO' : `APOSTAR 🪙 ${money(P.stake)}`;
  h += `<div class="row"><button class="btn btn-2" id="resLobby">LOBBY</button><button class="btn btn-play" id="resAgain"><span>${againLbl}</span></button></div>`;
  box.innerHTML = h;
  el.classList.remove('hidden');
  if (kind === 'won') {
    countUp($('#resNum'), 0, d.win, 1000);
    setTimeout(() => { flyCoins($('#resNum'), $('#resBal'), 12); countUp($('#resBalV'), d.before, acct.balance, 1100); }, 1050);
  }
  $('#resLobby').onclick = () => { Sound.click(); goLobby(); };
  $('#resAgain').onclick = () => { Sound.click(); startRound(kind === 'practice'); };
  if (r) { r.demo = true; r.player = null; r.powers = []; r.boss = null; r.bet = null; }
  $('#bossBar').classList.add('hidden');
  if (P.tips) { P.tips = false; savePrefs(); }
}

/* =========================================================
   PAUSA / TELAS
   ========================================================= */
function pause() {
  if (state !== 'play') return;
  state = 'pause';
  Sound.silence(); Sound.muffle(true);
  renderPause(); showScreen('#pause');
}
function renderPause() {
  const p = run.player;
  const canCash = run.bet && p && p.alive && !p.contact && p.launch <= 0;
  $('#pCash').classList.toggle('hidden', !run.bet);
  $('#pCash').disabled = !canCash;
  $('#pCashLbl').textContent = run.bet ? `SACAR 🪙 ${money(calcWin(run.bet.stake, run.counts, acct.cfg).win)}` : '';
  $('#pQuit').classList.toggle('hidden', !!run.bet);
  $('#pMusic').textContent = P.opt.music ? '🎵 Música' : '🎵 Música (off)';
  $('#pSfx').textContent = P.opt.sfx ? '🔊 Efeitos' : '🔇 Efeitos (off)';
}
function resume() {
  if (state !== 'pause') return;
  if (rotMQ.matches) return;
  state = 'play'; Sound.muffle(false); Sound.crowdAmb(.7); showScreen(null);
  $('#hud').classList.remove('hidden');
  last = performance.now();
}
const SCREENS = ['#auth', '#lobby', '#pause', '#result'];
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  if (id !== null) $('#hud').classList.add('hidden');
}
let openSheetName = null;
function openSheet(name) {
  $$('.sheet').forEach(s => s.classList.remove('open'));
  const el = $('#sheet-' + name);
  if (!el) return;
  openSheetName = name;
  ({ char: renderChar, maps: renderMaps, kites: renderKites, pay: renderPayout, hist: renderLists, how: renderHow, settings: renderSettings, wallet: renderWallet, indicacao: renderIndicacao }[name] || (() => {}))();
  el.classList.add('open');
  Sound.whoosh();
}
function closeSheets(silent) { if (openSheetName === 'char') drawAvatar(); if (openSheetName === 'wallet') stopDepositPoll(); $$('.sheet').forEach(s => s.classList.remove('open')); openSheetName = null; if (!silent) Sound.back(); }

/* =========================================================
   CARTEIRA — depósito PIX, saque e extrato (dinheiro real,
   pela carteira do backend padrão BlockWin).
   ========================================================= */
const centsFromStr = s => {
  const v = Math.round(parseFloat(String(s).replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.')) * 100);
  return isFinite(v) && v > 0 ? v : 0;
};
let walletDepInfo = null, depPollT = null;

function walletTab(w) {
  $$('#walletTabs .tab').forEach(b => b.classList.toggle('on', b.dataset.w === w));
  $('#wDep').classList.toggle('hidden', w !== 'dep');
  $('#wSaq').classList.toggle('hidden', w !== 'saq');
  $('#wExt').classList.toggle('hidden', w !== 'ext');
  if (w === 'ext') loadExtrato();
}
function wDepShowForm() { stopDepositPoll(); $('#wDepForm').classList.remove('hidden'); $('#wDepPix').classList.add('hidden'); }
function stopDepositPoll() { if (depPollT) { clearInterval(depPollT); depPollT = null; } }

function renderWallet() {
  walletTab('dep');
  wDepShowForm();
  $('#wDepErr').hidden = true; $('#wSaqErr').hidden = true;
  Api.depositInfo().then(info => {
    walletDepInfo = info;
    const mn = info.depositoMinimoCents || 0, mx = info.depositoMaximoCents || 0;
    $('#wDepMin').textContent = `mín. ${money(mn)} · máx. ${money(mx)}`;
    const chips = [2000, 5000, 10000, 20000, 50000].filter(v => (!mn || v >= mn) && (!mx || v <= mx));
    $('#wDepChips').innerHTML = chips.map(v => `<button class="chip big" data-v="${v}">🪙 ${money(v)}</button>`).join('');
    $$('#wDepChips .chip').forEach(b => b.onclick = () => { Sound.pop(); $('#wDepVal').value = money(+b.dataset.v); });
  }).catch(() => {});
  Api.withdrawInfo().then(info => {
    const mn = info.saqueMinimoCents ?? info.saque_minimo_cents ?? 0;
    const mx = info.saqueMaximoCents ?? info.saque_maximo_cents ?? 0;
    $('#wSaqMin').textContent = mx ? `mín. ${money(mn)} · máx. ${money(mx)}` : (mn ? `mín. ${money(mn)}` : '');
  }).catch(() => {});
}

async function loadExtrato() {
  try {
    const j = await Api.wallet();
    if (typeof j.balanceCents === 'number') { acct.balance = j.balanceCents; updBalance(); }
    const tx = j.transactions || [];
    const label = { deposit: 'Depósito', withdraw: 'Saque', withdraw_aff: 'Saque de comissão', withdrawal: 'Saque', bonus: 'Bônus', commission: 'Comissão', adjust: 'Ajuste' };
    const st = { COMPLETED: 'ok', PAID: 'ok', PENDING: 'pend', FAILED: 'fail', CANCELED: 'fail', REJECTED: 'fail' };
    $('#wExtEmpty').hidden = tx.length > 0;
    $('#wExtList').innerHTML = tx.map(t => {
      const c = (t.amountCents ?? 0), pos = t.pos ?? String(t.type || '').match(/dep|bonus|commiss/i);
      const s = st[String(t.status || '').toUpperCase()] || 'pend';
      const tag = t.statusLabel ?? t.status ?? '';
      return `<li><span>${esc(label[t.type] || t.type || 'Movimentação')} ${tag ? `<small class="tag ${s}">${esc(tag)}</small>` : ''}${t.note ? `<small class="note-x">${esc(t.note)}</small>` : ''}</span><span class="amt ${pos ? 'green' : 'red'}">${pos ? '+' : '−'}${money(Math.abs(c))}</span></li>`;
    }).join('');
  } catch (e) { apiError(e); }
}

/* --- depósito --- */
$('#wDepBtn').onclick = async () => {
  const btn = $('#wDepBtn'), err = $('#wDepErr');
  const cents = centsFromStr($('#wDepVal').value);
  err.hidden = true;
  if (!cents) { err.textContent = 'Digite um valor válido.'; err.hidden = false; Sound.deny(); return; }
  btn.disabled = true; btn.classList.add('loading');
  try {
    const j = await Api.deposit(cents);
    if (j.pixCode) {
      $('#wPixCode').value = j.pixCode;
      $('#wPixQr').src = j.qrcode || '';
      $('#wPixQr').style.display = j.qrcode ? '' : 'none';
      $('#wDepForm').classList.add('hidden');
      $('#wDepPix').classList.remove('hidden');
      startDepositPoll();
      Sound.pop();
    } else {
      // deposito auto-confirmado (modo dev): já creditou
      if (typeof j.balanceCents === 'number') { acct.balance = j.balanceCents; updBalance(); }
      toast('💰 Depósito confirmado!', 'green'); closeSheets(true);
    }
  } catch (e) { err.textContent = e.message; err.hidden = false; Sound.deny(); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
};
$('#wPixCopy').onclick = async () => {
  const i = $('#wPixCode'), code = (i && i.value) || '';
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {}
  if (!ok && i) {
    // fallback mobile: precisa tirar o readonly e selecionar de verdade
    const ro = i.hasAttribute('readonly'); i.removeAttribute('readonly');
    i.focus(); i.select(); try { i.setSelectionRange(0, code.length); } catch (e) {}
    try { ok = document.execCommand('copy'); } catch (e) {}
    if (ro) i.setAttribute('readonly', ''); i.blur();
  }
  Sound.pop();
  toast(ok ? '✅ Código PIX copiado!' : 'Toque e segure no código para copiar.', ok ? 'gold' : 'bad');
};
$('#wDepBack').onclick = () => { wDepShowForm(); Sound.back(); };
$('#wPixDone').onclick = () => checkDeposit(true);

function startDepositPoll() {
  stopDepositPoll();
  const before = acct.balance;
  depPollT = setInterval(async () => {
    try {
      const j = await Api.wallet();
      if (typeof j.balanceCents === 'number' && j.balanceCents > before) {
        acct.balance = j.balanceCents; updBalance();
        stopDepositPoll();
        toast('💰 Depósito recebido!', 'green'); confettiBurst(); Sound.cheer(1);
        closeSheets(true);
      }
    } catch (e) {}
  }, 4000);
}
async function checkDeposit(manual) {
  try {
    const j = await Api.wallet();
    const before = acct.balance;
    if (typeof j.balanceCents === 'number') { acct.balance = j.balanceCents; updBalance(); }
    if (manual) {
      if (acct.balance > before) { stopDepositPoll(); toast('💰 Depósito recebido!', 'green'); confettiBurst(); closeSheets(true); }
      else toast('Ainda não caiu. Assim que o PIX for pago, seu saldo entra sozinho.', '');
    }
  } catch (e) { apiError(e); }
}

/* --- saque --- */
$('#wSaqBtn').onclick = async () => {
  const btn = $('#wSaqBtn'), err = $('#wSaqErr');
  err.hidden = true;
  const cents = centsFromStr($('#wSaqVal').value);
  const pix = $('#wSaqPix').value.trim(), cpf = $('#wSaqCpf').value.replace(/\D/g, '');
  if (!cents) { err.textContent = 'Digite um valor válido.'; err.hidden = false; Sound.deny(); return; }
  if (!pix) { err.textContent = 'Informe sua chave PIX.'; err.hidden = false; Sound.deny(); return; }
  if (cpf.length !== 11) { err.textContent = 'CPF inválido (11 dígitos).'; err.hidden = false; Sound.deny(); return; }
  btn.disabled = true; btn.classList.add('loading');
  try {
    const r = await Api.withdraw(cents, pix, cpf);
    const j = await Api.wallet().catch(() => null);
    if (j && typeof j.balanceCents === 'number') { acct.balance = j.balanceCents; updBalance(); }
    $('#wSaqVal').value = '';
    const st = r && r.withdrawal && r.withdrawal.status;
    toast(st === 'paid' ? '✅ Saque enviado pro seu PIX!' : st === 'review' ? '⏳ Saque solicitado! Ele passa por uma análise rápida — acompanhe pelo extrato.' : '✅ Saque solicitado! Acompanhe pelo extrato.', 'green'); Sound.cheer(1);
    walletTab('ext');
  } catch (e) { err.textContent = e.message; err.hidden = false; Sound.deny(); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
};
$$('#walletTabs .tab').forEach(b => b.onclick = () => { Sound.tap(); walletTab(b.dataset.w); });

/* =========================================================
   INDIQUE E GANHE (afiliado) — link, stats e saque de comissão
   ========================================================= */
let indInfo = null;
function renderIndicacao() {
  $('#indSaqErr').hidden = true;
  Api.indicacao().then(j => {
    indInfo = j;
    $('#indLink').value = j.link || '';
    $('#indCode').textContent = j.codigo || '—';
    const lv = j.niveisLabel || [];
    ['#indN1', '#indN2', '#indN3'].forEach((id, i) => { $(id).textContent = lv[i] || '—'; });
    const fmtMin = j.cpaDepositoMinCents ? ' de pelo menos R$ ' + money(j.cpaDepositoMinCents) : '';
    $('#indTxt').innerHTML = !j.ativo ? 'O programa de indicação está pausado no momento.'
      : j.modelo === 'cpa' ? `Compartilhe seu link. Você ganha um valor fixo quando seu indicado faz o <b>primeiro depósito</b>${fmtMin} — <b>em até 3 níveis</b>.`
      : j.modelo === 'revshare' ? 'Compartilhe seu link. Você ganha uma parte do que a casa fatura com as rodadas dos seus indicados — <b>em até 3 níveis</b>.'
      : 'Compartilhe seu link. Você ganha uma parte de <b>cada depósito</b> dos seus indicados — <b>em até 3 níveis</b>.';
    $('#indQtd').textContent = (j.n1Count || 0) + (j.n2Count || 0) + (j.n3Count || 0);
    $('#indTotal').textContent = money(j.totalCommissionCents || 0);
    $('#indSaldo').textContent = money(j.affiliateBalanceCents || 0);
    $('#indSaqMin').textContent = 'mín. R$ ' + money(j.saqueMinCents || 0) + ' · saldo ' + money(j.affiliateBalanceCents || 0);
  }).catch(e => apiError(e));
}
async function copyText(val, okMsg) {
  let ok = false;
  try { await navigator.clipboard.writeText(val); ok = true; } catch (e) {}
  if (!ok) { const t = document.createElement('textarea'); t.value = val; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.focus(); t.select(); try { ok = document.execCommand('copy'); } catch (e) {} t.remove(); }
  Sound.pop(); toast(ok ? okMsg : 'Copie manualmente.', ok ? 'gold' : 'bad');
}
$('#indCopy').onclick = () => copyText($('#indLink').value, '✅ Link copiado!');
$('#indShare').onclick = async () => {
  const link = $('#indLink').value, txt = 'Vem jogar Pipa Combate comigo! 🪁 Cadastre pelo meu link: ' + link;
  Sound.pop();
  if (navigator.share) { try { await navigator.share({ title: 'Pipa Combate', text: txt, url: link }); return; } catch (e) {} }
  copyText(txt, '✅ Convite copiado! Cole no WhatsApp.');
};
$('#indSaqBtn').onclick = async () => {
  const btn = $('#indSaqBtn'), err = $('#indSaqErr');
  err.hidden = true;
  const cents = centsFromStr($('#indSaqVal').value);
  const pix = $('#indSaqPix').value.trim(), cpf = $('#indSaqCpf').value.replace(/\D/g, '');
  if (!cents) { err.textContent = 'Digite um valor válido.'; err.hidden = false; Sound.deny(); return; }
  if (!pix) { err.textContent = 'Informe sua chave PIX.'; err.hidden = false; Sound.deny(); return; }
  if (cpf.length !== 11) { err.textContent = 'CPF inválido (11 dígitos).'; err.hidden = false; Sound.deny(); return; }
  btn.disabled = true; btn.classList.add('loading');
  try {
    await Api.withdrawAffiliate(cents, pix, cpf);
    $('#indSaqVal').value = '';
    toast('✅ Saque de comissão solicitado!', 'green'); Sound.cheer(1);
    renderIndicacao();
  } catch (e) { err.textContent = e.message; err.hidden = false; Sound.deny(); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
};
function openModal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); Sound.pop(); }
function closeModal() { $('#modal').classList.add('hidden'); }
function showBusy(t) { $('#busyTxt').textContent = t; $('#busy').classList.remove('hidden'); }
function hideBusy() { $('#busy').classList.add('hidden'); }
function setBusyBtn(on) { const b = $('#btnBet'); b.disabled = on; b.classList.toggle('loading', on); }
function apiError(e) {
  if (e.status === 401 || e.status === 403) { toast(esc(e.message), 'bad'); logout(true); return; }
  toast(esc(e.message), 'bad'); Sound.deny();
}

/* =========================================================
   CONTA
   ========================================================= */
function authTab(t) {
  $$('#authTabs .tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('#fLogin').classList.toggle('hidden', t !== 'login');
  $('#fReg').classList.toggle('hidden', t !== 'reg');
}
function formErr(f, msg) { const e = f.querySelector('.err'); e.textContent = msg; e.hidden = !msg; if (msg) { Sound.deny(); pulse('#' + f.id); } }
function formBusy(f, on) { const b = f.querySelector('button[type=submit]'); b.disabled = on; b.classList.toggle('loading', on); }
$$('#authTabs .tab').forEach(b => b.onclick = () => { Sound.tap(); authTab(b.dataset.t); });
$('#fLogin').addEventListener('submit', async e => {
  e.preventDefault(); Sound.init();
  const f = e.target;
  formErr(f, ''); formBusy(f, true);
  try {
    const j = await Api.login(f.phone.value.trim(), f.password.value);
    Auth.set(j.token, j.user); f.reset();
    enterLobby(`Bem-vindo de volta, <b>${esc(j.user.username)}</b>!`);
  } catch (err) { formErr(f, err.message); }
  finally { formBusy(f, false); }
});
$('#fReg').addEventListener('submit', async e => {
  e.preventDefault(); Sound.init();
  const f = e.target;
  formErr(f, '');
  const nome = f.name.value.trim();
  const fone = f.phone.value.replace(/\D/g, '');
  if (nome.length < 2) return formErr(f, 'Informe seu nome (mín. 2 letras).');
  if (fone.length < 10 || fone.length > 11) return formErr(f, 'Telefone com DDD, ex.: (11) 99999-9999.');
  if (f.password.value.length < 8) return formErr(f, 'A senha precisa ter pelo menos 8 caracteres.');
  if (f.password.value !== f.password2.value) return formErr(f, 'As senhas não conferem.');
  if (!f.aceite.checked) return formErr(f, 'Confirme que é maior de 18 anos.');
  formBusy(f, true);
  try {
    const j = await Api.register(nome, fone, f.password.value, f.ref.value.trim());
    Auth.set(j.token, j.user); f.reset();
    try { localStorage.removeItem(REF_KEY); } catch (e) {}
    enterLobby(`Conta criada! Bem-vindo, <b>${esc(j.user.username)}</b> 🎉`);
    confettiBurst(); Sound.cheer(1);
    setTimeout(() => openSheet('char'), 900);
  } catch (err) { formErr(f, err.message); }
  finally { formBusy(f, false); }
});
function enterLobby(msg) {
  state = 'lobby';
  showScreen('#lobby');
  renderLobby(); refreshLobby();
  if (msg) toast(msg, 'gold');
  Sound.music('menu'); Sound.crowdAmb(0);
}
async function logout(expired) {
  if (!expired) await Api.logout();
  Auth.clear(); acct = null;
  closeSheets(true); closeModal();
  state = 'auth'; showScreen('#auth'); authTab('login');
  if (!expired) toast('Você saiu da conta.');
}

/* =========================================================
   LOBBY
   ========================================================= */
async function refreshLobby() {
  try {
    const j = await Api.lobby();
    acct = { balance: j.balance, cfg: j.cfg, history: j.history, top: j.top, canRefill: j.canRefill };
    if (j.cfg.rtp) $("#howRtp").textContent = String(j.cfg.rtp).replace(".", ",") + "%";
    Auth.set(Auth.token, j.user);
    await retryPending();
    renderLobby();
  } catch (e) { apiError(e); }
}
function drawAvatar() {
  const cv = $('#uAva'); if (!cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 42, h = cv.clientHeight || 42;
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const s = w / 31, feet = h + 27 * s;
  Art.drawFigure(c, w / 2, feet, 0, 0, P.kid, s, { view: 'front', pose: 'pipa', t: 1 });
}
function updBalance() {
  if (!acct) return;
  $$('.js-bal').forEach(e => {
    const from = Math.round(parseFloat(e.textContent.replace(/\./g, '').replace(',', '.')) * 100);
    if (isFinite(from) && from !== acct.balance && e.offsetParent) countUp(e, from, acct.balance, 700, money, true); else e.textContent = money(acct.balance);
  });
}
/* bonequinho animado na tela de resultado e no cadastro */
const resHero = { kind: '', t: 0 };
function heroCanvas(cv, draw) {
  if (!cv) return; const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); draw(c, w, h);
}
function drawResHero(dt) {
  resHero.t += dt;
  heroCanvas($('#resHero'), (c, w, h) => {
    const s = Math.min(2.2, (h - 12) / 60), feet = h - 8, t = resHero.t, k = resHero.kind;
    const g = c.createRadialGradient(w / 2, feet - 30 * s, 4, w / 2, feet - 30 * s, 60 * s); g.addColorStop(0, k === 'lost' || k === 'wind' ? 'rgba(248,113,113,.28)' : 'rgba(250,204,21,.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (k === 'won') Art.drawFigure(c, w / 2, feet, 0, 0, P.kid, s, { view: 'front', pose: 'festa', t, td: t % 2.4, beat: Sound.beat() });
    else if (k === 'lost' || k === 'wind') Art.drawFigure(c, w / 2, feet, 0, 0, P.kid, s, { view: 'front', pose: 'triste', t, td: t });
    else Art.drawFigure(c, w / 2, feet, 0, 0, P.kid, s, { view: 'front', pose: 'pipa', t, act: 'joinha', at: Math.min(t % 3, .6), beat: Sound.beat() });
  });
}
let authT = 0;
function drawAuthHero(dt) {
  authT += dt;
  heroCanvas($('#authHero'), (c, w, h) => {
    const s = Math.min(1.8, (h - 8) / 58), feet = h - 4;
    Art.drawFigure(c, w / 2, feet, 0, 0, P.kid, s, { view: 'front', pose: 'pipa', t: authT, act: 'acena', at: .3 + (authT % 2.4) * .25, beat: Sound.beat() });
  });
}
function updMapTag() { $('#mapTag').textContent = `${mapDef.ic} ${mapDef.nome}`; }
function renderLobby() {
  $('#uName').textContent = Auth.user ? Auth.user.username : '';
  drawAvatar();
  updBalance(); updMapTag(); renderStake();
  renderMaps(); renderKites(); renderPayout(); renderLists();
  if (acct) {
    $('#btnRefill').classList.toggle('hidden', !acct.canRefill);
    $('#refillVal').textContent = money(acct.cfg.recarga_valor);
  }
}
function renderStake() {
  if (!acct) { $('#btnBet').disabled = true; return; }
  const c = acct.cfg;
  P.stake = clamp(Math.round(P.stake), c.stake_min, c.stake_max);
  $('#stakeTxt').textContent = money(P.stake);
  const ok = P.stake <= acct.balance;
  $('#btnBet').disabled = !ok || busy;
  $('#betLbl').innerHTML = ok ? `APOSTAR <span class="coin"></span> ${money(P.stake)}` : 'SALDO INSUFICIENTE';
}
function setStake(v) { P.stake = clamp(Math.round(v), acct.cfg.stake_min, acct.cfg.stake_max); savePrefs(); renderStake(); renderPayout(); pulse('#stakeVal'); }
function openStake() {
  if (!acct) return;
  const c = acct.cfg;
  openModal(`<div class="ribbon">VALOR DA APOSTA</div>
    <div class="chips wrap c">${c.stakes.map(v => `<button class="chip big ${v === P.stake ? 'on' : ''}" data-v="${v}">🪙 ${money(v)}</button>`).join('')}</div>
    <div class="stake-row">
      <button class="sbtn" data-m="half">½</button>
      <label class="stake-inp"><span class="coin"></span><input id="stakeInp" inputmode="decimal" autocomplete="off" value="${money(P.stake)}"></label>
      <button class="sbtn" data-m="double">2x</button>
    </div>
    <p class="note c">mín. ${money(c.stake_min)} · máx. ${money(c.stake_max)} · saldo ${money(acct.balance)}</p>
    <button class="btn btn-play" id="stakeOk"><span>CONFIRMAR</span></button>`);
  const inpS = $('#stakeInp');
  const fromInp = () => { const v = Math.round(parseFloat(inpS.value.replace(/\./g, '').replace(',', '.')) * 100); return isFinite(v) && v > 0 ? v : P.stake; };
  $$('#modalCard .chip').forEach(b => b.onclick = () => { Sound.pop(); inpS.value = money(+b.dataset.v); $$('#modalCard .chip').forEach(x => x.classList.toggle('on', x === b)); });
  $$('#modalCard .sbtn').forEach(b => b.onclick = () => { Sound.pop(); const v = fromInp(); inpS.value = money(clamp(b.dataset.m === 'half' ? Math.floor(v / 2) : Math.min(v * 2, acct.balance), c.stake_min, c.stake_max)); });
  $('#stakeOk').onclick = () => { setStake(fromInp()); closeModal(); Sound.boing(); };
}

/* ---------- painéis ---------- */
const mapThumbs = {};
function mapThumb(m) {
  if (mapThumbs[m.id]) return mapThumbs[m.id];
  const w = 168, h = 110, c = Art.genCity(m, w, h, .55);
  return (mapThumbs[m.id] = Art.buildBackground(m, w, h, Math.min(window.devicePixelRatio || 1, 2), .55, c));
}
function renderMaps() {
  $$('#optStyle button').forEach(b => b.classList.toggle('on', b.dataset.v === P.opt.style));
  const g = $('#mapGrid');
  if (!g.children.length) {
    g.innerHTML = MAPS.map(m => `<button class="map" data-map="${m.id}"><canvas></canvas><span class="map-n">${m.ic} ${m.nome}</span><span class="map-d">${m.desc}</span><span class="map-diff">${'🔥'.repeat(Math.round((m.diff - .9) * 5))}</span></button>`).join('');
    $$('#mapGrid .map').forEach(b => {
      const cv = b.querySelector('canvas'), t = mapThumb(mapById(b.dataset.map));
      cv.width = t.width; cv.height = t.height; cv.getContext('2d').drawImage(t, 0, 0);
      b.onclick = () => { Sound.pop(); setMap(b.dataset.map); renderMaps(); };
    });
  }
  $$('#mapGrid .map').forEach(b => b.classList.toggle('sel', b.dataset.map === P.map));
}
function renderKites() {
  const g = $('#kiteGrid');
  if (!g.children.length) {
    g.innerHTML = SKINS.map(s => `<button class="kite" data-k="${s.id}"><canvas></canvas><span>${s.nome}</span></button>`).join('');
    $$('#kiteGrid .kite').forEach(b => {
      Art.kitePreview(b.querySelector('canvas'), skinById(b.dataset.k), skinById(b.dataset.k).shape, true);
      b.onclick = () => { Sound.pop(); P.skin = b.dataset.k; savePrefs(); hero.tail = []; renderKites(); };
    });
  }
  $$('#kiteGrid .kite').forEach(b => b.classList.toggle('sel', b.dataset.k === P.skin));
}
function renderPayout() {
  if (!acct) return;
  const c = acct.cfg, g = $('#payout');
  if (!g.children.length) {
    g.innerHTML = KINDS.map(k => `<div class="pay" data-k="${k}"><canvas></canvas><span class="pay-n">${KIND_NOME[k]}</span><b class="pay-p"></b><small class="pay-v"></small></div>`).join('');
    $$('#payout .pay').forEach(el => {
      const k = el.dataset.k, cv = el.querySelector('canvas');
      if (k === 'chefe') Art.kitePreview(cv, BOSSES[0].look, BOSSES[0].shape, false);
      else if (k === 'aparar') Art.kitePreview(cv, { c1: '#94a3b8', c2: '#e2e8f0', pat: 'split' }, 'raia', true);
      else { const T = ENEMIES[k]; Art.kitePreview(cv, T.thief ? THIEF_LOOK : T.redline ? CUTTER_LOOK : ENEMY_LOOKS[KINDS.indexOf(k)], T.shape, false); }
    });
  }
  $$('#payout .pay').forEach(el => {
    const k = el.dataset.k, pc = c.pct[k] || 0;
    el.querySelector('.pay-p').textContent = `+${pc}%`;
    el.querySelector('.pay-v').textContent = `+🪙 ${money(Math.floor(P.stake * pc / 100))}`;
  });
  $('#capNote').textContent = `Ganho máximo por rodada: ${c.cap}x a aposta (🪙 ${money(P.stake * c.cap)}).`;
}
function renderLists() {
  if (!acct) return;
  const ic = id => (MAPS.find(m => m.id === id) || MAPS[0]).ic;
  const hist = acct.history || [];
  $('#histList').innerHTML = hist.length ? hist.map((h, i) => {
    const won = h.status === 'won';
    const fim = h.reason === 'wind' ? ' · 🌪️' : '';
    return `<li class="${won ? 'w' : 'l'} tap" data-i="${i}"><span>${ic(h.map)} ✂️ ${h.cuts} · +${h.pct}%${fim}</span><span class="amt">${won ? '+' + money(h.win - h.stake) : '−' + money(h.stake)} ›</span></li>`;
  }).join('') : '<li class="empty">Nenhuma rodada ainda. Bora voar!</li>';
  $$('#histList li[data-i]').forEach(li => li.onclick = () => { Sound.tap(); showRoundCheck(hist[+li.dataset.i]); });
  const top = acct.top || [];
  $('#topList').innerHTML = top.length ? top.map((t, i) => `<li><span><i class="pos">${i + 1}</i> ${esc(t.username)} ${ic(t.map)}</span><span class="amt">+${money(t.win - t.stake)} <small>${(t.win / t.stake).toFixed(1)}x</small></span></li>`).join('')
    : '<li class="empty">Ninguém sacou essa semana ainda.</li>';
}

/* ---------- sorteio verificável (provably fair) ----------
   O ponto em que o vento vira é sorteado antes da rodada com HMAC(server_seed,
   "client_seed:nonce"). O hash da server_seed é mostrado antes; ao trocar a
   seed ela é revelada e qualquer um recalcula o vento aqui, no navegador. */
const fmtX = x => (x == null ? '—' : x.toFixed(2).replace('.', ',') + 'x');
const short = s => (s ? esc(s.slice(0, 10)) + '…' + esc(s.slice(-6)) : '—');
const FIM = { cashed: 'Sacou', wind: 'O vento virou', cut: 'Pipa cortada', forfeit: 'Desistiu', timeout: 'Encerrada por tempo' };
function showRoundCheck(h) {
  const won = h.status === 'won';
  openModal(`<div class="ribbon ${won ? 'green' : 'red'}">RODADA</div>
    <ul class="fair-kv">
      <li><span>Resultado</span><b>${esc(FIM[h.reason] || (won ? 'Sacou' : 'Perdeu'))}</b></li>
      <li><span>Aposta</span><b>${money(h.stake)}</b></li>
      <li><span>Cortes</span><b>${h.cuts} · +${h.pct}%</b></li>
      <li><span>${won ? 'Recebeu' : 'Perdeu'}</span><b>${money(won ? h.win : h.stake)}</b></li>
      <li><span>Vento virava em</span><b>${fmtX(h.wind)}</b></li>
      <li><span>Nonce</span><b>${esc(h.nonce)}</b></li>
      <li><span>Client seed</span><b>${esc(h.clientSeed || '—')}</b></li>
      <li><span>Hash da server seed</span><b class="mono">${short(h.serverSeedHash)}</b></li>
      <li><span>Server seed</span><b class="mono">${h.serverSeed ? short(h.serverSeed) : 'ainda secreta'}</b></li>
    </ul>
    <p id="fairOut">${h.serverSeed ? 'Toque em verificar para recalcular o vento aqui no seu aparelho.' : 'A server seed desta rodada ainda está em uso. Revele (troca de seed) para poder verificar.'}</p>
    <div class="row">${h.serverSeed ? '<button class="btn btn-play" id="fairGo"><span>VERIFICAR</span></button>' : '<button class="btn btn-2" id="fairPanel">REVELAR SEED</button>'}</div>`);
  if ($('#fairPanel')) $('#fairPanel').onclick = () => { closeModal(); showFairPanel(); };
  if ($('#fairGo')) $('#fairGo').onclick = async () => {
    const out = $('#fairOut');
    try {
      const c = acct.cfg, r = await windPoint({ serverSeed: h.serverSeed, clientSeed: h.clientSeed, nonce: h.nonce, rtpBps: Math.round(c.rtp * 100), maxMultX100: Math.round(c.cap * 100) });
      const hashOk = r.serverSeedHash === h.serverSeedHash, windOk = Math.abs(r.windX100 / 100 - h.wind) < 1e-9;
      out.innerHTML = hashOk && windOk
        ? `✅ Confere: o hash bate e o vento recalculado deu <b>${fmtX(r.windX100 / 100)}</b>.`
        : `⚠️ Não confere: ${hashOk ? '' : 'o hash não bate. '}${windOk ? '' : `vento recalculado ${fmtX(r.windX100 / 100)}.`}`;
      Sound.pop();
    } catch (e) { out.textContent = 'Seu navegador não conseguiu calcular (precisa de HTTPS ou localhost).'; }
  };
}
async function showFairPanel() {
  let st;
  try { st = await Api.fair(); } catch (e) { return apiError(e); }
  const prev = st.previous;
  openModal(`<div class="ribbon">SORTEIO VERIFICÁVEL</div>
    <p>O vento de cada rodada é sorteado com a sua <b>client seed</b> e uma <b>server seed</b> secreta, cujo hash você vê antes de jogar.</p>
    <ul class="fair-kv">
      <li><span>Hash da server seed atual</span><b class="mono">${short(st.active.serverSeedHash)}</b></li>
      <li><span>Sua client seed</span><b>${esc(st.active.clientSeed)}</b></li>
      <li><span>Próximo nonce</span><b>${esc(st.active.nextNonce)}</b></li>
      ${prev ? `<li><span>Última seed revelada</span><b class="mono">${short(prev.serverSeed)}</b></li>` : ''}
    </ul>
    <input id="fairSeed" class="num-inp" maxlength="64" placeholder="nova client seed (opcional)">
    <p id="fairMsg"></p>
    <div class="row"><button class="btn btn-2" id="fairRotate">REVELAR E TROCAR</button></div>`);
  $('#fairRotate').onclick = async () => {
    const v = $('#fairSeed').value.trim();
    try {
      if (v) await Api.setClientSeed(v); else await Api.rotateSeed();
      Sound.cheer(.6); toast('🔓 Seed revelada! Suas rodadas já podem ser verificadas.', 'gold');
      closeModal(); await refreshLobby(); renderLists();
    } catch (e) { $('#fairMsg').textContent = e.message; Sound.deny(); }
  };
}
function renderHow() {
  const g = $('#rivals');
  if (g.children.length) return;
  const list = Object.entries(ENEMIES).map(([k, T]) => ({ k, nome: T.nome, desc: T.desc, look: T.thief ? THIEF_LOOK : T.redline ? CUTTER_LOOK : ENEMY_LOOKS[KINDS.indexOf(k)], shape: T.shape }))
    .concat(BOSSES.map(B => ({ k: 'chefe', nome: B.nome.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()), desc: 'Aparece a cada 5 ondas', look: B.look, shape: B.shape })));
  g.innerHTML = list.map(r => `<div class="rival"><canvas></canvas><div><b>${r.nome}</b><small>${r.desc}</small></div></div>`).join('');
  $$('#rivals canvas').forEach((cv, i) => Art.kitePreview(cv, list[i].look, list[i].shape, false));
}
function renderSettings() {
  $('#optMusic').checked = P.opt.music; $('#optSfx').checked = P.opt.sfx; $('#optVib').checked = P.opt.vib;
  $$('#optCtrl button').forEach(b => b.classList.toggle('on', b.dataset.v === P.opt.ctrl));
  $$('#optFx button').forEach(b => b.classList.toggle('on', b.dataset.v === P.opt.fx));
  $$('#optStyle2 button').forEach(b => b.classList.toggle('on', b.dataset.v === P.opt.style));
  $('#optSens').value = P.opt.sens; $('#sensVal').textContent = P.opt.sens.toFixed(1) + 'x';
  $('#btnFs').classList.toggle('hidden', !(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen));
  $('#accName').textContent = Auth.user ? Auth.user.username : '';
}

/* ---------- editor do bonequinho ---------- */
let charTab = 'rosto', charPrevDance = -99;
const charAct = { act: '', at: 0, t: 2 };
const TABS = {
  rosto:   [['Tom de pele', 'pele', 'sw', PELES], ['Olhos', 'olhos'], ['Cor dos olhos', 'olhoCor'], ['Boca', 'boca'], ['Sobrancelha', 'sobrancelha'], ['Barba e bigode', 'barba'], ['Detalhe no rosto', 'marca']],
  cabelo:  [['Estilo', 'cabelo'], ['Cor do cabelo', 'corCabelo', 'sw', CORES_CABELO]],
  roupa:   [['Parte de cima', 'top'], ['Manto do time (camisa e regata)', 'manto'], ['Cor principal (cores livres)', 'cor1', 'sw', CORES], ['Cor do detalhe (cores livres)', 'cor2', 'sw', CORES], ['Bermuda', 'bermuda'], ['Cor da bermuda', 'short', 'sw', CORES], ['Calçado', 'calcado'], ['Cor do calçado', 'corCalcado', 'sw', CORES]],
  acess:   [['Óculos', 'oculos'], ['Corrente', 'corrente'], ['Brinco', 'brinco'], ['Relógio', 'relogio'], ['Fone', 'fone']],
  carretel:[['Carretel', 'carretel']],
  danca:   [['Comemoração quando corta', 'danca']],
};
function renderChar() {
  $$('#charTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === charTab));
  const body = $('#charBody');
  body.innerHTML = TABS[charTab].map(([lbl, key, type, list]) => {
    const cur = P.kid[key];
    const opts = type === 'sw'
      ? `<div class="swatches">${list.map(c => `<button class="sw ${cur === c ? 'on' : ''}" style="--c:${c}" data-k="${key}" data-v="${c}" aria-label="${lbl}"></button>`).join('')}</div>`
      : `<div class="opts-grid">${KID[key].map(([v, n]) => `<button class="opt-tile ${cur === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${n}</button>`).join('')}</div>`;
    return `<div class="c-sec"><h4>${lbl}</h4>${opts}</div>`;
  }).join('') + (charTab === 'roupa' ? `<div class="c-sec"><h4>Número da camisa</h4><input id="kidNum" class="num-inp" inputmode="numeric" maxlength="2" value="${esc(P.kid.num)}"></div>` : '');
  $$('#charBody [data-k]').forEach(b => b.onclick = () => {
    P.kid[b.dataset.k] = b.dataset.v; savePrefs();
    if (b.dataset.k === 'danca') { charPrevDance = 0; Sound.boing(); } else Sound.pop();
    renderChar();
  });
  const n = $('#kidNum');
  if (n) n.oninput = () => { P.kid.num = n.value.replace(/\D/g, '').slice(0, 2) || '0'; savePrefs(); };
}
function drawCharPreview(dt) {
  const cv = $('#charPrev');
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, h); mapDef.sky.forEach((col, i) => g.addColorStop([0, .45, .78, 1][i], col));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const t = performance.now() / 1000;
  charPrevDance += dt;
  const s = Math.min(3.1, (h - 40) / 62), feet = h - 26, cx = w / 2;
  Art.drawPlatform(c, cx, feet, Math.min(w * .7, 64 * s), s * .5, !!mapDef.night, t);
  const hx = cx, hy = feet - 36 * s;
  const dancing = charPrevDance >= 0 && charPrevDance < 1.6;

  if (!dancing) { charAct.t -= dt; if (charAct.t <= 0) { charAct.act = pick(['bone', 'olha', 'suor', 'pulo', 'acena']); charAct.at = 0; charAct.t = rnd(2.5, 4); } }
  if (charAct.act) { charAct.at += dt; if (charAct.at > 1.25) charAct.act = ''; }
  drawSpeaker(c, cx - 27 * s, feet, s * .62, Sound.beat());
  const hd = Art.drawFigure(c, cx, feet, 0, 0, P.kid, s, { view: 'front', pose: dancing ? 'festa' : 'pipa', t, td: charPrevDance, pull: .2, beat: Sound.beat(), act: dancing ? '' : charAct.act, at: charAct.at, reel: t * 2 });
  if (!dancing && hd) { c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hd.x, hd.y); c.quadraticCurveTo(hd.x + 26, hd.y - 30, w - 10, 6); c.stroke(); }
}

/* =========================================================
   LIGAÇÕES
   ========================================================= */
const click = fn => e => { Sound.init(); Sound.click(); fn(e); };
$('#btnBet').onclick = () => { Sound.click(); startRound(false); };
$('#btnTrain').onclick = click(() => startRound(true));
$('#btnCash').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cashOut(false); });
$('#btnDash').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dash(); });
$('#btnPause').onclick = click(pause);
$('#btnResume').onclick = click(resume);
$('#pCash').onclick = () => { resume(); cashOut(false); };
$('#pQuit').onclick = click(() => { state = 'play'; showScreen(null); playerLost(); });
$('#pMusic').onclick = () => { P.opt.music = !P.opt.music; savePrefs(); applyAudio(); renderPause(); };
$('#pSfx').onclick = () => { P.opt.sfx = !P.opt.sfx; savePrefs(); applyAudio(); renderPause(); Sound.tap(); };
$('#btnRefill').onclick = async () => {
  Sound.init();
  try { const j = await Api.refill(); acct.balance = j.balance; acct.canRefill = false; Sound.cashout(); toast(`Recarga feita! Saldo 🪙 ${money(j.balance)}`, 'gold'); renderLobby(); pulse('#balBox'); }
  catch (e) { apiError(e); }
};
$('#stakeVal').onclick = click(openStake);
$('#heroBox').addEventListener('click', e => {
  if (e.target.closest('button')) return;
  Sound.init(); Sound.boing(); vib(15);
  const em = pick(['danca', 'joinha', 'muque', 'aponta', 'danca', 'acena']);
  const FALA = { danca: ['BORA!', 'SOLTA O GRAVE!', 'É NÓIS!'], joinha: ['TÁ SUAVE!', 'JOIA!', 'DE BOA!'], muque: ['SÓ OS FORTES!', 'OLHA O MUQUE!'], aponta: ['É TU!', 'VEM PRO X1!'], acena: ['FALA TU!', 'SALVE!'] };
  if (em === 'danca') { hero.danceT = 0; hero.act = ''; } else { hero.danceT = -9; hero.act = em; hero.at = 0; }
  const fv = pick(['buscar', 'saidai', 'dalinha', 'vai']);
  hero.bubble = Sound.voice(fv, 2) ? { txt: FALA_TXT[fv], t: fv === 'saidai' ? 3 : 1.8 } : { txt: pick(FALA[em]), t: 1.4 };
});
$('#charPrev').addEventListener('click', () => { charPrevDance = 0; Sound.boing(); });
$('#mapTag').onclick = () => { Sound.tap(); $('#secMaps').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('#stakeMinus').onclick = () => { Sound.pop(); if (acct) setStake(P.stake - acct.cfg.stake_min); };
$('#stakePlus').onclick = () => { Sound.pop(); if (acct) setStake(P.stake + acct.cfg.stake_min); };
$('#btnFair').onclick = () => { Sound.click(); showFairPanel(); };
$$('#histTabs .tab').forEach(b => b.onclick = () => {
  Sound.tap();
  $$('#histTabs .tab').forEach(x => x.classList.toggle('on', x === b));
  $('#histList').classList.toggle('hidden', b.dataset.t !== 'hist');
  $('#topList').classList.toggle('hidden', b.dataset.t !== 'top');
});
$$('#charTabs button').forEach(b => b.onclick = () => { charTab = b.dataset.t; Sound.tap(); if (charTab === 'danca') charPrevDance = 0; renderChar(); });
$('#btnKidRandom').onclick = () => { rerollKid(); Sound.boing(); charPrevDance = 0; renderChar(); };
$('#btnKidDance').onclick = () => { charPrevDance = 0; Sound.boing(); };
$$('[data-sheet]').forEach(b => b.onclick = () => { Sound.init(); openSheet(b.dataset.sheet); });
$$('.sheet .close').forEach(b => b.onclick = () => closeSheets());
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
$('#btnLogout').onclick = click(() => logout(false));
function applyAudio() { Sound.config({ music: P.opt.music, sfx: P.opt.sfx }); }
$('#optMusic').onchange = e => { P.opt.music = e.target.checked; savePrefs(); applyAudio(); };
$('#optSfx').onchange = e => { P.opt.sfx = e.target.checked; savePrefs(); applyAudio(); Sound.tap(); };
$('#optVib').onchange = e => { P.opt.vib = e.target.checked; savePrefs(); vib(30); };
$('#optSens').oninput = e => { P.opt.sens = +e.target.value; savePrefs(); $('#sensVal').textContent = P.opt.sens.toFixed(1) + 'x'; };
$$('#optCtrl button').forEach(b => b.onclick = () => { P.opt.ctrl = b.dataset.v; savePrefs(); renderSettings(); Sound.tap(); });
$$('#optFx button').forEach(b => b.onclick = () => { P.opt.fx = b.dataset.v; savePrefs(); resize(); renderSettings(); Sound.tap(); });
function setStyle(v) { P.opt.style = v; savePrefs(); resize(); renderSettings(); renderMaps(); Sound.boing(); }
$$('#optStyle button, #optStyle2 button').forEach(b => b.onclick = () => setStyle(b.dataset.v));
$('#btnFs').onclick = () => {
  const d = document, el = d.documentElement;
  if (!d.fullscreenElement && !d.webkitFullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); Sound.silence(); Sound.sleep(); }
  else { Sound.init(); setTimeout(updSoundHint, 150); }
});
const rotMQ = matchMedia('(orientation: landscape) and (max-height: 520px) and (hover: none)');
const onRot = () => { if (rotMQ.matches) pause(); };
rotMQ.addEventListener ? rotMQ.addEventListener('change', onRot) : rotMQ.addListener(onRot);

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}
function goLobby() { $('#result').classList.add('hidden'); enterLobby(); }

/* =========================================================
   LOOP
   ========================================================= */
let perfAcc = 0, perfN = 0, perfT = 0;
let last = performance.now(), resizeT = 0, hintT = 1.2, splash = document.getElementById('splash'), splashT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 120); });
function frame(t) {
  const real = Math.min(.033, (t - last) / 1000);
  last = t;
  if (run && state !== 'pause' && state !== 'ending') {
    let dt = real;
    if (run.slowT > 0) { run.slowT -= real; dt *= run.slowK; if (run.slowT <= 0) run.slowK = 1; }
    run.real += real;
    update(dt);
  }
  draw();
  drawConfetti(real);
  if (state === 'play' && !pixel()) { // mede o desempenho e ajusta sozinho
    perfAcc += (t - (frame.prev || t)); perfN++; perfT += real;
    if (perfT > 2.5) { const avg = perfAcc / perfN; perfAcc = perfN = perfT = 0; if (avg > 23 && dprCap > 1.05 && DPR > 1.05) { dprCap = Math.max(1, Math.min(dprCap, DPR) - .25); resize(); } }
  }
  frame.prev = t;
  if (warmQ.length) warmSprites();
  if (openSheetName === 'char') drawCharPreview(real);
  if (state === 'result') drawResHero(real);
  if (state === 'auth') drawAuthHero(real);
  if (splash) { splashT += real; if (splashT > .7) { const sp = splash; sp.classList.add('out'); setTimeout(() => sp.remove(), 500); splash = null; } }
  hintT -= real; if (hintT <= 0) { hintT = .5; updSoundHint(); }
  requestAnimationFrame(frame);
}
Sound.preload(); // a música oficial já começa a baixar
window.__pcMusic = () => Sound.musicState();
/* seções do lobby entram com animação ao rolar */
const reveal = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); } }), { root: document.getElementById('lbScroll'), threshold: .1 }) : null;
$$('#lbScroll .sec').forEach(el => reveal ? reveal.observe(el) : el.classList.add('in'));
resize();
demoRun();
applyAudio();
// Link de indicação (?ref=CODE): pré-preenche o cadastro e abre a aba criar conta.
// O código fica guardado 30 dias: quem volta depois ainda é atribuído a quem indicou.
const REF_KEY = 'pc_ref', REF_TTL_MS = 30 * 24 * 3600 * 1000;
try {
  let code = (new URLSearchParams(location.search).get('ref') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();
  if (code) localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() }));
  else { const s = JSON.parse(localStorage.getItem(REF_KEY)); if (s && Date.now() - s.at < REF_TTL_MS) code = s.code; }
  if (code) { const fr = $('#fReg'); if (fr && fr.ref) fr.ref.value = code; }
  if (location.search || location.pathname !== '/') history.replaceState(null, '', '/');
} catch (e) {}
if (Auth.logged) enterLobby();
else { state = 'auth'; showScreen('#auth'); authTab('reg'); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Art.clearCache(); buildScene(); });
requestAnimationFrame(frame);
