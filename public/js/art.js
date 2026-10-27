/* Pipa Combate — arte procedural: pipas (com cache de sprites), rabiolas, ícones, moedas, cenários */
import { POW, MANTOS } from './data.js?v=d21';
import { drawEscudo } from './marcas.js?v=d21';

const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6'];

/* ---------- formatos de pipa (coordenadas locais, ~50px de altura) ---------- */
const SHAPES = {
  raia(c)      { c.moveTo(0, -26); c.lineTo(21, -3); c.lineTo(0, 24); c.lineTo(-21, -3); c.closePath(); },
  capucheta(c) { c.moveTo(0, -20); c.lineTo(18, -1); c.lineTo(0, 19); c.lineTo(-18, -1); c.closePath(); },
  papagaio(c)  { c.moveTo(0, -28); c.lineTo(20, -15); c.lineTo(20, 9); c.lineTo(0, 26); c.lineTo(-20, 9); c.lineTo(-20, -15); c.closePath(); },
  arraia(c) {
    c.moveTo(0, -22); c.quadraticCurveTo(22, -18, 32, -4); c.quadraticCurveTo(16, 2, 8, 8); c.lineTo(0, 26);
    c.lineTo(-8, 8); c.quadraticCurveTo(-16, 2, -32, -4); c.quadraticCurveTo(-22, -18, 0, -22); c.closePath();
  },
};
export const TAIL_Y = { raia: 24, capucheta: 19, papagaio: 26, arraia: 26 };
const HALF = { raia: 30, capucheta: 24, papagaio: 31, arraia: 36 };

function star(c, x, y, r1, r2) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? r2 : r1, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}

function paintKite(c, look, shape) {
  const R = 40, { c1, c2, pat } = look;
  c.save();
  c.beginPath(); SHAPES[shape](c); c.clip();
  c.fillStyle = c1; c.fillRect(-R, -R, R * 2, R * 2);
  switch (pat) {
    case 'split': c.fillStyle = c2; c.fillRect(0, -R, R, R * 2); break;
    case 'cross': c.fillStyle = c2; c.fillRect(0, -R, R, R - 3); c.fillRect(-R, -3, R, R + 3); break;
    case 'bands': c.fillStyle = c2; c.fillRect(-R, -11, R * 2, 15); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-R, -3, R * 2, 2.5); break;
    case 'diag':
      c.save(); c.rotate(-.65); c.fillStyle = c2;
      for (let x = -60; x < 60; x += 13) c.fillRect(x, -60, 6, 120);
      c.restore(); break;
    case 'star': star(c, 0, -3, 11, 4.6); c.fillStyle = c2; c.fill(); break;
    case 'dots':
      c.fillStyle = c2;
      for (let y = -30, r = 0; y < 30; y += 9, r++) for (let x = -30 + (r % 2) * 5; x < 30; x += 10) { c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill(); }
      break;
    case 'arco': RAINBOW.forEach((col, i) => { c.fillStyle = col; c.fillRect(-R, -30 + i * 10, R * 2, 10); }); break;
    case 'masson': {
      const g = c.createLinearGradient(0, -26, 21, 24);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#9ca3af'); g.addColorStop(1, '#e5e7eb');
      c.fillStyle = g; c.fillRect(0, -R, R, R * 2);
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(Math.cos(a) * 9, -3 + Math.sin(a) * 9); }
      c.closePath(); c.fillStyle = '#0a0a0a'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#fff'; c.font = "bold 9px 'Lilita One', Arial, sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('M', 0, -2.5);
      break;
    }
  }
  // brilho (volume)
  const gl = c.createLinearGradient(-20, -26, 16, 22);
  gl.addColorStop(0, 'rgba(255,255,255,.38)'); gl.addColorStop(.45, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,.2)');
  c.fillStyle = gl; c.fillRect(-R, -R, R * 2, R * 2);
  c.restore();

  c.beginPath(); SHAPES[shape](c);
  c.lineJoin = 'round'; c.strokeStyle = '#1b1433'; c.lineWidth = 2.2; c.stroke();

  // varetas
  if (look.time) drawEscudo(c, look.time, 0, shape === 'arraia' ? 2 : -2, 9); // escudo do time no centro
  c.strokeStyle = 'rgba(80,50,20,.8)'; c.lineWidth = 1.3; c.beginPath();
  if (shape === 'raia') { c.moveTo(0, -26); c.lineTo(0, 24); c.moveTo(-21, -3); c.quadraticCurveTo(0, -17, 21, -3); }
  else if (shape === 'papagaio') { c.moveTo(0, -28); c.lineTo(0, 26); c.moveTo(-20, -15); c.lineTo(20, 9); c.moveTo(20, -15); c.lineTo(-20, 9); }
  else if (shape === 'arraia') { c.moveTo(0, -22); c.lineTo(0, 26); c.moveTo(-32, -4); c.quadraticCurveTo(0, -20, 32, -4); }
  c.stroke();
  if (shape === 'capucheta') { // franjas laterais
    c.strokeStyle = c2; c.lineWidth = 1.4; c.beginPath();
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { c.moveTo(sx * 18, -1); c.lineTo(sx * (22 + i), 3 + i * 3); }
    c.stroke();
  }
}

/* ---------- cache de sprites ---------- */
const cache = new Map();
export function clearCache() { cache.clear(); }
function sprite(look, shape, s, dpr) {
  const key = `${shape}|${look.c1}|${look.c2}|${look.pat}|${look.time || ''}|${s.toFixed(2)}|${dpr}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const half = HALF[shape] * s, px = Math.ceil(half * 2 * dpr);
  cv = document.createElement('canvas'); cv.width = cv.height = px;
  const c = cv.getContext('2d');
  c.setTransform(s * dpr, 0, 0, s * dpr, px / 2, px / 2);
  paintKite(c, look, shape);
  cv._h = half;
  cache.set(key, cv);
  if (cache.size > 120) cache.delete(cache.keys().next().value);
  return cv;
}
export function drawKite(c, x, y, ang, look, shape, s, dpr, alpha = 1) {
  const sp = sprite(look, shape, s, dpr);
  c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha = alpha;
  c.drawImage(sp, -sp._h, -sp._h, sp._h * 2, sp._h * 2);
  c.restore();
}
/* prévia para a loja */
export function kitePreview(cv, look, shape, withTail = true) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 84, h = cv.clientHeight || 92;
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = Math.min(w, h) / 64;
  if (withTail) {
    const tail = []; for (let i = 0; i < 10; i++) tail.push({ x: w / 2 + Math.sin(i * .8) * 5, y: h * .42 + TAIL_Y[shape] * s + i * 4 });
    drawTail(c, tail, look, s * .8);
  }
  c.save(); c.translate(w / 2, h * .42); c.rotate(-.12); c.scale(s, s); paintKite(c, look, shape); c.restore();
}

/* ---------- rabiola ---------- */
export function drawTail(c, tail, look, s) {
  if (tail.length < 2) return;
  c.strokeStyle = 'rgba(40,30,20,.55)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(tail[0].x, tail[0].y);
  for (let i = 1; i < tail.length; i++) c.lineTo(tail[i].x, tail[i].y);
  c.stroke();
  const cols = look.pat === 'arco' ? RAINBOW : [look.c1, look.c2];
  for (let ci = 0; ci < cols.length; ci++) {
    c.beginPath();
    for (let i = 1, n = 0; i < tail.length; i += 2, n++) {
      if (n % cols.length !== ci) continue;
      const q = tail[i], p = tail[i - 1];
      let dx = q.x - p.x, dy = q.y - p.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const ax = dx * 2.6 * s, ay = dy * 2.6 * s, px = -dy * 5 * s, py = dx * 5 * s;
      c.moveTo(q.x, q.y); c.lineTo(q.x - ax + px, q.y - ay + py); c.lineTo(q.x + ax + px, q.y + ay + py); c.closePath();
      c.moveTo(q.x, q.y); c.lineTo(q.x - ax - px, q.y - ay - py); c.lineTo(q.x + ax - px, q.y + ay - py); c.closePath();
    }
    c.fillStyle = cols[ci]; c.fill();
  }
}

/* ---------- ícones de power-up ---------- */
export function drawPower(c, type, x, y, r, t) {
  const col = POW[type].col;
  c.save(); c.translate(x, y);
  c.globalAlpha = .28 + Math.sin(t * 5) * .1; c.fillStyle = col;
  c.beginPath(); c.arc(0, 0, r + 7 + Math.sin(t * 5) * 2, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
  const g = c.createRadialGradient(-r * .35, -r * .35, r * .1, 0, 0, r);
  g.addColorStop(0, '#334155'); g.addColorStop(1, '#0f172a');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = col; c.lineWidth = 2.5; c.stroke();
  const k = r / 18;
  c.scale(k, k); c.lineCap = 'round'; c.lineJoin = 'round';
  switch (type) {
    case 'vento':
      c.strokeStyle = '#e0f2fe'; c.lineWidth = 3; c.beginPath();
      c.moveTo(-10, -5); c.lineTo(4, -5); c.arc(4, -9, 4, Math.PI / 2, -Math.PI / 1.2, true);
      c.moveTo(-10, 1); c.lineTo(8, 1); c.arc(8, 5, 4, -Math.PI / 2, Math.PI / 1.2);
      c.moveTo(-7, 7); c.lineTo(0, 7); c.stroke(); break;
    case 'ouro': star(c, 0, 0, 11, 4.8); c.fillStyle = '#fde047'; c.fill(); c.strokeStyle = '#a16207'; c.lineWidth = 1.5; c.stroke(); break;
    case 'escudo':
      c.beginPath(); c.moveTo(0, -11); c.lineTo(9, -7); c.quadraticCurveTo(9, 6, 0, 11); c.quadraticCurveTo(-9, 6, -9, -7); c.closePath();
      c.fillStyle = '#a78bfa'; c.fill(); c.strokeStyle = '#ede9fe'; c.lineWidth = 2; c.beginPath(); c.moveTo(-4, 0); c.lineTo(-1, 3); c.lineTo(5, -4); c.stroke(); break;
    case 'vida':
      c.beginPath(); c.moveTo(0, 9); c.bezierCurveTo(-14, 0, -8, -12, 0, -5); c.bezierCurveTo(8, -12, 14, 0, 0, 9);
      c.fillStyle = '#f43f5e'; c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(-4, -4, 2, 0, Math.PI * 2); c.fill(); break;
    case 'ima':
      c.lineWidth = 6; c.strokeStyle = '#ef4444'; c.beginPath(); c.arc(0, -1, 7, Math.PI, 0, true); c.stroke();
      c.strokeStyle = '#e2e8f0'; c.beginPath(); c.moveTo(-7, -1); c.lineTo(-7, -7); c.moveTo(7, -1); c.lineTo(7, -7); c.stroke(); break;
  }
  c.restore();
}

/* ---------- moeda girando ---------- */
export function drawCoin(c, x, y, r, t) {
  const w = Math.max(.18, Math.abs(Math.cos(t * 4))) * r;
  const g = c.createLinearGradient(x - w, y - r, x + w, y + r);
  g.addColorStop(0, '#fff6c2'); g.addColorStop(.45, '#facc15'); g.addColorStop(1, '#b45309');
  c.fillStyle = g; c.beginPath(); c.ellipse(x, y, w, r, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(146,64,14,.8)'; c.lineWidth = 1.2; c.stroke();
  c.beginPath(); c.ellipse(x, y, w * .6, r * .6, 0, 0, Math.PI * 2); c.stroke();
}

export { drawFigure, drawPlatform } from './figure.js?v=d21';
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/* ---------- cenário ---------- */
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const FAVELA = ['#b45f3c', '#c97b4a', '#a0522d', '#d6a77a', '#8b5a3c', '#e2c290', '#7d8a96', '#c4b5a0', '#9c6644', '#d4a373', '#6d8b74', '#b08968', '#e07a5f', '#81b29a', '#f2cc8f'];
const PREDIOS = ['#f8fafc', '#e2e8f0', '#fde68a', '#fecaca', '#bae6fd', '#e9d5ff', '#fef3c7', '#d1fae5'];


function drawBrick(g, x, y, w, h, night, SC) {
  g.save(); g.beginPath(); g.rect(x + 1, y + 4, w - 2, h - 4); g.clip();
  g.fillStyle = night ? '#3b2218' : '#b5532f'; g.fillRect(x, y, w, h);
  const bw = 10 * Math.max(SC, .8), bh = 4.2 * Math.max(SC, .8);
  g.fillStyle = night ? 'rgba(0,0,0,.35)' : 'rgba(255,225,190,.45)';
  for (let yy = y + 4, row = 0; yy < y + h; yy += bh, row++) {
    g.fillRect(x, yy, w, .9);
    for (let xx = x - (row % 2) * bw / 2; xx < x + w; xx += bw) g.fillRect(xx, yy, .9, bh);
  }
  g.fillStyle = night ? 'rgba(0,0,0,.15)' : 'rgba(120,40,20,.18)';
  for (let i = 0; i < 6; i++) g.fillRect(x + ((i * 37) % Math.max(1, w - 10)), y + 6 + ((i * 23) % Math.max(1, h - 10)), 10, 4);
  g.restore();
}
function drawCristo(g, x, y, s, night) {
  if (night) { const gl = g.createRadialGradient(x, y - 20 * s, 2, x, y - 20 * s, 40 * s); gl.addColorStop(0, 'rgba(255,248,220,.5)'); gl.addColorStop(1, 'rgba(255,248,220,0)'); g.fillStyle = gl; g.fillRect(x - 40 * s, y - 60 * s, 80 * s, 70 * s); }
  g.fillStyle = night ? '#f1f5f9' : 'rgba(55,65,100,.9)';
  g.fillRect(x - 3 * s, y - 7 * s, 6 * s, 7 * s);
  g.beginPath(); g.moveTo(x - 2.4 * s, y - 7 * s); g.lineTo(x - 1.5 * s, y - 25 * s); g.lineTo(x + 1.5 * s, y - 25 * s); g.lineTo(x + 2.4 * s, y - 7 * s); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x - 12 * s, y - 24.5 * s); g.lineTo(x + 12 * s, y - 24.5 * s); g.lineTo(x + 12 * s, y - 22.6 * s); g.lineTo(x + 2 * s, y - 21.8 * s); g.lineTo(x - 2 * s, y - 21.8 * s); g.lineTo(x - 12 * s, y - 22.6 * s); g.closePath(); g.fill();
  g.beginPath(); g.arc(x, y - 27.3 * s, 1.9 * s, 0, Math.PI * 2); g.fill();
}
function drawWires(g, W, H, SC, city, r, night) {
  const poles = [];
  for (let px = W * (.1 + r() * .06); px < W - 10; px += W * (.24 + r() * .12)) if (Math.abs(px - W / 2) > W * .1) poles.push({ x: px, top: city.roofAt(px) - (46 + r() * 18) * SC });
  if (poles.length < 2) return;
  const wc = night ? 'rgba(148,163,184,.55)' : 'rgba(20,20,32,.72)';
  // postes
  for (const p of poles) {
    g.fillStyle = night ? '#334155' : '#6b7280'; g.fillRect(p.x - 2.2 * SC, p.top, 4.4 * SC, H - p.top);
    g.strokeStyle = 'rgba(27,20,51,.7)'; g.lineWidth = 1.2; g.strokeRect(p.x - 2.2 * SC, p.top, 4.4 * SC, H - p.top);
    g.fillStyle = night ? '#334155' : '#4b5563'; g.fillRect(p.x - 11 * SC, p.top + 4 * SC, 22 * SC, 2.6 * SC);
    if (r() < .6) { g.fillStyle = night ? '#475569' : '#9ca3af'; g.fillRect(p.x + 3 * SC, p.top + 12 * SC, 7 * SC, 10 * SC); g.strokeRect(p.x + 3 * SC, p.top + 12 * SC, 7 * SC, 10 * SC); }
  }
  // fios entre os postes (com barriga)
  g.strokeStyle = wc; g.lineWidth = 1;
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i], b = poles[i + 1];
    for (let j = 0; j < 5; j++) {
      const y1 = a.top + 4 * SC + (j % 3) * 3 * SC - 8 * SC * (j === 4), y2 = b.top + 4 * SC + (j % 3) * 3 * SC;
      g.beginPath(); g.moveTo(a.x + (j - 2) * 4 * SC, y1); g.quadraticCurveTo((a.x + b.x) / 2, Math.max(y1, y2) + (16 + j * 5) * SC, b.x + (j - 2) * 4 * SC, y2); g.stroke();
    }
    if (i === 0 && !night) { // tênis pendurado no fio
      const mx = (a.x + b.x) / 2 + 10 * SC, my = Math.max(a.top, b.top) + 22 * SC;
      g.beginPath(); g.moveTo(mx - 3 * SC, my); g.lineTo(mx - 4 * SC, my + 9 * SC); g.moveTo(mx + 3 * SC, my); g.lineTo(mx + 5 * SC, my + 8 * SC); g.stroke();
      g.fillStyle = '#f8fafc'; g.strokeStyle = 'rgba(27,20,51,.8)';
      for (const [dx, dy] of [[-4, 9], [5, 8]]) { g.beginPath(); g.ellipse(mx + dx * SC, my + dy * SC + 2 * SC, 3.4 * SC, 2 * SC, .3, 0, Math.PI * 2); g.fill(); g.stroke(); }
      g.strokeStyle = wc;
    }
  }
  // gatos: fios embolados e puxados pras casas
  for (const p of poles) {
    for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(p.x + (r() - .5) * 10 * SC, p.top + (8 + r() * 10) * SC, (4 + r() * 5) * SC, (2 + r() * 3) * SC, r() * 3, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 3; k++) {
      const tx = p.x + (r() < .5 ? -1 : 1) * (25 + r() * 45) * SC, ty = city.roofAt(tx) - 2;
      g.beginPath(); g.moveTo(p.x, p.top + 6 * SC); g.quadraticCurveTo((p.x + tx) / 2, Math.max(p.top, ty) + 8 * SC, tx, ty); g.stroke();
    }
  }
}

export function genCity(map, W, H, SC) {
  const r = rng(map.id.length * 131 + 7);
  const b = [];
  const tall = map.style === 'predios';
  const hmin = H * (tall ? .12 : .1), hmax = Math.min(H * (tall ? .24 : .22), tall ? 200 : 180);
  const pal = tall ? PREDIOS : FAVELA;
  const GRAF = ['PAZ', 'FUNK', '021', 'RJ', 'LAJE', 'AMOR', 'FÉ', 'PIPA', 'QUEBRADA', 'TMJ', 'MORRO', 'FAVELA', 'RELA', 'CORTA', 'BAILE', 'NÓIS'];
  const house = (x, w, lo, hi) => {
    const k = { x, w, h: lo + r() * (hi - lo), col: pal[Math.floor(r() * pal.length)], tank: r() < .45, ant: r() < .3, varal: r() < .3, win: Math.floor(r() * 1e6) };
    if (!tall) {
      k.brick = r() < .45; k.brickTop = r() < .6;
      if (r() < .38 && w > 52) { const ew = w * (.38 + r() * .2); k.ext = { dx: w * (.08 + r() * .3), w: ew, h: (16 + r() * 16) * Math.max(SC, .8), col: pal[Math.floor(r() * pal.length)], brick: r() < .5 }; }
      k.graf = r() < .35 ? GRAF[Math.floor(r() * GRAF.length)] : null;
      k.dish = r() < .28; k.stairs = r() < .28; k.plant = r() < .3; k.chair = r() < .22;
      k.flag = r() < .22 ? MANTOS[1 + Math.floor(r() * (MANTOS.length - 1))] : null; // bandeira de time na laje
    }
    return k;
  };
  if (map.style === 'campo') { // casinhas baixas + campo de terra/grama no meio
    const gH = Math.max(36, H * .07), fx0 = W * .27, fx1 = W * .73;
    let x = -20;
    while (x < fx0 - 20) { const w = Math.min((46 + r() * 60) * Math.max(SC, .75), fx0 - x); b.push(house(x, w, H * .085, H * .16)); x += w + r() * 4; }
    b.push({ x: fx0, w: fx1 - fx0, h: gH, field: true, me: true });
    x = fx1;
    while (x < W + 20) { const w = (46 + r() * 60) * Math.max(SC, .75); b.push(house(x, w, H * .085, H * .16)); x += w + r() * 4; }
  } else {
    let x = -20;
    while (x < W + 20) {
      const w = (tall ? 60 + r() * 60 : 46 + r() * 70) * Math.max(SC, .75);
      b.push(house(x, w, hmin, hmax));
      x += w + (tall ? 3 + r() * 10 : r() * 4);
    }
    const pb = b.find(k => k.x <= W / 2 && k.x + k.w >= W / 2);
    if (pb) { pb.h = (hmin + hmax) / 2; pb.col = tall ? '#fef9c3' : '#e8d5b0'; pb.tank = false; pb.ant = false; pb.varal = false; pb.me = true; pb.ext = null; pb.dish = pb.stairs = pb.plant = pb.chair = false; pb.flag = null; pb.brick = false; pb.graf = 'FUNK'; }
  }
  const max = Math.max(...b.map(k => k.h + (k.ext ? k.ext.h : 0)));
  return {
    b, max,
    roofAt(px) {
      for (const k of b) if (px >= k.x && px <= k.x + k.w) {
        if (k.ext && px >= k.x + k.ext.dx && px <= k.x + k.ext.dx + k.ext.w) return H - k.h - k.ext.h;
        return H - k.h;
      }
      return H - hmin * .6;
    },
  };
}

export function buildBackground(map, W, H, dpr, SC, city) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const night = !!map.night;

  const sky = g.createLinearGradient(0, 0, 0, H);
  map.sky.forEach((c, i) => sky.addColorStop([0, .45, .78, 1][i], c));
  g.fillStyle = sky; g.fillRect(0, 0, W, H);

  const r = rng(99);
  if (night) {
    for (let i = 0; i < 160; i++) {
      g.globalAlpha = .3 + r() * .7; g.fillStyle = '#fff';
      const s = r() < .1 ? 1.8 : 1;
      g.fillRect(r() * W, r() * H * .7, s, s);
    }
    g.globalAlpha = 1;
    const m = map.moon, mx = m.x * W, my = m.y * H, mr = m.r * SC;
    const gl = g.createRadialGradient(mx, my, mr * .5, mx, my, mr * 5);
    gl.addColorStop(0, 'rgba(220,230,255,.45)'); gl.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f1f5f9'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(148,163,184,.45)';
    [[-.3, -.2, .22], [.25, .15, .16], [-.05, .35, .12], [.35, -.3, .1]].forEach(([a, b, c]) => { g.beginPath(); g.arc(mx + a * mr, my + b * mr, c * mr, 0, Math.PI * 2); g.fill(); });
  } else if (map.sun) {
    const s = map.sun, sx = s.x * W, sy = s.y * H, sr = s.r * SC;
    const sun = g.createRadialGradient(sx, sy, sr * .4, sx, sy, sr * 4.5);
    sun.addColorStop(0, `rgba(${s.g},.9)`); sun.addColorStop(.3, `rgba(${s.g},.35)`); sun.addColorStop(1, `rgba(${s.g},0)`);
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    g.fillStyle = s.c; g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  }

  const base = H - city.max;
  // camada distante
  if (map.far === 'mar') {
    const hz = base - 26 * SC;
    // Pão de Açúcar
    g.fillStyle = 'rgba(40,90,110,.75)';
    g.beginPath(); g.moveTo(-10, hz);
    g.bezierCurveTo(W * .02, hz - 40 * SC, W * .06, hz - 130 * SC, W * .12, hz - 135 * SC);
    g.bezierCurveTo(W * .17, hz - 130 * SC, W * .18, hz - 50 * SC, W * .22, hz - 40 * SC);
    g.bezierCurveTo(W * .25, hz - 70 * SC, W * .28, hz - 75 * SC, W * .31, hz - 45 * SC);
    g.lineTo(W * .36, hz); g.fill();
    g.fillStyle = 'rgba(60,110,140,.5)';
    g.beginPath(); g.moveTo(W * .6, hz); g.quadraticCurveTo(W * .8, hz - 70 * SC, W + 10, hz - 30 * SC); g.lineTo(W + 10, hz); g.fill();
    const sea = g.createLinearGradient(0, hz, 0, H);
    sea.addColorStop(0, '#0e7490'); sea.addColorStop(1, '#155e75');
    g.fillStyle = sea; g.fillRect(0, hz, W, H - hz);
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 60; i++) g.fillRect(r() * W, hz + 3 + r() * (H - hz), 6 + r() * 14, 1.2);
    for (let i = 0; i < 3; i++) { // barquinhos
      const bx = W * (.4 + r() * .5), by = hz + 8 + r() * 10;
      g.fillStyle = '#f8fafc'; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 8, by - 12); g.lineTo(bx + 8, by); g.fill();
      g.fillStyle = '#1e293b'; g.fillRect(bx - 3, by, 14, 2.5);
    }
  } else if (map.far === 'morro') {
    for (const side of [0, 1]) {
      g.fillStyle = map.farCol;
      g.beginPath();
      const x0 = side ? W : 0, dir = side ? -1 : 1, peak = H * (side ? .42 : .5);
      g.moveTo(x0, H); g.lineTo(x0, peak);
      g.quadraticCurveTo(x0 + dir * W * .25, peak - 20, x0 + dir * W * .5, base - 20); g.lineTo(x0 + dir * W * .5, H); g.fill();
      for (let i = 0; i < 120; i++) { // casinhas com luz
        const t = r(), px = x0 + dir * t * W * .48;
        const top = peak + (base - 20 - peak) * t + (1 - t) * 20 * t;
        const py = top + 6 + r() * (H - top);
        g.fillStyle = r() < .35 ? 'rgba(255,200,120,.75)' : 'rgba(40,20,60,.5)';
        g.fillRect(px, py, 5 + r() * 5, 4 + r() * 4);
      }
    }
  } else {
    // Corcovado com o Cristo Redentor ao fundo
    const cx = W * .76, peakY = base - (95 * SC + H * .07);
    g.fillStyle = night ? 'rgba(20,28,60,.95)' : map.storm ? 'rgba(40,50,65,.8)' : 'rgba(110,135,180,.55)';
    g.beginPath(); g.moveTo(cx - 150 * SC, base); g.bezierCurveTo(cx - 70 * SC, base - 20 * SC, cx - 30 * SC, peakY + 25 * SC, cx - 6 * SC, peakY + 4 * SC);
    g.lineTo(cx + 6 * SC, peakY + 2 * SC); g.bezierCurveTo(cx + 20 * SC, peakY + 30 * SC, cx + 40 * SC, base - 30 * SC, cx + 110 * SC, base); g.fill();
    drawCristo(g, cx, peakY + 3 * SC, SC * .95, night);
    g.fillStyle = map.farCol;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, base - 40 * SC - Math.sin(x / 180) * 30 * SC - Math.sin(x / 67) * 10 * SC);
    g.lineTo(W, H); g.fill();
    // favela cobrindo o morro (cores com névoa)
    for (let x = -6; x < W; x += 9 + r() * 7) {
      const top = base - 36 * SC - Math.sin(x / 180) * 30 * SC - Math.sin(x / 67) * 10 * SC;
      for (let row = 0; row < 4; row++) {
        const hy = top + row * 11 * SC + r() * 5, hw = (8 + r() * 8) * Math.max(SC, .8), hh = (7 + r() * 7) * Math.max(SC, .8);
        g.globalAlpha = night ? .9 : .5;
        g.fillStyle = night ? '#0f1733' : FAVELA[Math.floor(r() * FAVELA.length)];
        g.fillRect(x, hy - hh, hw, hh + 12);
        if (night ? r() < .45 : r() < .5) { g.fillStyle = night ? 'rgba(253,224,71,.85)' : 'rgba(30,41,59,.6)'; g.fillRect(x + hw * .3, hy - hh * .6, 2, 2); }
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = night ? 'rgba(10,15,40,.25)' : 'rgba(170,195,230,.28)'; g.fillRect(0, base - 90 * SC, W, H); // névoa de distância
  }

  // nuvens pesadas da tempestade
  if (map.storm) {
    for (let i = 0; i < 26; i++) {
      const cx = r() * W, cy = r() * H * .22, cr = (40 + r() * 70) * SC;
      g.fillStyle = `rgba(${20 + r() * 25},${28 + r() * 25},${40 + r() * 25},${.55 + r() * .3})`;
      g.beginPath(); g.ellipse(cx, cy, cr * 1.6, cr * .7, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // cidade
  const tall = map.style === 'predios';
  const dark = night ? .34 : map.storm ? .6 : 1;
  const field = city.b.find(k => k.field);
  if (field) { // árvores atrás do campo
    const gy = H - field.h;
    for (let i = 0; i < 5; i++) {
      const tx = field.x + field.w * (.08 + i * .21) + (r() - .5) * 20, th = (26 + r() * 16) * SC;
      g.fillStyle = '#5b3a1e'; g.fillRect(tx - 2.5 * SC, gy - th, 5 * SC, th);
      g.fillStyle = ['#166534', '#15803d', '#1f7a3a'][i % 3];
      for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(tx + (j - 1.5) * 7 * SC, gy - th - (j % 2) * 7 * SC, 12 * SC, 0, Math.PI * 2); g.fill(); }
    }
  }
  for (const k of city.b) {
    const y = H - k.h;
    if (k.field) {
      for (let i = 0, sx = k.x; sx < k.x + k.w; i++, sx += 22 * SC) { g.fillStyle = i % 2 ? '#3f9a3a' : '#4aab44'; g.fillRect(sx, y, 22 * SC, k.h); }
      g.fillStyle = 'rgba(160,110,60,.55)'; g.beginPath(); g.ellipse(k.x + k.w / 2, y + k.h * .55, k.w * .18, k.h * .3, 0, 0, Math.PI * 2); g.fill(); // terrão
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(k.x + 4, y + 3); g.lineTo(k.x + k.w - 4, y + 3); g.moveTo(k.x + k.w / 2, y + 3); g.lineTo(k.x + k.w / 2, H); g.stroke();
      const gx = k.x + 10 * SC, gw = 34 * SC, gh = 22 * SC; // trave
      g.strokeStyle = '#f8fafc'; g.lineWidth = 3 * SC; g.beginPath(); g.moveTo(gx, y + 2); g.lineTo(gx, y - gh); g.lineTo(gx + gw, y - gh); g.lineTo(gx + gw, y + 2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
      for (let nx = gx + 5; nx < gx + gw; nx += 5) { g.beginPath(); g.moveTo(nx, y - gh); g.lineTo(nx - 4, y); g.stroke(); }
      g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(k.x + k.w * .72, y + 1, 3.2 * SC, 0, Math.PI * 2); g.fill(); // bola
      continue;
    }
    g.fillStyle = shade(k.col, dark); g.fillRect(k.x, y, k.w, k.h);
    if (k.brick) drawBrick(g, k.x, k.brickTop ? y : y, k.w, k.brickTop ? k.h * .42 : k.h, night, SC);
    g.strokeStyle = 'rgba(27,20,51,.6)'; g.lineWidth = 1.8; g.strokeRect(k.x + .9, y + .9, k.w - 1.8, k.h + 6);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(k.x + k.w - 6, y, 6, k.h);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(k.x - 2, y, k.w + 4, 4);
    const wr = rng(k.win);
    if (tall) {
      for (let wy = y + 12; wy < H - 20; wy += 18) {
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(k.x + 3, wy + 11, k.w - 9, 3); // varandas
        for (let wx = k.x + 7; wx < k.x + k.w - 14; wx += 15) {
          const lit = night ? wr() < .55 : wr() < .08;
          g.fillStyle = lit ? '#fde68a' : (night ? 'rgba(15,23,42,.9)' : 'rgba(56,189,248,.45)');
          g.fillRect(wx, wy, 9, 10);
        }
      }
    } else {
      for (let wy = y + 16; wy < H - 16; wy += 26) for (let wx = k.x + 8; wx < k.x + k.w - 16; wx += 22) {
        if (wr() < .6) {
          const lit = night ? wr() < .5 : wr() < .15;
          if (lit && night) { g.fillStyle = 'rgba(253,224,71,.18)'; g.fillRect(wx - 4, wy - 4, 18, 20); }
          g.fillStyle = lit ? '#fde68a' : 'rgba(30,41,59,.72)'; g.fillRect(wx, wy, 10, 12); g.strokeStyle = 'rgba(27,20,51,.55)'; g.lineWidth = 1; g.strokeRect(wx, wy, 10, 12);
        }
      }
      for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(60,60,60,.7)'; g.lineWidth = 1; const vx = k.x + 4 + wr() * (k.w - 8); g.beginPath(); g.moveTo(vx, y); g.lineTo(vx, y - 5 - wr() * 5); g.stroke(); } // vergalhões
    }
    if (k.tank) {
      const tx = k.x + k.w * .2, tw = 22 * SC, th = 15 * SC;
      g.fillStyle = night ? '#1e3a8a' : '#1d4ed8'; g.fillRect(tx, y - th, tw, th);
      g.fillStyle = night ? '#1e40af' : '#3b82f6'; g.beginPath(); g.ellipse(tx + tw / 2, y - th, tw / 2, 4 * SC, 0, 0, Math.PI * 2); g.fill();
    }
    if (k.ant) {
      const ax = k.x + k.w * .75;
      g.strokeStyle = '#334155'; g.lineWidth = 1.5; g.beginPath();
      g.moveTo(ax, y); g.lineTo(ax, y - 26 * SC); g.moveTo(ax - 8 * SC, y - 20 * SC); g.lineTo(ax + 8 * SC, y - 20 * SC); g.stroke();
      if (night) { g.fillStyle = '#ef4444'; g.beginPath(); g.arc(ax, y - 27 * SC, 2, 0, Math.PI * 2); g.fill(); }
    }
    if (k.ext) { // puxadinho em cima da laje
      const ex = k.x + k.ext.dx, ey = y - k.ext.h;
      g.fillStyle = shade(k.ext.col, dark); g.fillRect(ex, ey, k.ext.w, k.ext.h);
      if (k.ext.brick) drawBrick(g, ex, ey, k.ext.w, k.ext.h, night, SC);
      g.strokeStyle = 'rgba(27,20,51,.6)'; g.lineWidth = 1.8; g.strokeRect(ex + .9, ey + .9, k.ext.w - 1.8, k.ext.h);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(ex - 2, ey, k.ext.w + 4, 3);
      g.fillStyle = night ? '#fde68a' : 'rgba(30,41,59,.75)'; g.fillRect(ex + k.ext.w * .35, ey + k.ext.h * .35, 8, 8);
      for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(60,60,60,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(ex + 3 + i * k.ext.w / 3, ey); g.lineTo(ex + 3 + i * k.ext.w / 3, ey - 5); g.stroke(); }
    }
    if (k.graf && !tall) { // grafite na parede
      const gx = k.x + k.w * .5, gy = H - Math.min(k.h * .32, 60 * SC);
      const cols = ['#f472b6', '#22d3ee', '#facc15', '#4ade80', '#fb923c', '#a78bfa'];
      const c1 = cols[Math.floor(r() * cols.length)], c2 = cols[Math.floor(r() * cols.length)];
      g.save(); g.translate(gx, gy); g.rotate(-.08 + r() * .06);
      g.globalAlpha = night ? .35 : .5; g.fillStyle = c2; g.beginPath(); g.ellipse(0, 0, Math.min(k.w * .42, 34 * SC), 10 * SC, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.font = `${Math.round(Math.min(15 * SC, k.w / (k.graf.length * .65)))}px 'Lilita One', Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(15,10,30,.85)'; g.strokeText(k.graf, 0, 0); g.fillStyle = night ? shade(c1, .6) : c1; g.fillText(k.graf, 0, 0);
      g.restore();
    }
    if (k.dish && !tall) { // parabólica
      const dx = k.x + k.w * .82, dy = y;
      g.strokeStyle = '#475569'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx, dy - 9 * SC); g.stroke();
      g.save(); g.translate(dx, dy - 11 * SC); g.rotate(-.6); g.beginPath(); g.ellipse(0, 0, 7 * SC, 3 * SC, 0, 0, Math.PI); g.fillStyle = night ? '#64748b' : '#e2e8f0'; g.fill(); g.strokeStyle = 'rgba(27,20,51,.7)'; g.lineWidth = 1.2; g.stroke(); g.restore();
    }
    if (k.stairs && !tall && k.h > 60) { // escadinha na lateral
      g.strokeStyle = night ? 'rgba(148,163,184,.5)' : 'rgba(80,60,50,.75)'; g.lineWidth = 1.6; g.beginPath();
      const sx = k.x + 4, n = Math.floor(k.h / 9);
      g.moveTo(sx, H); for (let i = 0; i < n; i++) { const yy = H - i * 9; g.lineTo(sx + 4 + (i % 2) * 0, yy - 4.5); g.lineTo(sx + 4, yy - 9); }
      g.moveTo(sx + 9, H); g.lineTo(sx + 9, y); g.stroke();
    }
    if (k.plant && !tall) { const px = k.x + k.w * .12; g.fillStyle = '#9a3412'; g.fillRect(px, y - 6 * SC, 7 * SC, 6 * SC); g.fillStyle = night ? '#14532d' : '#16a34a'; for (const [dx, dy] of [[1, -8], [5, -9], [3.5, -12]]) { g.beginPath(); g.arc(px + dx * SC, y + dy * SC, 3.3 * SC, 0, Math.PI * 2); g.fill(); } }
    if (k.chair && !tall) { const cx2 = k.x + k.w * .58, cc = night ? '#7f1d1d' : '#dc2626'; g.fillStyle = cc; g.fillRect(cx2, y - 6 * SC, 7 * SC, 1.6 * SC); g.fillRect(cx2 + 5.4 * SC, y - 12 * SC, 1.6 * SC, 12 * SC); g.fillRect(cx2, y - 6 * SC, 1.4 * SC, 6 * SC); }
    if (k.flag && !tall) { // bandeira de time num mastro de cano
      const fx = k.x + k.w * .3, fh = 26 * SC, fw = 14 * SC, fy = y - fh, d = night ? .45 : 1;
      g.strokeStyle = night ? '#64748b' : '#94a3b8'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(fx, y); g.lineTo(fx, fy); g.stroke();
      g.fillStyle = shade(k.flag.c1, d); g.fillRect(fx + .7, fy, fw, fw * .62);
      g.fillStyle = shade(k.flag.c2, d);
      if (k.flag.pat === 'hoops' || k.flag.pat === 'band') for (let i = 1; i < 4; i += 2) g.fillRect(fx + .7, fy + i * fw * .62 / 4, fw, fw * .62 / 4);
      else if (k.flag.pat === 'stripes' || k.flag.pat === 'tri') for (let i = 1; i < 5; i += 2) g.fillRect(fx + .7 + i * fw / 5, fy, fw / 5, fw * .62);
      if (k.flag.escudo) { g.save(); if (night) g.globalAlpha = .6; drawEscudo(g, k.flag.escudo, fx + .7 + fw / 2, fy + fw * .31, fw * .24); g.restore(); }
      g.strokeStyle = 'rgba(27,20,51,.7)'; g.lineWidth = 1; g.strokeRect(fx + .7, fy, fw, fw * .62);
    }
    if (k.varal && !tall) { // varal com roupa
      const x1 = k.x + 6, x2 = k.x + k.w - 10, vy = y - 16 * SC;
      g.strokeStyle = 'rgba(40,40,40,.8)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x1, y); g.lineTo(x1, vy); g.moveTo(x2, y); g.lineTo(x2, vy); g.moveTo(x1, vy); g.quadraticCurveTo((x1 + x2) / 2, vy + 5, x2, vy); g.stroke();
      // camisas de time penduradas (manga curta, com o padrão do manto)
      for (let cx = x1 + 5; cx < x2 - 8; cx += 11 + wr() * 5) {
        const m = MANTOS[1 + Math.floor(wr() * (MANTOS.length - 1))], d = night ? .4 : 1;
        const bw = 6, bh = 8, top = vy + 2;
        g.fillStyle = shade(m.c1, d);
        g.fillRect(cx, top, bw, bh); g.fillRect(cx - 2.2, top, 2.2, 3); g.fillRect(cx + bw, top, 2.2, 3);
        g.fillStyle = shade(m.c2, d);
        if (m.pat === 'hoops') for (let yy = top + 1.5; yy < top + bh; yy += 2.6) g.fillRect(cx, yy, bw, 1.3);
        else if (m.pat === 'stripes' || m.pat === 'tri') for (let xx = cx + .8; xx < cx + bw; xx += 2.2) g.fillRect(xx, top, 1.1, bh);
        else if (m.pat === 'sash') { g.beginPath(); g.moveTo(cx + bw, top); g.lineTo(cx + bw, top + 2); g.lineTo(cx + 2, top + bh); g.lineTo(cx, top + bh); g.lineTo(cx, top + bh - 2); g.closePath(); g.fill(); }
        else if (m.pat === 'band') g.fillRect(cx, top + 3, bw, 1.6);
        else g.fillRect(cx + 2, top, 2, 1.2);
      }
    }
  }
  if (!tall) drawWires(g, W, H, SC, city, r, night);
  if (tall) { // calçadão ondulado + coqueiros
    const ch = 12 * SC, cy = H - ch;
    g.fillStyle = night ? '#3f3f46' : '#f5f5f4'; g.fillRect(0, cy, W, ch);
    g.strokeStyle = night ? '#18181b' : '#1c1917'; g.lineWidth = 2.2 * SC; g.beginPath();
    for (let x = 0; x <= W; x += 4) g.lineTo(x, cy + ch / 2 + Math.sin(x / (8 * SC)) * ch * .3);
    g.stroke();
    for (let i = 0; i < Math.ceil(W / 170); i++) {
      const px = 40 + i * 170 + r() * 50;
      if (Math.abs(px - W / 2) < 60) continue;
      const ph = 70 * SC + r() * 30 * SC;
      g.strokeStyle = night ? '#292524' : '#78350f'; g.lineWidth = 4 * SC; g.beginPath();
      g.moveTo(px, cy); g.quadraticCurveTo(px + 8 * SC, cy - ph / 2, px + 4 * SC, cy - ph); g.stroke();
      g.fillStyle = night ? '#14532d' : '#15803d';
      for (let a = 0; a < 6; a++) {
        const ang = -Math.PI / 2 + (a - 2.5) * .55;
        g.beginPath(); g.moveTo(px + 4 * SC, cy - ph);
        g.quadraticCurveTo(px + 4 * SC + Math.cos(ang) * 22 * SC, cy - ph + Math.sin(ang) * 22 * SC - 6, px + 4 * SC + Math.cos(ang) * 30 * SC, cy - ph + Math.sin(ang) * 18 * SC + 10);
        g.quadraticCurveTo(px + 4 * SC + Math.cos(ang) * 16 * SC, cy - ph + Math.sin(ang) * 12 * SC, px + 4 * SC, cy - ph); g.fill();
      }
    }
  }
  return cv;
}
