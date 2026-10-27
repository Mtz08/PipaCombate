/* Pipa Combate — bonequinhos chibi estilo funkeiro.
   Vista de lado (no jogo, olhando a pipa) e de frente (lobby, editor e avatar). */

/* ---------- bonequinhos chibi (cabeçudos, contorno cartoon) ----------
   drawFigure(c, x, feet, hx, hy, kid, s, o)
   x/hx,hy = mão que segura a linha (âncora); o corpo fica atrás dela.
   o = { dir, pose:'pipa'|'lanca'|'festa'|'triste', t, td (tempo da pose), pull (0..1), foco,
         look:[x,y] (pra onde olha, -1..1), reel (giro do carretel), act (ação à toa) + at (tempo dela), me } */
import { mantoById } from './data.js?v=d21';
import { drawEscudo, drawFornecedor } from './marcas.js?v=d21';

const OUT = '#1b1433';

/* Manto de time: camisa/regata ganha as cores do time (mangas e boné acompanham). */
function withKit(f) {
  if (f.top !== 'time' && f.top !== 'regata') return f;
  const k = mantoById(f.manto);
  return k.pat ? Object.assign({}, f, { cor1: k.c1, cor2: k.c2, kit: k }) : f;
}
/* padrão do manto, desenhado dentro do recorte do tronco */
function drawKit(c, k, X, y, W, h) {
  const H = h + 2;
  if (k.pat === 'hoops') { c.fillStyle = k.c2; for (let yy = y + 2; yy < y + H; yy += 4.4) c.fillRect(X, yy, W, 2.2); }
  else if (k.pat === 'stripes') { c.fillStyle = k.c2; for (let xx = X + 1.2; xx < X + W; xx += 3.6) c.fillRect(xx, y, 1.8, H); }
  else if (k.pat === 'tri') { const cs = [k.c2, k.c3]; for (let i = 0, xx = X + 1.4; xx < X + W; xx += 2.8, i++) { c.fillStyle = cs[i % 2]; c.fillRect(xx, y, 1.4, H); } }
  else if (k.pat === 'band') { const m = y + h * .3; c.fillStyle = k.c2; c.fillRect(X, m, W, 1.6); c.fillStyle = k.c3; c.fillRect(X, m + 1.6, W, 1.6); c.fillStyle = k.c2; c.fillRect(X, m + 3.2, W, 1.6); }
  else if (k.pat === 'sash') { c.fillStyle = k.c2; c.beginPath(); c.moveTo(X + W, y); c.lineTo(X + W, y + 3.6); c.lineTo(X + 3.6, y + H); c.lineTo(X, y + H); c.lineTo(X, y + H - 3.6); c.closePath(); c.fill(); }
}
const lerp = (a, b, k) => a + (b - a) * k;
const LINE = 'rgba(40,24,48,.9)';
function rgbOf(col) {
  if (typeof col !== 'string') return null;
  if (col[0] === '#' && col.length === 7) { const n = parseInt(col.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = col.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null;
}
function edge(col) { const v = rgbOf(col); return v ? `rgb(${v.map(x => Math.round(x * .42)).join(',')})` : LINE; }
function mix(a, b, k) { const x = rgbOf(a), y = rgbOf(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`; }
function ol(c, w = 1.5) { c.strokeStyle = LINE; c.lineWidth = w * .85; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function fillO(c, col, w) { c.fillStyle = col; c.fill(); c.strokeStyle = edge(col); c.lineWidth = (w || 1.5) * .85; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function lin(c, col, x0, y0, x1, y1, k1 = 1.16, k2 = .8) { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, shade(col, k1)); g.addColorStop(1, shade(col, k2)); return g; }
function fillG(c, col, x0, y0, x1, y1, w, k1, k2) { c.fillStyle = lin(c, col, x0, y0, x1, y1, k1, k2); c.fill(); c.strokeStyle = edge(col); c.lineWidth = (w || 1.5) * .85; c.lineJoin = 'round'; c.stroke(); }
/* cabeça com volume (luz vindo do alto à esquerda) */
function skinHead(c, f, hx, hy, R) {
  c.beginPath(); c.arc(hx, hy, R, 0, Math.PI * 2);
  const g = c.createRadialGradient(hx - R * .35, hy - R * .42, R * .1, hx, hy, R * 1.22);
  g.addColorStop(0, shade(f.pele, 1.14)); g.addColorStop(.62, f.pele); g.addColorStop(1, shade(f.pele, .8));
  c.fillStyle = g; c.fill(); c.strokeStyle = edge(f.pele); c.lineWidth = 1.4; c.stroke();
}
function metal(c, x, y, r, gold) {
  const g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r * 1.1);
  g.addColorStop(0, gold ? '#fffbe0' : '#ffffff'); g.addColorStop(.45, gold ? '#fbbf24' : '#e2e8f0'); g.addColorStop(1, gold ? '#b45309' : '#64748b');
  return g;
}
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
/* membro com contorno; devolve o ponto de controle (pra manga) */
function limb(c, x1, y1, x2, y2, bend, w, col) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  const cx = mx - dy / L * bend, cy = my + dx / L * bend;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2);
  c.strokeStyle = OUT; c.lineWidth = w + 2.6; c.stroke();
  c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2);
  c.strokeStyle = col; c.lineWidth = w; c.stroke();
  return [cx, cy];
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
export const OLHO = { castanho: '#6b4423', preto: '#1f2937', mel: '#b7791f', verde: '#15803d', azul: '#2563eb' };
/* cinemática inversa de 2 ossos: devolve [cotoveloX, cotoveloY, mãoX, mãoY]; pick escolhe o lado da dobra */
function ik(sx, sy, tx, ty, l1, l2, pick) {
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
  const mx = l1 + l2 - .05;
  if (d > mx) { tx = sx + dx / d * mx; ty = sy + dy / d * mx; d = mx; }
  d = Math.max(d, .5);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), base = Math.atan2(ty - sy, tx - sx);
  const e1 = [sx + Math.cos(base + a) * l1, sy + Math.sin(base + a) * l1], e2 = [sx + Math.cos(base - a) * l1, sy + Math.sin(base - a) * l1];
  const e = pick(e1) >= pick(e2) ? e1 : e2;
  return [e[0], e[1], tx, ty];
}
/* braço com cotovelo, manga e punho da blusa */
function arm(c, sx, sy, tx, ty, pick, col, sleeveCol, cuffCol, L = 8.8) {
  const [ex, ey, hx, hy] = ik(sx, sy, tx, ty, L, L, pick);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy);
  c.strokeStyle = edge(col); c.lineWidth = 5.6; c.stroke(); c.strokeStyle = col; c.lineWidth = 3.8; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx - .8, sy); c.lineTo(ex - .8, ey); c.lineTo(hx - .8, hy); c.stroke();
  if (sleeveCol) {
    const px = lerp(sx, ex, .5), py = lerp(sy, ey, .5);
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(px, py); c.strokeStyle = edge(sleeveCol); c.lineWidth = 6.6; c.stroke(); c.strokeStyle = sleeveCol; c.lineWidth = 5; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px - (py - sy) * .12, py); c.lineTo(px + (py - sy) * .12, py); c.stroke();
  }
  if (cuffCol) { const px = lerp(ex, hx, .74), py = lerp(ey, hy, .74); c.beginPath(); c.arc(px, py, 2.5, 0, Math.PI * 2); fillO(c, cuffCol, 1); }
  return { ex, ey, hx, hy };
}
function sleeve(c, x1, y1, cx, cy, len, w, col) {
  const dx = cx - x1, dy = cy - y1, L = Math.hypot(dx, dy) || 1;
  const ex = x1 + dx / L * len, ey = y1 + dy / L * len;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(ex, ey); c.strokeStyle = OUT; c.lineWidth = w + 2.6; c.stroke();
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(ex, ey); c.strokeStyle = col; c.lineWidth = w; c.stroke();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
/* mão fechada (punho com dedão) */
/* mão: 'punho' | 'aberta' | 'joinha' | 'aponta'; ang = direção do antebraço */
function handF(c, x, y, ang, pele, tipo = 'punho', mirror = false) {
  c.save(); c.translate(x, y);
  if (tipo === 'joinha') ang = mirror ? Math.PI : 0;
  c.rotate(ang); if (mirror) c.scale(1, -1);
  const e = edge(pele);
  const blob = (px, py, rx, ry, a = 0) => { c.beginPath(); c.ellipse(px, py, rx, ry, a, 0, Math.PI * 2); c.fillStyle = pele; c.fill(); c.strokeStyle = e; c.lineWidth = .75; c.stroke(); };
  if (tipo === 'aberta') {
    for (let i = 0; i < 4; i++) { const a = -.62 + i * .38; blob(Math.cos(a) * 4.3, Math.sin(a) * 4.3, 2, 1, a); }
    blob(-.4, 3.1, 1.8, .95, 1.9);
    blob(.2, 0, 3, 2.7);
    c.strokeStyle = shade(pele, .72); c.lineWidth = .4; c.beginPath(); c.arc(.2, .2, 1.6, -.8, .8); c.stroke();
  } else {
    if (tipo === 'aponta') blob(4.9, -.4, 2.3, .9);
    blob(0, 0, 3.3, 2.9);
    c.strokeStyle = shade(pele, .66); c.lineWidth = .45; c.beginPath(); for (let i = -1; i <= 1; i++) { c.moveTo(1.9, i * 1.15 - .2); c.lineTo(3.1, i * 1.15); } c.stroke();
    if (tipo === 'joinha') { blob(-.6, -3.6, 1.05, 2.1); c.strokeStyle = shade(pele, .7); c.lineWidth = .35; c.beginPath(); c.moveTo(-1.2, -4.9); c.lineTo(-.1, -4.9); c.stroke(); }
    else blob(.3, -2.2, 1.6, .9, -.35);
    c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(-.8, -.9, 1.3, .7, -.4, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}
function fist(c, x, y, pele) {
  c.beginPath(); c.arc(x, y, 2.9, 0, Math.PI * 2); fillO(c, pele, 1.3);
  c.beginPath(); c.arc(x + 1.6, y - 1.6, 1.2, 0, Math.PI * 2); fillO(c, pele, 1);
}

function drawReel(c, x, y, tipo, cor, spin) {
  c.save(); c.translate(x, y);
  const off = ((spin || 0) % 1.7 + 1.7) % 1.7;
  if (tipo === 'madeira') {
    rr(c, -2.2, -5, 4.4, 10, 1); fillO(c, '#e7c9a0', 1.2);
    c.save(); rr(c, -2.2, -5, 4.4, 10, 1); c.clip();
    c.strokeStyle = '#fff'; c.lineWidth = .8; for (let i = -6 + off; i <= 5; i += 1.7) { c.beginPath(); c.moveTo(-2.2, i); c.lineTo(2.2, i + .6); c.stroke(); }
    c.restore();
    for (const yy of [-5.5, 5.5]) { c.beginPath(); c.ellipse(0, yy, 5.2, 1.8, 0, 0, Math.PI * 2); fillO(c, '#8b5a2b', 1.2); }
  } else {
    const body = tipo === 'ouro' ? '#fbbf24' : tipo === 'neon' ? cor : '#cbd5e1';
    if (tipo === 'neon') { c.globalAlpha = .22; c.beginPath(); c.arc(0, 0, 6.5, 0, Math.PI * 2); c.fillStyle = cor; c.fill(); c.globalAlpha = 1; }
    rr(c, -4.2, -5.5, 8.4, 11, 2); fillO(c, body, 1.3);
    c.save(); rr(c, -4.2, -5.5, 8.4, 11, 2); c.clip();
    c.strokeStyle = '#fff'; c.lineWidth = .9;
    for (let i = -6 + off; i <= 6; i += 1.7) { c.beginPath(); c.moveTo(-4.2, i); c.lineTo(4.2, i + .7); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(-3.2, -5, 1.4, 10);
    c.restore();
    rr(c, -4.2, -5.5, 8.4, 11, 2); ol(c, 1.3);
  }
  c.restore();
}

function hairShine(c, hx, hy, R) {
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.6; c.lineCap = 'round';
  c.beginPath(); c.arc(hx - 1, hy - 1, R - 2.5, Math.PI * 1.22, Math.PI * 1.45); c.stroke();
}
function drawHairBack(c, f, hx, hy, R, t) {
  const col = f.corCabelo;
  if (f.cabelo === 'black') { c.beginPath(); c.arc(hx - 1.5, hy - 3, R + 5.5, 0, Math.PI * 2); fillO(c, col, 1.6); }
  if (f.cabelo === 'trancas') {
    for (const [w, cl] of [[3.8, OUT], [2.2, col]]) {
      c.strokeStyle = cl; c.lineWidth = w; c.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const bx = hx - 9 + i * 2.5, sw = Math.sin(t * 3 + i) * 1.4; c.beginPath(); c.moveTo(bx, hy - 4); c.quadraticCurveTo(bx - 4 + sw, hy + 5, bx - 3 - i + sw * 1.5, hy + 12); c.stroke(); }
    }
    for (let i = 0; i < 4; i++) { const bx = hx - 9 + i * 2.5, sw = Math.sin(t * 3 + i) * 1.4; c.beginPath(); c.arc(bx - 3 - i + sw * 1.5, hy + 12, 1.3, 0, Math.PI * 2); c.fillStyle = '#facc15'; c.fill(); }
  }
  if (f.cabelo === 'liso') { rr(c, hx - R + 1, hy - 4, R - 3, R + 3 + Math.sin(t * 2) * .5, 4); fillO(c, col, 1.5); }
  if (f.top === 'moletom') { c.beginPath(); c.ellipse(hx - 6, hy + 8, 7, 5, -.4, 0, Math.PI * 2); fillO(c, shade(f.cor1, .8), 1.4); }
}
function drawHairFront(c, f, hx, hy, R, t) {
  const col = f.corCabelo, capCol = f.cor2 === '#f8fafc' && f.cor1 !== '#f8fafc' ? f.cor1 : f.cor2;
  switch (f.cabelo) {
    case 'bone':
    case 'bonetras': {
      c.beginPath(); c.arc(hx, hy - 2, R + .6, Math.PI * 1.02, -.02); c.closePath(); fillO(c, capCol, 1.6);
      const back = f.cabelo === 'bonetras';
      rr(c, back ? hx - R - 8 : hx + 3, hy - 4.2, 13, 3.4, 1.7); fillO(c, shade(capCol, .72), 1.4);
      if (!back) { c.fillStyle = '#fcd34d'; c.fillRect(hx + 10, hy - 3.9, 3.2, 2.6); c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(hx + 10.4, hy - 3.6, .8, 2); } // adesivo dourado na aba
      c.beginPath(); c.arc(hx, hy - R - 1.6, 1.4, 0, Math.PI * 2); fillO(c, shade(capCol, .72), 1);
      // logo do boné
      c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 1 : 2.3, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(hx + 4 + Math.cos(a) * r, hy - 8 + Math.sin(a) * r); }
      c.closePath(); c.fillStyle = capCol === f.cor1 ? '#fde047' : f.cor1; c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(hx - 4, hy - 9, 3, 1.5, -.35, 0, Math.PI * 2); c.fill();
      if (back) { c.beginPath(); c.arc(hx + 8, hy - 3, 2.6, 0, Math.PI * 2); fillO(c, col, 1.2); }
      break;
    }
    case 'curto':
      c.beginPath(); c.arc(hx, hy - 1, R + .4, Math.PI * 1.08, -.18); c.quadraticCurveTo(hx + 4, hy - 7, hx - 2, hy - 5); c.lineTo(hx - R + 1, hy); c.closePath(); fillO(c, col, 1.5);
      hairShine(c, hx, hy, R);
      break;
    case 'nevou': // luzes platinadas, cachinho curto
      c.beginPath(); c.arc(hx, hy - 1, R + .3, Math.PI * 1.08, -.1); c.closePath(); fillO(c, shade(col, .8), 1.4);
      for (let i = 0; i < 11; i++) { const a = Math.PI * 1.1 + i / 10 * Math.PI * .82, rr2 = R - 1.5 + (i % 2) * 1.2; c.beginPath(); c.arc(hx + Math.cos(a) * rr2, hy - 1 + Math.sin(a) * rr2, 2.3, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }
      c.fillStyle = 'rgba(80,50,20,.45)'; for (const [dx, dy] of [[-7, -3], [-4, -9], [2, -11], [7, -8]]) { c.beginPath(); c.arc(hx + dx, hy + dy, .7, 0, Math.PI * 2); c.fill(); }
      hairShine(c, hx, hy - 1, R);
      break;
    case 'disfarcado': // degradê baixo com risco na lateral
      c.beginPath(); c.arc(hx, hy - 1.5, R + .2, Math.PI * 1.12, -.2); c.quadraticCurveTo(hx + 3, hy - 8, hx - 3, hy - 7); c.closePath(); fillO(c, col, 1.4);
      c.globalAlpha = .35; c.beginPath(); c.arc(hx, hy, R, Math.PI * .98, Math.PI * 1.2); c.lineTo(hx - 3, hy - 2); c.closePath(); c.fillStyle = col; c.fill(); c.globalAlpha = 1;
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = .8; c.beginPath(); c.moveTo(hx - 9, hy - 4); c.lineTo(hx - 4, hy - 6.5); c.moveTo(hx - 9.5, hy - 2); c.lineTo(hx - 4.5, hy - 4.5); c.stroke();
      hairShine(c, hx, hy - 1, R);
      break;
    case 'cacheado':
      for (let i = 0; i < 8; i++) { const a = Math.PI * 1.05 + i / 7 * Math.PI * .95, b = Math.sin(t * 4 + i) * .3; c.beginPath(); c.arc(hx + Math.cos(a) * (R - 1), hy - 1 + Math.sin(a) * (R - 1) + b, 4, 0, Math.PI * 2); fillO(c, col, 1.3); }
      break;
    case 'black':
      c.beginPath(); c.arc(hx - 1.5, hy - 3, R + 5.5, Math.PI * .95, Math.PI * 2.02); c.quadraticCurveTo(hx + 4, hy - 6, hx - 4, hy - 4); c.closePath(); c.fillStyle = col; c.fill();
      hairShine(c, hx - 1, hy - 4, R + 5);
      break;
    case 'moicano':
      c.beginPath(); c.arc(hx, hy, R + .2, Math.PI * 1.1, -.1); c.closePath(); c.fillStyle = shade(col, 1.2); c.globalAlpha = .45; c.fill(); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(hx - 8, hy - 8);
      for (let i = 0; i < 5; i++) { const px = hx - 7 + i * 3.8, w = Math.sin(t * 5 + i) * .6; c.lineTo(px + 1 + w, hy - R - 7 + (i % 2) * 2); c.lineTo(px + 3, hy - R + 1); }
      c.lineTo(hx + 10, hy - 7); c.closePath(); fillO(c, col, 1.3);
      break;
    case 'trancas':
      c.beginPath(); c.arc(hx, hy - 1, R + .4, Math.PI * 1.05, -.1); c.closePath(); fillO(c, col, 1.5);
      c.strokeStyle = shade(col, 1.6); c.lineWidth = .8; for (let i = -6; i <= 6; i += 3) { c.beginPath(); c.moveTo(hx + i, hy - R + 1); c.lineTo(hx + i - 3, hy - 3); c.stroke(); }
      break;
    case 'liso':
      c.beginPath(); c.arc(hx, hy - 1, R + .8, Math.PI * 1.02, -.05); c.quadraticCurveTo(hx + 8, hy - 3 + Math.sin(t * 2) * .5, hx + 2, hy - 6); c.quadraticCurveTo(hx - 3, hy - 3, hx - R, hy + 2); c.closePath(); fillO(c, col, 1.5);
      hairShine(c, hx, hy, R);
      break;
    case 'raspado':
      c.beginPath(); c.arc(hx, hy - .5, R + .2, Math.PI * 1.08, -.12); c.closePath(); c.globalAlpha = .45; c.fillStyle = col; c.fill(); c.globalAlpha = 1;
      break;
    case 'bandana': {
      c.beginPath(); c.arc(hx, hy - 1.5, R + .7, Math.PI * 1.02, -.02); c.closePath(); fillO(c, capCol, 1.5);
      c.fillStyle = 'rgba(255,255,255,.8)'; for (const [dx, dy] of [[-6, -6], [-1, -9], [4, -7], [-3, -3]]) { c.beginPath(); c.arc(hx + dx, hy + dy, 1, 0, Math.PI * 2); c.fill(); }
      const fl = Math.sin(t * 6) * 1.5;
      c.beginPath(); c.moveTo(hx - R, hy - 3); c.lineTo(hx - R - 7, hy + 3 + fl); c.lineTo(hx - R - 3, hy + 5 + fl * .5); c.closePath(); fillO(c, capCol, 1.2);
      break;
    }
    case 'careca':
      c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(hx - 3, hy - 8, 3.4, 1.8, -.4, 0, Math.PI * 2); c.fill();
      break;
  }
}

function beardS(c, f, hx, hy) {
  const b = f.barba; if (!b || b === 'nenhuma') return;
  const col = f.corCabelo, dark = shade(col, .7);
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jaw = (u, v) => { const x0 = hx - 3.5, y0 = hy + 2, cx = hx - .5, cy = hy + 13.2, x1 = hx + 11.3, y1 = hy + 6.2, w = 1 - u;
    const bx = w * w * x0 + 2 * w * u * cx + u * u * x1, by = w * w * y0 + 2 * w * u * cy + u * u * y1; return [lerp(bx, hx + 4, v * .42), lerp(by, hy + 5, v * .42)]; };
  const dots = (n, a, r, area) => { c.fillStyle = col; c.globalAlpha = a; for (let i = 0; i < n; i++) { const p = area(rnd(), rnd()); c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1; };
  const must = () => { c.beginPath(); c.moveTo(hx + 5.6, hy + 5.6); c.quadraticCurveTo(hx + 8.2, hy + 4.4, hx + 11, hy + 5); c.quadraticCurveTo(hx + 8.4, hy + 6.2, hx + 5.6, hy + 5.6); c.fillStyle = col; c.fill(); };
  if (b === 'rala') { dots(150, .2, .27, (u, v) => jaw(.08 + u * .9, v * .8)); return; }
  if (b === 'bigode') { dots(35, .18, .32, (u, v) => jaw(u, v * .5)); must(); return; }
  if (b === 'desenhada') {
    c.beginPath(); for (let i = 0; i <= 16; i++) { const p = jaw(i / 16, 0); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } for (let i = 16; i >= 0; i--) { const p = jaw(i / 16, .3); c.lineTo(p[0], p[1]); }
    c.closePath(); c.fillStyle = col; c.fill(); must(); return;
  }
  if (b === 'cavanhaque') { dots(40, .2, .33, (u, v) => jaw(u, v * .6)); must(); c.beginPath(); c.ellipse(hx + 7.4, hy + 10.2, 2.6, 2, -.2, 0, Math.PI * 2); c.fillStyle = lin(c, col, hx + 6, hy + 8, hx + 8, hy + 12, 1.1, .8); c.fill(); return; }
  c.beginPath(); for (let i = 0; i <= 18; i++) { const p = jaw(i / 18, 0); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
  c.quadraticCurveTo(hx + 6, hy + 8.4, hx + 1, hy + 5); c.closePath(); c.fillStyle = lin(c, col, hx, hy + 2, hx + 4, hy + 13, 1.1, .75); c.fill();
  c.strokeStyle = dark; c.lineWidth = .4; c.beginPath(); for (let i = 0; i < 14; i++) { const p = jaw(.05 + i / 14 * .9, .1 + rnd() * .5); c.moveTo(p[0], p[1]); c.lineTo(p[0] + .3, p[1] + 1.3); } c.stroke();
  must();
}
function drawFace(c, f, hx, hy, mood, t, lookX, lookY, act) {
  const ex1 = hx + 3.2, ex2 = hx + 9, ey = hy + .5;
  const blink = mood !== 'festa' && (t % 3.7) < .13;
  const style = mood === 'festa' ? 'feliz' : mood === 'triste' ? 'triste' : f.olhos;
  c.fillStyle = 'rgba(244,114,182,.38)'; c.beginPath(); c.ellipse(hx + 8.5, hy + 4.6, 2.3, 1.4, 0, 0, Math.PI * 2); c.fill();
  // marca no rosto
  if (f.marca === 'sardas') { c.fillStyle = 'rgba(120,53,15,.55)'; for (const [dx, dy] of [[6.5, 3.8], [8, 4.8], [9.8, 3.9], [7.3, 5.9], [10.6, 5.4]]) { c.beginPath(); c.arc(hx + dx, hy + dy, .45, 0, Math.PI * 2); c.fill(); } }
  if (f.marca === 'pinta') { c.fillStyle = '#3f2a1d'; c.beginPath(); c.arc(hx + 10.5, hy + 6.5, .7, 0, Math.PI * 2); c.fill(); }
  // olhos
  for (const [ex, sz] of [[ex1, .88], [ex2, 1]]) {
    if (blink || style === 'feliz') {
      c.strokeStyle = OUT; c.lineWidth = 1.4; c.beginPath();
      if (blink) { c.moveTo(ex - 2, ey + .3); c.quadraticCurveTo(ex, ey + 1.2, ex + 2, ey + .3); } else c.arc(ex, ey + 1, 2.2 * sz, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke(); continue;
    }
    c.beginPath(); c.ellipse(ex, ey, 2.6 * sz, 3.2 * sz, 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); ol(c, 1.1);
    const px = ex + lookX * 1, py = ey + lookY * 1.1;
    if (style === 'estrela') {
      c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? .8 : 1.9, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); }
      c.closePath(); c.fillStyle = '#f59e0b'; c.fill();
    } else {
      const ic = OLHO[f.olhoCor] || OLHO.castanho, ig = c.createRadialGradient(px, py + .2, .2, px, py, 1.8 * sz); ig.addColorStop(0, shade(ic, 1.5)); ig.addColorStop(1, shade(ic, .6));
      c.beginPath(); c.arc(px, py, 1.75 * sz, 0, Math.PI * 2); c.fillStyle = ig; c.fill();
      c.beginPath(); c.arc(px, py, .95 * sz, 0, Math.PI * 2); c.fillStyle = '#111827'; c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(px + .6, py - .75, .6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(px - .5, py + .6, .3, 0, Math.PI * 2); c.fill();
    }
    if (style === 'sono') { c.beginPath(); c.rect(ex - 2.8 * sz, ey - 3.4 * sz, 5.6 * sz, 3.2 * sz); c.fillStyle = f.pele; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.1; c.beginPath(); c.moveTo(ex - 2.6 * sz, ey - .2); c.lineTo(ex + 2.6 * sz, ey - .2); c.stroke(); }
    else { c.strokeStyle = '#2a1b14'; c.lineWidth = 1.25; c.lineCap = 'round'; c.beginPath(); c.ellipse(ex, ey, 2.65 * sz, 3.25 * sz, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); c.lineWidth = .7; c.beginPath(); c.moveTo(ex + 2.4 * sz, ey - 1.8); c.lineTo(ex + 3.3 * sz, ey - 2.6); c.stroke(); }
  }
  // sobrancelhas
  const brava = mood === 'foco' || f.sobrancelha === 'brava' || style === 'bravo';
  if (f.sobrancelha !== 'nenhuma' || brava) {
    c.strokeStyle = f.corCabelo === '#f5e6a8' ? '#a16207' : OUT; c.lineWidth = f.sobrancelha === 'grossa' ? 2.2 : 1.4; c.lineCap = 'round';
    const up = act === 'olha' ? -.8 : 0;
    c.beginPath();
    if (mood === 'triste') { c.moveTo(ex1 - 2, ey - 4); c.lineTo(ex1 + 1.8, ey - 5.2); c.moveTo(ex2 - 1.8, ey - 5.2); c.lineTo(ex2 + 2, ey - 4); }
    else if (brava) { c.moveTo(ex1 - 2, ey - 5.6); c.lineTo(ex1 + 2, ey - 4); c.moveTo(ex2 - 2, ey - 4); c.lineTo(ex2 + 2.2, ey - 5.6); }
    else { c.moveTo(ex1 - 2, ey - 4.6 + up); c.quadraticCurveTo(ex1, ey - 5.8 + up, ex1 + 2, ey - 4.8 + up); c.moveTo(ex2 - 2, ey - 4.8 + up); c.quadraticCurveTo(ex2, ey - 5.8 + up, ex2 + 2.2, ey - 4.6 + up); }
    c.stroke();
    if (f.sobrancelha === 'risco') { c.strokeStyle = f.pele; c.lineWidth = .9; c.beginPath(); c.moveTo(ex2 + .7, ey - 6.6 + up); c.lineTo(ex2 + .2, ey - 3.8 + up); c.stroke(); }
  }
  c.strokeStyle = shade(f.pele, .68); c.lineWidth = 1; c.beginPath(); c.arc(hx + 11.2, hy + 3, 1.2, -.6, 1.6); c.stroke();
  beardS(c, f, hx, hy);
  const bc = f.corCabelo;
  if (false && f.barba === 'barba') { c.beginPath(); c.moveTo(hx - 3, hy + 3); c.quadraticCurveTo(hx - 1, hy + 11.5, hx + 6, hy + 11); c.quadraticCurveTo(hx + 11, hy + 10, hx + 11.5, hy + 6); c.quadraticCurveTo(hx + 6, hy + 8.5, hx + 1, hy + 5); c.closePath(); c.fillStyle = bc; c.fill(); }

  // boca
  const mx = hx + 7.6, my = hy + 7;
  c.strokeStyle = OUT; c.lineWidth = 1.2; c.lineCap = 'round';
  if (mood === 'festa') { c.beginPath(); c.moveTo(mx - 3, my - .6); c.quadraticCurveTo(mx, my + 5, mx + 3, my - .6); c.closePath(); c.fillStyle = '#7f1d1d'; c.fill(); c.stroke(); c.fillStyle = '#fff'; c.fillRect(mx - 2, my - .4, 4, 1); c.fillStyle = '#fb7185'; c.beginPath(); c.arc(mx, my + 2.4, 1.2, 0, Math.PI); c.fill(); }
  else if (mood === 'foco') { rr(c, mx - 2.7, my - 1.2, 5.4, 2.7, .8); c.fillStyle = '#fff'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(mx - 2.4, my + .1); c.lineTo(mx + 2.4, my + .1); c.moveTo(mx - .9, my - 1.1); c.lineTo(mx - .9, my + 1.4); c.moveTo(mx + .9, my - 1.1); c.lineTo(mx + .9, my + 1.4); c.lineWidth = .55; c.stroke(); }
  else if (mood === 'triste') { c.beginPath(); c.arc(mx, my + 2.4, 2.3, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
  else if (act === 'olha') { c.beginPath(); c.ellipse(mx, my, 1.1, 1.4, 0, 0, Math.PI * 2); c.fillStyle = '#7f1d1d'; c.fill(); c.stroke(); }
  else if (f.boca === 'ouro') { c.beginPath(); c.moveTo(mx - 2.8, my - .8); c.quadraticCurveTo(mx, my + 3.4, mx + 2.8, my - .8); c.closePath(); c.fillStyle = '#7f1d1d'; c.fill(); c.stroke(); c.fillStyle = '#fff'; c.fillRect(mx - 2.2, my - .6, 4.4, 1.2); c.fillStyle = '#fbbf24'; c.fillRect(mx + .4, my - .6, 1.2, 1.3); }
  else if (f.boca === 'serio') { c.beginPath(); c.moveTo(mx - 2, my); c.lineTo(mx + 1.6, my - .3); c.lineTo(mx + 2.4, my - 1); c.stroke(); }
  else if (f.boca === 'lingua') { c.beginPath(); c.arc(mx, my - .8, 2.2, .25, Math.PI - .25); c.stroke(); c.beginPath(); c.ellipse(mx + .8, my + 1.6, 1.1, 1.5, .3, 0, Math.PI * 2); c.fillStyle = '#fb7185'; c.fill(); c.lineWidth = .8; c.stroke(); }
  else { c.beginPath(); c.arc(mx, my - .8, 2.2, .25, Math.PI - .25); c.stroke(); }
  // curativo
  if (f.marca === 'curativo') {
    c.save(); c.translate(hx + 9.5, hy + 4.2); c.rotate(-.5);
    rr(c, -2.8, -1, 5.6, 2, .8); fillO(c, '#fcd9b0', .8);
    c.fillStyle = 'rgba(180,120,80,.6)'; c.fillRect(-.7, -.8, 1.4, 1.6);
    c.restore();
  }
  // óculos
  if (f.oculos !== 'nenhum') {
    const lens = f.oculos === 'neon' ? 'rgba(57,255,20,.8)' : f.oculos === 'redondo' ? 'rgba(186,230,253,.35)' : '#111827';
    if (f.oculos === 'juliete') {
      c.beginPath(); c.moveTo(ex1 - 3.4, ey - 2.4); c.quadraticCurveTo(hx + 6, ey - 3.6, ex2 + 3.6, ey - 2.4); c.lineTo(ex2 + 3, ey + 2.4); c.quadraticCurveTo(hx + 6, ey + 3.4, ex1 - 3, ey + 2.2); c.closePath();
      const g = c.createLinearGradient(ex1 - 3, ey - 2, ex2 + 3, ey + 2); g.addColorStop(0, '#60a5fa'); g.addColorStop(.5, '#a78bfa'); g.addColorStop(1, '#f472b6');
      c.fillStyle = g; c.fill(); ol(c, 1.2);
      c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(ex1 - 1, ey - 1.6, 3, .9);
    } else {
      for (const ex of [ex1, ex2]) {
        c.beginPath(); if (f.oculos === 'redondo') c.arc(ex, ey, 3, 0, Math.PI * 2); else rr(c, ex - 3, ey - 2.3, 6, 4.4, 1.4);
        c.fillStyle = lens; c.fill(); ol(c, 1.2);
      }
      c.beginPath(); c.moveTo(ex1 + 3, ey - .6); c.lineTo(ex2 - 3, ey - .6); c.moveTo(ex1 - 3, ey - .6); c.lineTo(hx - 4, ey - 1.6); ol(c, 1.1);
      if (f.oculos !== 'redondo') { c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(ex2 - 1.8, ey - 1.4, 1.6, .9); }
    }
  }
  if (mood === 'foco') for (let i = 0; i < 2; i++) { const d = (t * 2 + i * .5) % 1; c.fillStyle = 'rgba(125,211,252,.95)'; c.beginPath(); c.ellipse(hx - 5 - i * 3, hy - 8 + d * 7, 1.2, 1.8, 0, 0, Math.PI * 2); c.fill(); }
  if (mood === 'triste') for (const ex of [ex1, ex2]) { const d = (t * 1.6 + ex) % 1; c.fillStyle = 'rgba(125,211,252,.9)'; c.beginPath(); c.ellipse(ex, ey + 3 + d * 9, 1, 1.5, 0, 0, Math.PI * 2); c.fill(); }
}

function drawTop(c, f, x, y, w, h, t) {
  if (f.top === 'semcamisa') {
    rr(c, x + .5, y, w - 1, h, 5); c.fillStyle = lin(c, f.pele, x, y, x + w, y + h, 1.1, .85); c.fill();
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x + .5, y + h * .65, w - 1, h * .35);
    c.strokeStyle = shade(f.pele, .72); c.lineWidth = .9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + 3.5, y + 5.5); c.quadraticCurveTo(x + 6.5, y + 7.5, x + 8, y + 5.5); c.moveTo(x + 9, y + 5.5); c.quadraticCurveTo(x + 10.5, y + 7.5, x + 13, y + 5.5); c.stroke();
    c.beginPath(); c.arc(x + w / 2 + 1, y + h - 3.2, .6, 0, Math.PI * 2); c.fillStyle = shade(f.pele, .6); c.fill();
    rr(c, x + .5, y, w - 1, h, 5); ol(c, 1.6);
    return;
  }
  const regata = f.top === 'regata';
  rr(c, regata ? x + 1.2 : x, y, regata ? w - 2.4 : w, h, 5);
  c.save(); c.fillStyle = lin(c, f.cor1, x, y, x + w, y + h); c.fill(); c.clip();
  c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(x, y + h * .62, w, h);
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x, y, 4, h);
  if (f.top === 'listrada') { c.fillStyle = f.cor2; for (let i = 0; i < 3; i++) c.fillRect(x, y + 2.5 + i * 4.3, w, 2); }
  if (f.kit) drawKit(c, f.kit, x, y, w, h);
  if (f.top === 'cortavento') { c.fillStyle = f.cor2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + 3); c.lineTo(x + w / 2, y + 7); c.lineTo(x, y + 3); c.closePath(); c.fill(); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = .7; c.beginPath(); c.moveTo(x + w / 2 + 1, y + 1); c.lineTo(x + w / 2 + 1, y + h); c.stroke(); }
  if (f.top === 'time') { c.fillStyle = f.cor2; c.fillRect(x, y, 3.2, h); c.fillRect(x + w - 3.2, y, 3.2, h); c.beginPath(); c.moveTo(x + w / 2 - 3, y); c.lineTo(x + w / 2, y + 3.5); c.lineTo(x + w / 2 + 3, y); c.fill(); }
  if (f.top === 'regata') { c.fillStyle = f.cor2; c.fillRect(x, y, w, 1.6); }
  if (f.top === 'moletom') {
    c.fillStyle = shade(f.cor1, .78); rr(c, x + 3, y + h - 6.5, w - 6, 5, 2); c.fill();
    const sw = Math.sin(t * 3) * .7;
    c.strokeStyle = '#f8fafc'; c.lineWidth = .9; c.beginPath(); c.moveTo(x + w / 2 - 1.5, y + 1); c.lineTo(x + w / 2 - 2 + sw, y + 6); c.moveTo(x + w / 2 + 1.5, y + 1); c.lineTo(x + w / 2 + 2 + sw, y + 6); c.stroke();
  }
  if (f.top === 'lisa') { c.fillStyle = f.cor2; c.beginPath(); c.arc(x + w / 2 + 1.5, y + 6, 2.2, 0, Math.PI * 2); c.fill(); c.strokeStyle = shade(f.cor1, .7); c.lineWidth = 1; c.beginPath(); c.arc(x + w / 2, y - 1, 3.5, .2, Math.PI - .2); c.stroke(); }
  c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = .8; c.beginPath(); c.moveTo(x + 4, y + h - 3); c.quadraticCurveTo(x + 7, y + h - 5, x + 9, y + h - 3); c.stroke(); // dobra
  c.restore();
  rr(c, regata ? x + 1.2 : x, y, regata ? w - 2.4 : w, h, 5); ol(c, 1.6);
  if (f.kit && f.kit.escudo && f.top === 'time') drawEscudo(c, f.kit.escudo, x + w * .72, y + 4.2, 2);
  if (f.top === 'time') {
    c.save(); c.translate(x + w / 2 + 1, y + h * .58); c.scale(c.getTransform().a < 0 ? -1 : 1, 1);
    c.fillStyle = f.cor2; c.font = "900 6.5px Nunito, Arial, sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(f.num || '10', 0, 0); c.restore();
  }
}

function drawLeg(c, f, lx, hipY, footX, footY, knee) {
  // perna (com joelho quando ajoelhado)
  const [kx, ky, ax, ay] = ik(lx, hipY, footX, footY - 2.4, 5, 5, e => e[0] * (knee < 0 ? -1 : 1));
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(lx, hipY); c.lineTo(kx, ky); c.lineTo(ax, ay); c.strokeStyle = edge(f.pele); c.lineWidth = 6.3; c.stroke(); c.strokeStyle = f.pele; c.lineWidth = 4.5; c.stroke();
  const fx = footX, fy = footY;
  if (f.calcado === 'mola') {
    c.fillStyle = '#f8fafc'; c.fillRect(fx - 2.6, fy - 6.8, 5, 1.8);
    rr(c, fx - 3.2, fy - 5.6, 8.4, 4, 2); fillO(c, f.corCalcado, 1.3);
    c.fillStyle = f.corCalcado === '#111827' ? '#ef4444' : '#111827'; c.beginPath(); c.moveTo(fx - 1, fy - 3.4); c.quadraticCurveTo(fx + 2, fy - 5.2, fx + 4.6, fy - 3.2); c.lineTo(fx + 3, fy - 2.6); c.closePath(); c.fill();
    c.strokeStyle = '#94a3b8'; c.lineWidth = 1; c.beginPath(); // molas
    for (const sx of [fx - 1.8, fx + 3.2]) { c.moveTo(sx, fy - 1.8); c.lineTo(sx + 1, fy - 1.2); c.lineTo(sx - .4, fy - .6); c.lineTo(sx + 1, fy); }
    c.stroke();
    rr(c, fx - 3.4, fy - .2, 8.8, 1.4, .7); fillO(c, '#e2e8f0', .9);
    return;
  }
  if (f.calcado === 'meiachinelo') {
    rr(c, fx - 2.4, fy - 8.5, 4.8, 7.8, 1.6); fillO(c, '#f8fafc', 1.1);
    c.strokeStyle = '#cbd5e1'; c.lineWidth = .7; c.beginPath(); c.moveTo(fx - 2, fy - 7.3); c.lineTo(fx + 2, fy - 7.3); c.moveTo(fx - 2, fy - 6.4); c.lineTo(fx + 2, fy - 6.4); c.stroke();
    rr(c, fx - 3.4, fy - 1.1, 8.4, 1.9, .9); fillO(c, shade(f.corCalcado, .9), 1.1);
    rr(c, fx - 2.2, fy - 3, 5.8, 2.2, 1); fillO(c, f.corCalcado, 1);
    return;
  }
  if (f.calcado === 'bota') { rr(c, fx - 3.2, fy - 6, 6.4, 6.6, 1.8); fillO(c, f.corCalcado, 1.3); rr(c, fx - 3.2, fy - .6, 8, 2.2, 1); fillO(c, shade(f.corCalcado, .6), 1.1); }
  else if (f.calcado === 'chinelo') {
    rr(c, fx - 3.4, fy - 1, 8.2, 1.8, .9); fillO(c, f.corCalcado, 1.1);
    c.strokeStyle = shade(f.corCalcado, .6); c.lineWidth = 1.2; c.beginPath(); c.moveTo(fx - 1, fy - 1); c.lineTo(fx + 1.5, fy - 3); c.lineTo(fx + 3, fy - 1); c.stroke();
  } else {
    c.fillStyle = '#f8fafc'; c.fillRect(fx - 2.6, fy - 5.2, 5, 1.8); // meia
    rr(c, fx - 3.2, fy - 3.8, 8.2, 4.2, 2); fillO(c, f.corCalcado, 1.3);
    c.fillStyle = '#fff'; c.fillRect(fx - 3, fy - 1, 7.8, 1.2);
    c.fillStyle = f.corCalcado === '#f8fafc' ? '#94a3b8' : '#fff';
    c.beginPath(); c.arc(fx + 1.2, fy - 2.6, .45, 0, Math.PI * 2); c.arc(fx + 2.8, fy - 2.4, .45, 0, Math.PI * 2); c.fill();
  }
}

export function drawFigure(c, x, feet, hx0, hy0, f, s, o = {}) {
  f = withKit(f);
  if (o.view === 'front') return drawFront(c, x, feet, f, s, o);
  const dir = o.dir || 1, pose = o.pose || 'pipa', t = o.t || 0, td = o.td || 0, pull = o.pull || 0;
  const act = pose === 'pipa' && !o.foco ? (o.act || '') : '', at = o.at || 0;
  const mood = pose === 'festa' ? 'festa' : pose === 'triste' ? 'triste' : o.foco ? 'foco' : 'normal';
  const bx = x - dir * 19 * s;
  let jump = 0, rot = 0, sway = 0, lean = 0, legL = 0, legR = 0, headDy = 0, headDx = 0, kneel = 0, sqx = 1, sqy = 1;
  let aF = null, aB = null, reel = true;
  let lookX = o.look ? o.look[0] : .6, lookY = o.look ? o.look[1] : -.8;
  const beat = o.beat || 0, bob = Math.sin(t * 2.4 + x * .01) * .55 + (pose === 'pipa' ? beat * 1.4 : 0);
  const ease = k => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
  if (pose === 'pipa') {
    lean = -pull * .09 + (o.foco ? -.04 : 0);
    aF = [(hx0 - bx) / s * dir + Math.sin(t * 26) * pull * 2.2, (hy0 - feet) / s + Math.cos(t * 26) * pull * 1.6];
    aB = [-9, -15];
    if (act) { // ações à toa
      const k = Math.sin(Math.min(at / 1.2, 1) * Math.PI); // vai e volta
      if (act === 'suor') aB = [lerp(-9, 6, k), lerp(-15, -47, k)];
      else if (act === 'bone') aB = [lerp(-9, 8, k), lerp(-15, -52, k)];
      else if (act === 'olha') { lookX = lerp(lookX, -1, k); lookY = lerp(lookY, -.2, k); headDx = -1.2 * k; }
      else if (act === 'pulo') { jump = Math.max(0, Math.sin(Math.min(at / .45, 1) * Math.PI)) * 5; if (at > .42 && at < .55) { sqx = 1.07; sqy = .93; } }
      else if (act === 'acena') { aB = [lerp(-9, -12, k), lerp(-15, -56, k) + Math.sin(at * 16) * 2 * k]; reel = k < .2; lookX = lerp(lookX, .1, k); lookY = lerp(lookY, 0, k); }
    }
  } else if (pose === 'lanca') { // joga a pipa pro alto
    const k = ease(td / .7), up = Math.sin(Math.min(td / .7, 1) * Math.PI);
    aF = [lerp(-4, 16, k), lerp(-14, -54, k)];
    aB = [-9, -15]; lean = up * .1; jump = up * 2;
    lookX = .5; lookY = -1;
  } else if (pose === 'festa') {
    const d = f.danca;
    if (d === 'romano') { // braços abertos balançando, chute cruzado
      const ph = td * 9; sway = Math.sin(ph) * 2; jump = Math.abs(Math.sin(ph)) * 2.5;
      legL = Math.sin(ph) > 0 ? -3.5 : 0; legR = Math.sin(ph) > 0 ? 0 : -3.5;
      aF = [15, -30 + Math.sin(ph) * 7]; aB = [-15, -30 - Math.sin(ph) * 7]; headDx = Math.sin(ph) * .8;
    }
    else if (d === 'tremidinha') { const sh = Math.sin(td * 42); kneel = 2.2; sway = sh * 1.2; rot = sh * .03; aF = [9 + sh, -26]; aB = [-8 - sh, -26]; headDy = Math.abs(sh) * .8; }
    else if (d === 'pulinho') { jump = Math.abs(Math.sin(td * 8)) * 8; aF = [7, -50]; aB = [-6, -50]; if (jump < 1.2) { sqx = 1.08; sqy = .92; } }
    else if (d === 'passinho') { sway = Math.sin(td * 10) * 3.2; legL = Math.sin(td * 10) * 3; legR = -legL; aF = [9 + Math.sin(td * 10) * 4, -24 - Math.cos(td * 10) * 5]; aB = [-9 - Math.sin(td * 10) * 4, -24 + Math.cos(td * 10) * 5]; headDy = Math.abs(Math.sin(td * 10)) * -1.5; }
    else if (d === 'dab') { const k = ease(td / .25); lean = -.14 * k; aF = [lerp(8, -5, k), lerp(-30, -40, k)]; aB = [lerp(-8, -19, k), lerp(-20, -53, k)]; headDy = 2.5 * k; headDx = 2 * k; }
    else if (d === 'mortal') { const k = Math.min(td / .85, 1); jump = Math.sin(k * Math.PI) * 20; rot = -ease(k) * Math.PI * 2; aF = [7, -48]; aB = [-6, -48]; if (k > .95 && td < 1.05) { sqx = 1.1; sqy = .9; } }
    else { sway = Math.sin(td * 9) * 2.6; rot = Math.sin(td * 9) * .06; aF = [7, -19]; aB = [-7, -19]; }
    reel = false;
    const amp = ease(td / .2); // entra suave a partir da pose da linha
    jump *= amp; sway *= amp; rot *= amp; lean *= amp; legL *= amp; legR *= amp;
    aF = [lerp(19, aF[0], amp), lerp(-36, aF[1], amp)]; aB = [lerp(-9, aB[0], amp), lerp(-15, aB[1], amp)];
  } else { // triste: ajoelha e põe a mão no rosto
    const k = ease(td / .4);
    kneel = 5 * k; headDy = 2.5 + k; headDx = Math.sin(t * 22) * .4 * k;
    aF = [lerp(6, 9, k), lerp(-14, -38, k)]; aB = [lerp(-6, 1, k), lerp(-14, -38, k)];
    reel = false;
  }
  c.save();
  c.translate(bx, feet);
  c.scale(s * dir, s);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0, 0, Math.max(6, 13 - jump * .35), 3, 0, 0, Math.PI * 2); c.fill();
  if (o.me) { c.strokeStyle = 'rgba(253,224,71,.95)'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, 0, 16, 4.2, 0, 0, Math.PI * 2); c.stroke(); }
  c.translate(sway, -jump);
  if (sqx !== 1) c.scale(sqx, sqy);
  if (rot) { c.translate(0, -24); c.rotate(rot); c.translate(0, 24); }
  if (lean) c.rotate(lean);
  const hipY = -12 + kneel;
  // pernas
  if (kneel) { drawLeg(c, f, -3.2, hipY, -7, 0, -3); drawLeg(c, f, 3.4, hipY, 7.5, 0, 3); }
  else { drawLeg(c, f, -3.2, hipY, -4.2 + legL * .6, legL < 0 ? legL : 0); drawLeg(c, f, 3.4, hipY, 4.4 + legR * .6, legR < 0 ? legR : 0); }
  // bermuda
  const bL = f.bermuda === 'tactel' || f.bermuda === 'estampada' ? 10 : 8;
  rr(c, -7.2, hipY - 6, 14.4, bL, 2.4); c.fillStyle = lin(c, f.short, -7.2, hipY - 6, 7.2, hipY - 6 + bL); c.fill();
  c.save(); rr(c, -7.2, hipY - 6, 14.4, bL, 2.4); c.clip();
  if (f.bermuda === 'tactel') { c.fillStyle = f.cor2 === f.short ? '#fff' : f.cor2; c.fillRect(4.2, hipY - 6, 1.6, bL); c.fillStyle = '#fff'; c.fillRect(6, hipY - 6, 1, bL); c.fillRect(-7.2, hipY + bL - 7.6, 14.4, 1.1); }
  else if (f.bermuda === 'estampada') {
    const cs = [f.cor2, '#fde047', '#fff'];
    for (let i = 0; i < 9; i++) { const px = -6 + (i % 3) * 5 + (i > 2 && i < 6 ? 2.5 : 0), py = hipY - 4.5 + Math.floor(i / 3) * 3.2; c.fillStyle = cs[i % 3]; c.beginPath(); c.arc(px, py, 1, 0, Math.PI * 2); c.arc(px + 1.2, py + .8, .7, 0, Math.PI * 2); c.fill(); }
  } else { c.fillStyle = f.cor2 === f.short ? '#fff' : f.cor2; c.fillRect(5.2, hipY - 5.5, 1.3, 7); }
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-7.2, hipY - 6, 14.4, 1.4);
  c.restore();
  rr(c, -7.2, hipY - 6, 14.4, bL, 2.4); ol(c, 1.5);
  c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = .8; c.beginPath(); c.moveTo(-4.5, hipY - 3.5); c.lineTo(-2, hipY - 3.5); c.stroke();
  const shY = -26 + bob * .6 + kneel;
  const armCol = f.top === 'moletom' ? f.cor1 : f.pele, noSleeve = f.top === 'regata' || f.top === 'moletom' || f.top === 'semcamisa';
  // braço de trás + carretel
  const AB = arm(c, -4.5, shY + 2, aB[0], aB[1], e => -e[0] + e[1] * .2, armCol, noSleeve ? null : f.cor1, f.top === 'moletom' ? shade(f.cor1, .75) : null);
  aB = [AB.hx, AB.hy]; const cB = [AB.ex, AB.ey];
  if (f.relogio && f.relogio !== 'nenhum') { const wx = aB[0] + (cB[0] - aB[0]) * .28, wy = aB[1] + (cB[1] - aB[1]) * .28; c.beginPath(); c.arc(wx, wy, 2.2, 0, Math.PI * 2); fillO(c, f.relogio === 'dourado' ? '#fbbf24' : '#111827', 1); c.fillStyle = f.relogio === 'dourado' ? '#fff7cc' : '#64748b'; c.beginPath(); c.arc(wx, wy, 1, 0, Math.PI * 2); c.fill(); }
  handF(c, aB[0], aB[1], Math.atan2(aB[1] - cB[1], aB[0] - cB[0]), f.pele, 'punho', false);
  if (reel && (pose === 'pipa' || pose === 'lanca')) drawReel(c, aB[0] - 1, aB[1] + 1.8, f.carretel, f.cor1, o.reel || 0);
  const hxC = 1 + headDx, hyC = -41 + bob + headDy;
  drawHairBack(c, f, hxC, hyC, 12, t);
  drawTop(c, f, -8, shY - 3, 16, 14.5, t);
  c.fillStyle = 'rgba(0,0,0,.15)'; c.beginPath(); c.ellipse(hxC + 1, shY - 1.5, 7, 2.6, 0, 0, Math.PI * 2); c.fill();
  if (f.corrente === 'grossa') {
    const sw = Math.sin(t * 3) * .8;
    for (let i = 0; i <= 8; i++) { const k = i / 8, px = lerp(-3.5, 6.5, k), py = shY - 2.8 + Math.sin(k * Math.PI) * 7 + (i === 4 ? 0 : 0); const qx = px + sw * Math.sin(k * Math.PI); c.beginPath(); c.ellipse(qx, py, 1.25, .95, i % 2 ? .6 : -.6, 0, Math.PI * 2); c.fillStyle = i % 2 ? '#fbbf24' : '#f59e0b'; c.fill(); c.strokeStyle = '#92400e'; c.lineWidth = .5; c.stroke(); }
    c.beginPath(); c.arc(1.5 + sw * 1.2, shY + 5.8, 2.3, 0, Math.PI * 2); fillO(c, '#fde047', 1);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(.8 + sw * 1.2, shY + 5.1, .6, 0, Math.PI * 2); c.fill();
  } else if (f.corrente !== 'nenhuma') {
    const cc = f.corrente === 'ouro' ? '#facc15' : '#e2e8f0', sw = Math.sin(t * 3) * .8;
    c.strokeStyle = OUT; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-3, shY - 2.5); c.quadraticCurveTo(1.5 + sw, shY + 5, 6, shY - 2.5); c.stroke();
    c.strokeStyle = cc; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(1.5 + sw * 1.2, shY + 2.8, 1.7, 0, Math.PI * 2); fillO(c, cc, 1);
  }
  // cabeça
  const R = 12;
  c.beginPath(); c.arc(hxC - 7.8, hyC + 1, 3, 0, Math.PI * 2); fillO(c, f.pele, 1.4);
  if (f.brinco === 'argola') { c.beginPath(); c.arc(hxC - 8, hyC + 4.6, 1.6, 0, Math.PI * 2); c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke(); c.strokeStyle = '#fbbf24'; c.lineWidth = .8; c.stroke(); }
  if (f.brinco === 'brilhante') { const gl = .6 + Math.sin(t * 5) * .4; c.fillStyle = '#e0f2fe'; c.beginPath(); c.arc(hxC - 8, hyC + 3.4, 1.1, 0, Math.PI * 2); c.fill(); c.strokeStyle = `rgba(255,255,255,${gl})`; c.lineWidth = .6; c.beginPath(); c.moveTo(hxC - 10, hyC + 3.4); c.lineTo(hxC - 6, hyC + 3.4); c.moveTo(hxC - 8, hyC + 1.4); c.lineTo(hxC - 8, hyC + 5.4); c.stroke(); }
  skinHead(c, f, hxC, hyC, R);
  c.fillStyle = 'rgba(0,0,0,.07)'; c.beginPath(); c.arc(hxC - 2.5, hyC + 2.5, R - 1.5, Math.PI * .5, Math.PI * 1.3); c.fill();
  c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.ellipse(hxC + 3, hyC - 5, 5, 3, -.3, 0, Math.PI * 2); c.fill();
  drawFace(c, f, hxC, hyC, mood, t + x * .003, lookX, lookY, act);
  drawHairFront(c, f, hxC, hyC, R, t);
  if (f.fone === 'fone') {
    c.strokeStyle = OUT; c.lineWidth = 3.2; c.beginPath(); c.arc(hxC - 1, hyC - 1, R + 1.5, Math.PI * 1.05, Math.PI * 1.75); c.stroke();
    c.strokeStyle = '#334155'; c.lineWidth = 1.8; c.stroke();
    rr(c, hxC - 11.5, hyC - 3, 5.6, 8, 2.2); fillO(c, f.cor1, 1.3);
  }
  // braço da frente (por cima)
  const AF = arm(c, 4.5, shY + 2, aF[0], aF[1], e => e[1] + e[0] * .3, armCol, noSleeve ? null : f.cor1, f.top === 'moletom' ? shade(f.cor1, .75) : null, 9.6);
  aF = [AF.hx, AF.hy];
  handF(c, aF[0], aF[1], Math.atan2(AF.hy - AF.ey, AF.hx - AF.ex), f.pele, pose === 'festa' && (f.danca === 'pulinho' || f.danca === 'romano') ? 'aberta' : 'punho', false);
  if (pose === 'pipa' && pull > .55) { // risquinhos de relar
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.2; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = t * 18 + i * 2.1; c.beginPath(); c.arc(aF[0], aF[1], 6 + i * 1.6, a, a + .7); c.stroke(); }
  }
  c.restore();
  if (o.me) {
    c.save();
    c.font = `900 ${Math.max(7, 7.5 * s)}px Nunito, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.lineWidth = 3; c.strokeStyle = OUT; c.fillStyle = '#fde047';
    const ty = feet - (58 + jump - kneel) * s;
    c.strokeText('VOCÊ', bx, ty); c.fillText('VOCÊ', bx, ty);
    c.restore();
  }
}


/* =====================================================================
   VISTA DE FRENTE (lobby, editor e avatar)
   ===================================================================== */
function capColOf(f) { return f.cor2 === '#f8fafc' && f.cor1 !== '#f8fafc' ? f.cor1 : f.cor2; }

function hairBackF(c, f, hx, hy, R, t) {
  const col = f.corCabelo;
  if (f.cabelo === 'black') { c.beginPath(); c.arc(hx, hy - 3, R + 6.5, 0, Math.PI * 2); fillO(c, col, 1.6); }
  if (f.cabelo === 'liso') { rr(c, hx - R - 1.5, hy - 6, R * 2 + 3, R + 10, 7); fillO(c, col, 1.5); }
  if (f.cabelo === 'trancas') {
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const bx = hx + sd * (R - 1.5 - i * 2.6), sw = Math.sin(t * 3 + i + sd) * 1.2;
      for (const [w, cl] of [[3.8, OUT], [2.2, col]]) { c.strokeStyle = cl; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx, hy - 2); c.quadraticCurveTo(bx + sd * 2 + sw, hy + 7, bx + sd * 1.5 + sw * 1.6, hy + 14); c.stroke(); }
      c.beginPath(); c.arc(bx + sd * 1.5 + sw * 1.6, hy + 14, 1.3, 0, Math.PI * 2); c.fillStyle = '#facc15'; c.fill();
    }
  }
  if (f.top === 'moletom') { c.beginPath(); c.ellipse(hx, hy + 12.5, 11, 5.5, 0, 0, Math.PI * 2); fillO(c, shade(f.cor1, .78), 1.4); }
}

function hairFrontF(c, f, hx, hy, R, t) {
  const col = f.corCabelo, capCol = capColOf(f);
  const cap = (low) => { c.beginPath(); c.arc(hx, hy - 2, R + .9, Math.PI, 0); c.lineTo(hx + R + .9, hy - low); c.lineTo(hx - R - .9, hy - low); c.closePath(); fillG(c, capCol, hx - R, hy - R - 2, hx + R, hy - low, 1.5, 1.22, .78); };
  switch (f.cabelo) {
    case 'bone': {
      cap(3.5);
      c.strokeStyle = shade(capCol, .7); c.lineWidth = .9; c.beginPath(); c.moveTo(hx - 5, hy - R + 1); c.quadraticCurveTo(hx - 7, hy - 8, hx - 7.5, hy - 4); c.moveTo(hx + 5, hy - R + 1); c.quadraticCurveTo(hx + 7, hy - 8, hx + 7.5, hy - 4); c.stroke();
      c.beginPath(); for (let i = 0; i < 10; i++) { const r2 = i % 2 ? 1.1 : 2.6, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(hx + Math.cos(a) * r2, hy - 8.5 + Math.sin(a) * r2); }
      c.closePath(); c.fillStyle = capCol === f.cor1 ? '#fde047' : f.cor1; c.fill();
      c.beginPath(); c.arc(hx, hy - R - 2.8, 1.5, 0, Math.PI * 2); fillO(c, shade(capCol, .7), 1);
      rr(c, hx - R - 3.5, hy - 5.4, R * 2 + 7, 3.8, 1.8); fillO(c, shade(capCol, .68), 1.5); // aba reta
      c.fillStyle = '#fcd34d'; c.fillRect(hx + 5, hy - 5, 4.6, 2.9); c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(hx + 5.5, hy - 4.7, 1, 2.2); // adesivo
      c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.ellipse(hx - 4.5, hy - 10, 3.5, 1.7, -.3, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'bonetras': {
      cap(5);
      c.beginPath(); c.arc(hx, hy - 4.8, 4.8, Math.PI, 0); c.closePath(); fillO(c, col, 1.2); // cabelo aparecendo na abertura
      c.strokeStyle = shade(capCol, .6); c.lineWidth = 1.4; c.beginPath(); c.arc(hx, hy - 4.8, 5.6, Math.PI * 1.05, -.05); c.stroke();
      rr(c, hx - 7, hy - R - 5, 14, 2.6, 1.2); fillO(c, shade(capCol, .6), 1.1); // aba atrás
      c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.ellipse(hx - 5, hy - 10, 3, 1.5, -.3, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'curto':
    case 'disfarcado': {
      const low = f.cabelo === 'disfarcado' ? 1.2 : 0;
      c.beginPath(); c.arc(hx, hy - 1 - low, R + .4, Math.PI * 1.04, Math.PI * 1.96); c.lineTo(hx + R - 1.5, hy - 3.5 - low); c.quadraticCurveTo(hx + 3, hy - 8.5 - low, hx, hy - 7 - low); c.quadraticCurveTo(hx - 3, hy - 8.5 - low, hx - R + 1.5, hy - 3.5 - low); c.closePath(); fillO(c, col, 1.4);
      c.globalAlpha = .32; c.fillStyle = col; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(hx + sd * (R - 1.8), hy - 1, 2.2, 4.5, 0, 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1;
      if (low) { c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = .75; for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(hx + sd * (R - 2.2), hy - 5.2); c.lineTo(hx + sd * (R - 5.4), hy - 7.6); c.moveTo(hx + sd * (R - 2), hy - 3.4); c.lineTo(hx + sd * (R - 5), hy - 5.6); c.stroke(); } }
      hairShine(c, hx, hy - 1, R);
      break;
    }
    case 'nevou': {
      c.beginPath(); c.arc(hx, hy - 1, R + .3, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); fillO(c, shade(col, .82), 1.4);
      for (let i = 0; i < 13; i++) { const a = Math.PI * 1.04 + i / 12 * Math.PI * .92, r2 = R - 1 + (i % 2) * 1.3; c.beginPath(); c.arc(hx + Math.cos(a) * r2, hy - 1.5 + Math.sin(a) * r2, 2.4, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(hx - 6 + i * 3, hy - 6.5 + (i % 2) * .8, 2.1, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }
      c.fillStyle = 'rgba(80,50,20,.45)'; for (const [dx, dy] of [[-8, -4], [-4, -10], [2, -12], [7, -8], [-1, -6]]) { c.beginPath(); c.arc(hx + dx, hy + dy, .7, 0, Math.PI * 2); c.fill(); }
      hairShine(c, hx, hy - 1.5, R);
      break;
    }
    case 'cacheado':
      for (let i = 0; i < 11; i++) { const a = Math.PI * .96 + i / 10 * Math.PI * 1.08, b = Math.sin(t * 4 + i) * .3; c.beginPath(); c.arc(hx + Math.cos(a) * (R - .5), hy - 1.5 + Math.sin(a) * (R - .5) + b, 4, 0, Math.PI * 2); fillO(c, col, 1.2); }
      break;
    case 'black':
      c.beginPath(); c.arc(hx, hy - 3, R + 6.5, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(hx, hy - 3, hx - R - 6, hy - 4.5); c.closePath(); c.fillStyle = col; c.fill();
      hairShine(c, hx - 2, hy - 5, R + 5);
      break;
    case 'moicano':
      c.beginPath(); c.arc(hx, hy, R + .2, Math.PI * 1.08, Math.PI * 1.92); c.closePath(); c.globalAlpha = .4; c.fillStyle = col; c.fill(); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(hx - 3.5, hy - 5);
      for (let i = 0; i < 4; i++) { const yy = hy - 7 - i * 2.4, w = Math.sin(t * 5 + i) * .5; c.lineTo(hx - 4.5 + w, yy - 2.5); c.lineTo(hx - 3, yy - 1); }
      c.lineTo(hx, hy - R - 8); for (let i = 3; i >= 0; i--) { const yy = hy - 7 - i * 2.4; c.lineTo(hx + 3, yy - 1); c.lineTo(hx + 4.5, yy - 2.5); }
      c.lineTo(hx + 3.5, hy - 5); c.closePath(); fillO(c, col, 1.3);
      break;
    case 'trancas':
      c.beginPath(); c.arc(hx, hy - 1, R + .4, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(hx + R - 1, hy - 3.5); c.lineTo(hx - R + 1, hy - 3.5); c.closePath(); fillO(c, col, 1.5);
      c.strokeStyle = shade(col, 1.7); c.lineWidth = .8; c.beginPath();
      for (const dx of [-7, -3.5, 0, 3.5, 7]) { c.moveTo(hx + dx * .4, hy - R + 1); c.lineTo(hx + dx, hy - 4); }
      c.stroke();
      break;
    case 'liso':
      c.beginPath(); c.arc(hx, hy - 1, R + .9, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(hx + R + .9, hy - 2);
      for (let i = 0; i <= 6; i++) { const px = hx + R - i * (2 * R / 6), py = hy - 3 + (i % 2 ? 2.2 : 0) + Math.sin(t * 2 + i) * .2; c.lineTo(px, py); }
      c.closePath(); fillO(c, col, 1.5);
      hairShine(c, hx, hy - 1, R);
      break;
    case 'raspado':
      c.beginPath(); c.arc(hx, hy - .5, R + .2, Math.PI * 1.06, Math.PI * 1.94); c.closePath(); c.globalAlpha = .42; c.fillStyle = col; c.fill(); c.globalAlpha = 1;
      break;
    case 'bandana': {
      cap(3);
      c.fillStyle = 'rgba(255,255,255,.85)'; for (const [dx, dy] of [[-7, -6], [-2, -10], [4, -8], [8, -4], [0, -5], [-5, -3]]) { c.beginPath(); c.arc(hx + dx, hy + dy, .95, 0, Math.PI * 2); c.fill(); }
      const fl = Math.sin(t * 6) * 1.4;
      c.beginPath(); c.arc(hx + R + 1, hy - 4, 2.4, 0, Math.PI * 2); fillO(c, capCol, 1.1);
      c.beginPath(); c.moveTo(hx + R + 1, hy - 3); c.lineTo(hx + R + 6, hy + 3 + fl); c.lineTo(hx + R + 3.4, hy + 4 + fl * .5); c.closePath(); fillO(c, capCol, 1.1);
      break;
    }
    case 'careca':
      c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(hx - 4, hy - 8, 3.6, 1.8, -.4, 0, Math.PI * 2); c.fill();
      break;
  }
}

/* barba e bigode com textura (vista de frente) */
function beardF(c, f, hx, hy) {
  const b = f.barba; if (!b || b === 'nenhuma') return;
  const col = f.corCabelo, dark = shade(col, .7);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jaw = (u, v) => { const a = Math.PI * (.04 + .92 * u), rx = 11.4 - v * 3.4, ry = 11.8 - v * 3.8; return [hx - Math.cos(a) * rx, hy + 1.6 + Math.sin(a) * ry]; };
  const stubble = (n, a, r, area) => { c.fillStyle = col; c.globalAlpha = a; for (let i = 0; i < n; i++) { const p = area(rnd(), rnd()); c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1; };
  const lip = (u, v) => [hx - 3.8 + u * 7.6, hy + 5.8 + v * 1.4];
  const mustache = (thin) => {
    c.beginPath(); c.moveTo(hx - 4, hy + 7.1); c.quadraticCurveTo(hx - 2.2, hy + (thin ? 5.8 : 5.2), hx, hy + (thin ? 6 : 5.5)); c.quadraticCurveTo(hx + 2.2, hy + (thin ? 5.8 : 5.2), hx + 4, hy + 7.1);
    c.quadraticCurveTo(hx + 2, hy + (thin ? 6.6 : 6.9), hx, hy + (thin ? 6.7 : 7)); c.quadraticCurveTo(hx - 2, hy + (thin ? 6.6 : 6.9), hx - 4, hy + 7.1); c.closePath();
    c.fillStyle = lin(c, col, hx, hy + 5, hx, hy + 7.2, 1.15, .8); c.fill();
    c.strokeStyle = dark; c.lineWidth = .35; c.beginPath(); for (let i = -3; i <= 3; i++) { c.moveTo(hx + i * 1.05, hy + 5.9); c.lineTo(hx + i * 1.25, hy + 6.8); } c.stroke();
  };
  if (b === 'rala') { stubble(240, .2, .27, (u, v) => jaw(.1 + u * .8, v * .75)); stubble(55, .22, .25, lip); return; }
  if (b === 'bigode') { stubble(60, .18, .32, (u, v) => jaw(u, v * .5)); mustache(true); return; }
  if (b === 'desenhada') { // barba desenhada: faixa fina e reta na mandíbula + queixo
    c.beginPath();
    for (let i = 0; i <= 20; i++) { const p = jaw(i / 20, 0); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
    for (let i = 20; i >= 0; i--) { const p = jaw(i / 20, .38); c.lineTo(p[0], p[1]); }
    c.closePath(); c.fillStyle = lin(c, col, hx, hy + 2, hx, hy + 13, 1.1, .8); c.fill();
    c.strokeStyle = dark; c.lineWidth = .4; c.stroke();
    mustache(true);
    c.beginPath(); c.moveTo(hx - 1.4, hy + 9.4); c.lineTo(hx + 1.4, hy + 9.4); c.lineTo(hx + .9, hy + 12.5); c.lineTo(hx - .9, hy + 12.5); c.closePath(); c.fillStyle = col; c.fill();
    return;
  }
  if (b === 'cavanhaque') {
    stubble(50, .2, .33, (u, v) => jaw(u, v * .6));
    mustache(false);
    c.beginPath(); c.moveTo(hx - 4, hy + 7.3); c.quadraticCurveTo(hx - 4.3, hy + 10.5, hx - 2, hy + 12.6); c.quadraticCurveTo(hx, hy + 13.6, hx + 2, hy + 12.6); c.quadraticCurveTo(hx + 4.3, hy + 10.5, hx + 4, hy + 7.3);
    c.lineTo(hx + 3, hy + 7.6); c.quadraticCurveTo(hx + 2.6, hy + 10.2, hx, hy + 10.4); c.quadraticCurveTo(hx - 2.6, hy + 10.2, hx - 3, hy + 7.6); c.closePath();
    c.fillStyle = lin(c, col, hx, hy + 7, hx, hy + 13.5, 1.12, .78); c.fill();
    c.strokeStyle = dark; c.lineWidth = .35; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(hx + i * 1.2, hy + 10.6); c.lineTo(hx + i * 1.3, hy + 12.8); } c.stroke();
    return;
  }
  // barba cheia
  c.beginPath();
  for (let i = 0; i <= 24; i++) { const p = jaw(i / 24, 0); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
  c.lineTo(hx + 7.2, hy + 3.2); c.quadraticCurveTo(hx + 5.6, hy + 9.8, hx, hy + 10.2); c.quadraticCurveTo(hx - 5.6, hy + 9.8, hx - 7.2, hy + 3.2); c.closePath();
  c.fillStyle = lin(c, col, hx, hy + 1, hx, hy + 13.6, 1.1, .74); c.fill();
  c.strokeStyle = dark; c.lineWidth = .4; c.beginPath();
  for (let i = 0; i < 26; i++) { const p = jaw(.03 + i / 26 * .94, .15 + rnd() * .5); c.moveTo(p[0], p[1]); c.lineTo(p[0] + (p[0] - hx) * .02, p[1] + 1.4); }
  c.stroke();
  stubble(60, .25, .35, (u, v) => jaw(u, -.12 + v * .15));
  mustache(false);
}

function faceF(c, f, hx, hy, mood, t, lookX, lookY, act, talk = 0) {
  const eL = hx - 4.5, eR = hx + 4.5, ey = hy + .8;
  const bt = t % 3.7, bk = mood === 'festa' ? 0 : bt < .07 ? bt / .07 : bt < .16 ? 1 - (bt - .07) / .09 : 0;
  const blink = bk > .82;
  const style = mood === 'festa' ? 'feliz' : mood === 'triste' ? 'triste' : f.olhos;
  const up = mood === 'festa' || act === 'olha' ? -1 : 0;
  const lidCol = '#2a1b14', skinD = shade(f.pele, .74);
  const lipCol = mix(f.pele, '#b4536a', .42), lipD = shade(lipCol, .72);
  // bochechas coradas (suave) e marcas
  for (const sd of [-1, 1]) { const g = c.createRadialGradient(hx + sd * 7.6, hy + 5.2, .2, hx + sd * 7.6, hy + 5.2, 3.2); g.addColorStop(0, 'rgba(244,114,182,.42)'); g.addColorStop(1, 'rgba(244,114,182,0)'); c.fillStyle = g; c.fillRect(hx + sd * 7.6 - 3.3, hy + 2, 6.6, 6.5); }
  if (f.marca === 'sardas') { c.fillStyle = 'rgba(120,53,15,.5)'; for (const sd of [-1, 1]) for (const [dx, dy] of [[5.8, 3.9], [7.4, 5.2], [9, 4.2], [8.1, 3.1], [6.6, 5.6]]) { c.beginPath(); c.arc(hx + sd * dx, hy + dy, .42, 0, Math.PI * 2); c.fill(); } }
  if (f.marca === 'pinta') { c.fillStyle = '#3f2a1d'; c.beginPath(); c.arc(hx - 6.5, hy + 7, .72, 0, Math.PI * 2); c.fill(); }
  // sombra do queixo / maçã do rosto
  c.fillStyle = 'rgba(0,0,0,.06)'; c.beginPath(); c.ellipse(hx, hy + 10.5, 6, 1.8, 0, 0, Math.PI * 2); c.fill();
  beardF(c, f, hx, hy);
  // olhos
  for (const ex of [eL, eR]) {
    const outer = ex < hx ? -1 : 1;
    if (blink || style === 'feliz') {
      c.strokeStyle = lidCol; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();
      if (blink) { c.moveTo(ex - 2.5, ey + .2); c.quadraticCurveTo(ex, ey + 1.4, ex + 2.5, ey + .2); } else c.arc(ex, ey + 1.3, 2.5, Math.PI * 1.13, Math.PI * 1.87);
      c.stroke();
      c.lineWidth = .8; c.beginPath(); c.moveTo(ex + outer * 2.4, ey + .1 - (blink ? 0 : .5)); c.lineTo(ex + outer * 3.4, ey - .7 - (blink ? 0 : .5)); c.stroke();
      continue;
    }
    c.beginPath(); c.ellipse(ex, ey, 2.9, 3.5, 0, 0, Math.PI * 2);
    const sg = c.createLinearGradient(ex, ey - 3.5, ex, ey + 3.5); sg.addColorStop(0, '#dfe3ea'); sg.addColorStop(.45, '#ffffff'); sg.addColorStop(1, '#f1f3f7');
    c.fillStyle = sg; c.fill();
    c.save(); c.clip();
    const px = ex + lookX * 1.1, py = ey + lookY * 1.1;
    if (style === 'estrela') {
      c.beginPath(); for (let i = 0; i < 10; i++) { const r2 = i % 2 ? .85 : 2.1, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(px + Math.cos(a) * r2, py + Math.sin(a) * r2); } c.closePath(); c.fillStyle = '#f59e0b'; c.fill();
    } else {
      const ic = OLHO[f.olhoCor] || OLHO.castanho;
      const ig = c.createRadialGradient(px, py + .3, .3, px, py, 2.2); ig.addColorStop(0, shade(ic, 1.55)); ig.addColorStop(.55, ic); ig.addColorStop(1, shade(ic, .55));
      c.beginPath(); c.arc(px, py, 2.15, 0, Math.PI * 2); c.fillStyle = ig; c.fill();
      c.strokeStyle = shade(ic, .45); c.lineWidth = .35; c.stroke();
      c.beginPath(); c.arc(px, py, 1, 0, Math.PI * 2); c.fillStyle = '#0b0b10'; c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(px + .8, py - .95, .72, 0, Math.PI * 2); c.fill(); c.globalAlpha = .8; c.beginPath(); c.arc(px - .65, py + .75, .32, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    }
    c.fillStyle = 'rgba(40,20,20,.16)'; c.fillRect(ex - 3, ey - 3.6, 6, 1.6); // sombra da pálpebra
    if (style === 'sono') { c.fillStyle = f.pele; c.fillRect(ex - 3, ey - 3.6, 6, 3.4); }
    if (style === 'bravo' || mood === 'foco') { c.fillStyle = f.pele; c.beginPath(); c.moveTo(ex - 3, ey - 3.6); c.lineTo(ex + 3, ey - 3.6); c.lineTo(ex - outer * 3, ey - 1.1); c.closePath(); c.fill(); }
    if (bk > 0) { c.fillStyle = f.pele; c.fillRect(ex - 3, ey - 3.7, 6, 7.2 * bk); }
    c.restore();
    // pálpebra de cima (traço grosso) + cílio
    c.strokeStyle = lidCol; c.lineCap = 'round'; c.lineWidth = 1.35;
    c.beginPath();
    if (style === 'sono') { c.moveTo(ex - 2.9, ey - .2); c.lineTo(ex + 2.9, ey - .2); }
    else if (style === 'bravo' || mood === 'foco') { c.moveTo(ex - 2.9, ey - (outer < 0 ? 3.2 : 1.4)); c.lineTo(ex + 2.9, ey - (outer < 0 ? 1.4 : 3.2)); }
    else if (bk > .04) { const ly = ey - 3.5 + 7 * bk; c.moveTo(ex - 2.9, ly - .3); c.quadraticCurveTo(ex, ly + .7, ex + 2.9, ly - .3); }
    else c.ellipse(ex, ey, 2.95, 3.55, 0, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    c.lineWidth = .75; c.beginPath(); c.moveTo(ex + outer * 2.6, ey - 1.9); c.lineTo(ex + outer * 3.6, ey - 2.8); c.stroke();
    c.strokeStyle = skinD; c.lineWidth = .5; c.beginPath(); c.ellipse(ex, ey, 2.95, 3.55, 0, Math.PI * .15, Math.PI * .85); c.stroke(); // pálpebra de baixo
  }
  // sobrancelhas com fios
  const brava = mood === 'foco' || f.sobrancelha === 'brava' || style === 'bravo';
  if (f.sobrancelha !== 'nenhuma' || brava) {
    const bc = f.corCabelo === '#f5e6a8' ? '#8a6a2a' : shade(f.corCabelo, .85), th = f.sobrancelha === 'grossa' ? 1.5 : 1;
    for (const sd of [-1, 1]) {
      const ex = hx + sd * 4.5, inner = ex - sd * 2.5, outer = ex + sd * 2.6;
      let yi = ey - 4.9 + up, yo = ey - 5.1 + up, ym = ey - 6.2 + up;
      if (mood === 'triste') { yi = ey - 6; yo = ey - 4.7; ym = ey - 5.6; }
      else if (brava) { yi = ey - 4.3; yo = ey - 6; ym = ey - 5.6; }
      c.beginPath(); c.moveTo(inner, yi + th * .5); c.quadraticCurveTo(ex, ym - th * .5, outer, yo); c.quadraticCurveTo(ex, ym + th * .3, inner, yi - th * .4); c.closePath();
      c.fillStyle = bc; c.fill();
      c.strokeStyle = shade(bc, 1.35); c.lineWidth = .3; c.beginPath(); for (let i = 0; i < 4; i++) { const k = .15 + i * .22, x0 = lerp(inner, outer, k); c.moveTo(x0, lerp(yi, yo, k) - .2); c.lineTo(x0 + sd * .9, lerp(yi, yo, k) - .9); } c.stroke();
    }
    if (f.sobrancelha === 'risco') { c.strokeStyle = f.pele; c.lineWidth = .9; c.beginPath(); c.moveTo(hx + 5.6, ey - 6.9 + up); c.lineTo(hx + 5.1, ey - 3.9 + up); c.stroke(); }
  }
  // nariz com sombra e narinas
  c.fillStyle = 'rgba(0,0,0,.07)'; c.beginPath(); c.ellipse(hx + 1.3, hy + 3, 1.3, 2.6, .15, 0, Math.PI * 2); c.fill();
  c.strokeStyle = shade(f.pele, .6); c.lineWidth = .95; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx - 1.6, hy + 4.4); c.quadraticCurveTo(hx, hy + 5.8, hx + 1.6, hy + 4.4); c.stroke();
  c.fillStyle = shade(f.pele, .5); c.beginPath(); c.ellipse(hx - .9, hy + 4.8, .45, .3, 0, 0, Math.PI * 2); c.ellipse(hx + .9, hy + 4.8, .45, .3, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(hx - .4, hy + 2.6, .5, 1.1, 0, 0, Math.PI * 2); c.fill();
  // boca com lábios
  const mx = hx, my = hy + 8.3;
  const teeth = gold => { c.fillStyle = '#fbfbf8'; c.fillRect(mx - 2.5, my - .55, 5, 1.35); c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = .25; c.beginPath(); for (const dx of [-1.2, 0, 1.2]) { c.moveTo(mx + dx, my - .55); c.lineTo(mx + dx, my + .8); } c.stroke(); if (gold) { const g = c.createLinearGradient(mx + .6, my - .5, mx + 1.9, my + .8); g.addColorStop(0, '#fff3b0'); g.addColorStop(1, '#d97706'); c.fillStyle = g; c.fillRect(mx + .05, my - .55, 1.15, 1.4); } };
  const lowerLip = (w, y) => { c.beginPath(); c.moveTo(mx - w, y); c.quadraticCurveTo(mx, y + 2.1, mx + w, y); c.quadraticCurveTo(mx, y + .9, mx - w, y); c.fillStyle = lipCol; c.fill(); c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(mx - .5, y + .9, .8, .25, 0, 0, Math.PI * 2); c.fill(); };
  c.lineCap = 'round';
  if (mood === 'festa') {
    c.beginPath(); c.moveTo(mx - 3.8, my - .9); c.quadraticCurveTo(mx, my - .2, mx + 3.8, my - .9); c.quadraticCurveTo(mx, my + 5.8, mx - 3.8, my - .9); c.closePath();
    c.fillStyle = '#5b1320'; c.fill(); c.strokeStyle = lipD; c.lineWidth = .9; c.stroke(); teeth(f.boca === 'ouro');
    c.fillStyle = '#f472b6'; c.beginPath(); c.ellipse(mx, my + 3.2, 2, 1.2, 0, 0, Math.PI * 2); c.fill();
  } else if (mood === 'foco') {
    rr(c, mx - 3.1, my - 1.2, 6.2, 2.8, .9); c.fillStyle = '#fbfbf8'; c.fill(); c.strokeStyle = lipD; c.lineWidth = .9; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = .4; c.beginPath(); c.moveTo(mx - 3, my + .2); c.lineTo(mx + 3, my + .2); for (const dx of [-1.6, -.5, .6, 1.7]) { c.moveTo(mx + dx, my - 1.1); c.lineTo(mx + dx, my + 1.5); } c.stroke();
  } else if (mood === 'triste') {
    c.strokeStyle = lipD; c.lineWidth = 1; c.beginPath(); c.arc(mx, my + 2.8, 2.6, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); lowerLip(1.8, my + .7);
  } else if (talk > 0) { // falando
    const m = Math.abs(Math.sin(t * 17)) * .8 + Math.abs(Math.sin(t * 7.3)) * .2;
    c.beginPath(); c.ellipse(mx, my + .3, 2.3 + m * .5, .5 + m * 1.7, 0, 0, Math.PI * 2); c.fillStyle = '#5b1320'; c.fill(); c.strokeStyle = lipD; c.lineWidth = .8; c.stroke();
    if (m > .45) { c.fillStyle = '#fbfbf8'; c.fillRect(mx - 1.7, my + .3 - (.5 + m * 1.7) + .15, 3.4, .75); if (f.boca === 'ouro') { c.fillStyle = '#f59e0b'; c.fillRect(mx + .2, my + .3 - (.5 + m * 1.7) + .15, .9, .75); } }
    c.fillStyle = lipCol; c.beginPath(); c.ellipse(mx, my + 1.4 + m * 1.4, 1.8, .5, 0, 0, Math.PI * 2); c.fill();
  } else if (act === 'olha') {
    c.beginPath(); c.ellipse(mx, my, 1.25, 1.55, 0, 0, Math.PI * 2); c.fillStyle = '#5b1320'; c.fill(); c.strokeStyle = lipCol; c.lineWidth = .9; c.stroke();
  } else if (f.boca === 'ouro') {
    c.beginPath(); c.moveTo(mx - 3.3, my - 1); c.quadraticCurveTo(mx, my - .4, mx + 3.3, my - 1); c.quadraticCurveTo(mx, my + 3.9, mx - 3.3, my - 1); c.closePath();
    c.fillStyle = '#5b1320'; c.fill(); c.strokeStyle = lipD; c.lineWidth = .8; c.stroke(); teeth(true); lowerLip(2.3, my + 1.6);
  } else if (f.boca === 'serio') {
    c.strokeStyle = lipD; c.lineWidth = 1; c.beginPath(); c.moveTo(mx - 2.5, my); c.quadraticCurveTo(mx, my + .3, mx + 2.1, my - .1); c.lineTo(mx + 2.9, my - .8); c.stroke(); lowerLip(1.7, my + .4);
  } else {
    c.strokeStyle = lipD; c.lineWidth = 1; c.beginPath(); c.moveTo(mx - 2.9, my - 1.1); c.quadraticCurveTo(mx, my + 1.8, mx + 2.9, my - 1.1); c.stroke();
    lowerLip(2, my + .9);
    if (f.boca === 'lingua') { c.beginPath(); c.ellipse(mx + 1, my + 1.9, 1.3, 1.7, .25, 0, Math.PI * 2); c.fillStyle = '#f472b6'; c.fill(); c.strokeStyle = '#be185d'; c.lineWidth = .4; c.beginPath(); c.moveTo(mx + 1, my + 1.1); c.lineTo(mx + 1.1, my + 2.6); c.stroke(); }
    c.strokeStyle = skinD; c.lineWidth = .5; c.beginPath(); c.arc(mx - 3.4, my - 1.3, .8, .6, 2); c.arc(mx + 3.4, my - 1.3, .8, 1.1, 2.5); c.stroke(); // covinhas
  }
  if (f.marca === 'curativo') { c.save(); c.translate(hx + 7.8, hy + 4); c.rotate(-.55); rr(c, -3, -1.05, 6, 2.1, .9); fillO(c, '#fcd9b0', .8); c.fillStyle = 'rgba(180,120,80,.6)'; c.fillRect(-.7, -.85, 1.4, 1.7); c.restore(); }
  // óculos
  if (f.oculos !== 'nenhum') {
    const lens = f.oculos === 'neon' ? 'rgba(57,255,20,.8)' : f.oculos === 'redondo' ? 'rgba(186,230,253,.3)' : '#111827';
    if (f.oculos === 'juliete') {
      c.beginPath(); c.moveTo(hx - 9.4, ey - 2.6); c.quadraticCurveTo(hx, ey - 3.9, hx + 9.4, ey - 2.6); c.lineTo(hx + 8.6, ey + 2.4); c.quadraticCurveTo(hx + 4.5, ey + 3.8, hx + 1, ey + 1.6); c.lineTo(hx - 1, ey + 1.6); c.quadraticCurveTo(hx - 4.5, ey + 3.8, hx - 8.6, ey + 2.4); c.closePath();
      const g = c.createLinearGradient(hx - 9, ey - 2, hx + 9, ey + 2); g.addColorStop(0, '#60a5fa'); g.addColorStop(.5, '#a78bfa'); g.addColorStop(1, '#f472b6');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#1e1b4b'; c.lineWidth = 1.1; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.65)'; c.fillRect(hx - 7, ey - 1.8, 3.2, .9); c.fillRect(hx + 3, ey - 1.8, 2.2, .9);
    } else {
      for (const ex of [eL, eR]) { c.beginPath(); if (f.oculos === 'redondo') c.arc(ex, ey, 3.3, 0, Math.PI * 2); else rr(c, ex - 3.4, ey - 2.5, 6.8, 4.8, 1.5); c.fillStyle = lens; c.fill(); ol(c, 1.2); }
      c.beginPath(); c.moveTo(eL + 3.3, ey - .6); c.lineTo(eR - 3.3, ey - .6); ol(c, 1.1);
      if (f.oculos !== 'redondo') { c.fillStyle = 'rgba(255,255,255,.55)'; for (const ex of [eL, eR]) c.fillRect(ex - 2, ey - 1.6, 1.7, .9); }
    }
    c.beginPath(); c.moveTo(hx - 9.4, ey - 1); c.lineTo(hx - 12, ey - 1.6); c.moveTo(hx + 9.4, ey - 1); c.lineTo(hx + 12, ey - 1.6); ol(c, 1);
  }
  if (mood === 'foco') for (let i = 0; i < 2; i++) { const d = (t * 2 + i * .5) % 1; c.fillStyle = 'rgba(125,211,252,.95)'; c.beginPath(); c.ellipse(hx + 9 - i * 16, hy - 8 + d * 7, 1.2, 1.8, 0, 0, Math.PI * 2); c.fill(); }
  if (mood === 'triste') for (const ex of [eL, eR]) { const d = (t * 1.6 + ex) % 1; c.fillStyle = 'rgba(125,211,252,.9)'; c.beginPath(); c.ellipse(ex, ey + 3 + d * 9, 1, 1.5, 0, 0, Math.PI * 2); c.fill(); }
}

function torsoF(c, f, y, t) {
  const x = -8.8, w = 17.6, h = 15.5, hem = Math.sin(t * 2.2) * .35;
  const sh = f.top === 'regata' ? 7.4 : 10;
  const body = () => { c.beginPath();
    c.moveTo(-3.8, y); c.quadraticCurveTo(-sh + 1.5, y - .6, -sh, y + 3.4); c.quadraticCurveTo(-sh + .4, y + 8.5, -8.3, y + h - hem);
    c.quadraticCurveTo(0, y + h + 1.2, 8.3, y + h + hem); c.quadraticCurveTo(sh - .4, y + 8.5, sh, y + 3.4); c.quadraticCurveTo(sh - 1.5, y - .6, 3.8, y);
    c.quadraticCurveTo(0, y + 2, -3.8, y); c.closePath(); };
  if (f.top === 'semcamisa') {
    body(); c.fillStyle = lin(c, f.pele, x, y, x + w, y + h, 1.1, .85); c.fill();
    c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(x + w - 5, y + 2, 4, h - 3);
    c.strokeStyle = shade(f.pele, .72); c.lineWidth = .9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-6.5, y + 5.5); c.quadraticCurveTo(-3.3, y + 8, -.6, y + 6.2); c.moveTo(.6, y + 6.2); c.quadraticCurveTo(3.3, y + 8, 6.5, y + 5.5);
    c.moveTo(0, y + 8); c.lineTo(0, y + 12.5); c.moveTo(-2.5, y + 10); c.lineTo(2.5, y + 10); c.stroke();
    c.beginPath(); c.moveTo(-6.8, y + 1.8); c.quadraticCurveTo(-3.6, y + 3, -1, y + 2); c.moveTo(6.8, y + 1.8); c.quadraticCurveTo(3.6, y + 3, 1, y + 2); c.stroke(); // clavículas
    c.beginPath(); c.arc(0, y + h - 2.4, .6, 0, Math.PI * 2); c.fillStyle = shade(f.pele, .6); c.fill();
    body(); c.strokeStyle = edge(f.pele); c.lineWidth = 1.3; c.stroke();
    return;
  }
  const regata = f.top === 'regata', X = regata ? x + 1.6 : x, WW = regata ? w - 3.2 : w;
  body(); c.save(); c.fillStyle = lin(c, f.cor1, X, y, X + WW, y + h); c.fill(); c.clip();
  c.fillStyle = 'rgba(0,0,0,.13)'; c.fillRect(X + WW - 4.2, y, 5, h + 2);
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(X, y, 3, h + 2);
  const c2 = f.cor2 === f.cor1 ? '#fff' : f.cor2;
  if (f.top === 'listrada') { c.fillStyle = c2; for (let i = 0; i < 4; i++) c.fillRect(X, y + 2 + i * 3.8, WW, 1.8); }
  if (f.kit) drawKit(c, f.kit, X, y, WW, h);
  if (f.top === 'cortavento') { // corta-vento: peito em V de outra cor, ziper e cordinha do capuz
    c.fillStyle = c2; c.beginPath(); c.moveTo(X, y); c.lineTo(X + WW, y); c.lineTo(X + WW, y + 3.4); c.lineTo(0, y + 8); c.lineTo(X, y + 3.4); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = .8; c.beginPath(); c.moveTo(0, y + .5); c.lineTo(0, y + h + 1); c.stroke();
    c.fillStyle = '#e5e7eb'; c.fillRect(-.9, y + 2, 1.8, 2.2);
  }
  if (f.top === 'time') {
    c.fillStyle = c2; c.fillRect(X, y, 2.6, h + 2); c.fillRect(X + WW - 2.6, y, 2.6, h + 2);
    c.beginPath(); c.moveTo(-3.4, y); c.lineTo(0, y + 4); c.lineTo(3.4, y); c.closePath(); c.fill();
    if (!(f.kit && drawEscudo(c, f.kit.escudo, 4.9, y + 6.6, 2.5))) {
      c.beginPath(); c.moveTo(3.2, y + 4.5); c.lineTo(6.6, y + 4.5); c.lineTo(6.6, y + 7.5); c.quadraticCurveTo(4.9, y + 9.6, 3.2, y + 7.5); c.closePath(); c.fill(); // escudo
      c.fillStyle = f.cor1; c.beginPath(); c.arc(4.9, y + 6.4, .8, 0, Math.PI * 2); c.fill();
    }
    if (!(f.kit && drawFornecedor(c, f.kit.fornecedor, -4.7, y + 5.8, 1.5, c2))) { c.fillStyle = c2; c.globalAlpha = .9; c.fillRect(-6.4, y + 5, 3.4, 1.2); c.globalAlpha = 1; } // marca do fornecedor
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = .5; c.setLineDash([.8, .8]); c.beginPath(); c.moveTo(X + 2.8, y + 1); c.lineTo(X + 2.8, y + h); c.moveTo(X + WW - 2.8, y + 1); c.lineTo(X + WW - 2.8, y + h); c.stroke(); c.setLineDash([]);
  }
  if (f.top === 'regata') {
    c.fillStyle = c2; c.beginPath(); c.moveTo(-3.6, y); c.quadraticCurveTo(0, y + 4.5, 3.6, y); c.lineTo(3, y); c.quadraticCurveTo(0, y + 3.3, -3, y); c.closePath(); c.fill();
    c.fillRect(X, y + 1, 1.4, 6); c.fillRect(X + WW - 1.4, y + 1, 1.4, 6);
    c.font = '900 5.6px Nunito, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(f.num || '10', 0, y + 8.6);
  }
  if (f.top === 'moletom') {
    c.fillStyle = shade(f.cor1, .78); rr(c, -5.4, y + h - 6.8, 10.8, 5.6, 2.2); c.fill();
    c.strokeStyle = shade(f.cor1, .6); c.lineWidth = .7; c.beginPath(); c.moveTo(-5.4, y + h - 6.8); c.lineTo(5.4, y + h - 6.8); c.stroke();
    const sw = Math.sin(t * 3) * .7;
    c.strokeStyle = '#f8fafc'; c.lineWidth = .9; c.beginPath(); c.moveTo(-1.8, y + 1); c.lineTo(-2.2 + sw, y + 7); c.moveTo(1.8, y + 1); c.lineTo(2.2 + sw, y + 7); c.stroke();
    c.fillStyle = '#cbd5e1'; c.fillRect(-2.7 + sw, y + 7, 1, 1.6); c.fillRect(1.7 + sw, y + 7, 1, 1.6);
  }
  if (f.top === 'lisa') {
    c.strokeStyle = shade(f.cor1, .7); c.lineWidth = 1.1; c.beginPath(); c.arc(0, y - 1.5, 4, .25, Math.PI - .25); c.stroke();
    c.fillStyle = c2; c.beginPath(); for (let i = 0; i < 10; i++) { const r2 = i % 2 ? 1.2 : 2.8, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(a) * r2, y + 8 + Math.sin(a) * r2); } c.closePath(); c.fill();
  }
  c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = .8; c.beginPath(); c.moveTo(-5, y + h - 2.5); c.quadraticCurveTo(-3, y + h - 4.2, -1, y + h - 2.4); c.moveTo(2, y + h - 3); c.quadraticCurveTo(4, y + h - 4.6, 5.6, y + h - 2.6); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = .6; c.beginPath(); c.moveTo(-sh + 1.4, y + 4.5); c.quadraticCurveTo(-sh + 3.2, y + 6.4, -sh + 2.4, y + 8.6); c.moveTo(sh - 1.4, y + 4.5); c.quadraticCurveTo(sh - 3.2, y + 6.4, sh - 2.4, y + 8.6); c.stroke(); // dobras da axila
  if (f.top !== 'regata') { c.strokeStyle = shade(f.cor1, .66); c.lineWidth = 1.3; c.beginPath(); c.moveTo(-3.8, y); c.quadraticCurveTo(0, y + 2, 3.8, y); c.stroke(); } // gola canelada
  c.restore();
  body(); c.strokeStyle = edge(f.cor1); c.lineWidth = 1.3; c.stroke();
}

function shortsF(c, f, hipY) {
  const long = f.bermuda === 'tactel' || f.bermuda === 'estampada', bL = long ? 10.5 : 8.5, x = -8.4, w = 16.8, y = hipY - 6;
  const shape = () => { c.beginPath(); c.moveTo(x + 2, y); c.lineTo(x + w - 2, y); c.quadraticCurveTo(x + w, y, x + w + .3, y + 2); c.lineTo(x + w + .6, y + bL); c.lineTo(.8, y + bL); c.lineTo(.4, y + 4.5); c.lineTo(-.4, y + 4.5); c.lineTo(-.8, y + bL); c.lineTo(x - .6, y + bL); c.lineTo(x - .3, y + 2); c.quadraticCurveTo(x, y, x + 2, y); c.closePath(); };
  shape(); c.save(); c.fillStyle = lin(c, f.short, x, y, x + w, y + bL); c.fill(); c.clip();
  const c2 = f.cor2 === f.short ? '#fff' : f.cor2;
  if (f.bermuda === 'tactel') { for (const sd of [-1, 1]) { c.fillStyle = c2; c.fillRect(sd < 0 ? x : x + w - 3, y, 1.8, bL); c.fillStyle = '#fff'; c.fillRect(sd < 0 ? x + 1.9 : x + w - 1.1, y, .9, bL); } c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x, y + bL - 1.4, w, .8); }
  else if (f.bermuda === 'estampada') { const cs = [c2, '#fde047', '#fff']; for (let i = 0; i < 12; i++) { const px = x + 2 + (i % 4) * 4.2 + (Math.floor(i / 4) % 2) * 2, py = y + 2.5 + Math.floor(i / 4) * 3.2; c.fillStyle = cs[i % 3]; c.beginPath(); c.arc(px, py, 1, 0, Math.PI * 2); c.arc(px + 1.1, py + .8, .7, 0, Math.PI * 2); c.fill(); } }
  else { c.fillStyle = c2; c.fillRect(x, y, 1.2, bL); c.fillRect(x + w - 1.2, y, 1.2, bL); }
  c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x - 1, y, w + 2, 1.7);
  c.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 14; i++) c.fillRect(x + .5 + i * 1.2, y + .2, .35, 1.3); // elástico
  c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = .6; c.beginPath(); c.moveTo(x + .6, y + 2.2); c.quadraticCurveTo(x + 3.6, y + 2.8, x + 3.8, y + 6); c.moveTo(x + w - .6, y + 2.2); c.quadraticCurveTo(x + w - 3.6, y + 2.8, x + w - 3.8, y + 6); c.stroke(); // bolsos
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x + 2, y + 2, 2.4, bL - 3);
  c.restore();
  shape(); c.strokeStyle = edge(f.short); c.lineWidth = 1.3; c.stroke();
  c.strokeStyle = '#f8fafc'; c.lineWidth = .8; c.lineCap = 'round'; c.beginPath(); c.moveTo(-.8, y + 1.2); c.lineTo(-1.6, y + 4); c.moveTo(.8, y + 1.2); c.lineTo(1.4, y + 4); c.stroke(); // cordão
}

function shoeF(c, f, fx, fy, sd) {
  const col = f.corCalcado;
  if (f.calcado === 'meiachinelo') {
    rr(c, fx - 2.4, fy - 9, 4.8, 8.4, 1.6); fillO(c, '#f8fafc', 1.1);
    c.strokeStyle = '#cbd5e1'; c.lineWidth = .7; c.beginPath(); c.moveTo(fx - 2, fy - 7.8); c.lineTo(fx + 2, fy - 7.8); c.moveTo(fx - 2, fy - 6.9); c.lineTo(fx + 2, fy - 6.9); c.stroke();
    c.beginPath(); c.ellipse(fx + sd * .5, fy - .2, 4, 1.3, 0, 0, Math.PI * 2); fillO(c, shade(col, .85), 1);
    rr(c, fx - 3.2, fy - 2.8, 6.4, 2.2, 1); fillO(c, col, 1);
    return;
  }
  if (f.calcado === 'chinelo') {
    c.beginPath(); c.ellipse(fx + sd * .5, fy - .2, 3.9, 1.3, 0, 0, Math.PI * 2); fillO(c, col, 1);
    c.strokeStyle = shade(col, .55); c.lineWidth = 1.2; c.beginPath(); c.moveTo(fx - 2.4, fy - .8); c.lineTo(fx, fy - 2.6); c.lineTo(fx + 2.4, fy - .8); c.stroke();
    return;
  }
  if (f.calcado === 'bota') { rr(c, fx - 3.4, fy - 7, 6.8, 7.4, 2); fillO(c, col, 1.3); rr(c, fx - 3.8, fy - 1, 7.6, 1.8, .8); fillO(c, shade(col, .55), 1); return; }
  const lift = f.calcado === 'mola' ? 1.9 : 0, L0 = fy - lift;
  rr(c, fx - 2.3, L0 - 8.4, 4.6, 3, .9); c.fillStyle = '#f8fafc'; c.fill(); c.strokeStyle = '#cbd5e1'; c.lineWidth = .5; c.stroke(); // meia
  c.beginPath(); c.moveTo(fx - 3.7, L0 - 1.3); c.quadraticCurveTo(fx - 4.1, L0 - 5.6, fx - 1.6, L0 - 6); c.lineTo(fx + 1.6, L0 - 6); c.quadraticCurveTo(fx + 4.1, L0 - 5.6, fx + 3.9, L0 - 1.3); c.closePath();
  fillG(c, col, fx - 4, L0 - 6.2, fx + 4, L0, 1.2, 1.2, .78);
  rr(c, fx - 1.45, L0 - 7.3, 2.9, 2.8, .9); fillO(c, shade(col, 1.1), .8); // língua
  c.strokeStyle = col === '#f8fafc' ? '#94a3b8' : '#fff'; c.lineWidth = .55; c.beginPath();
  for (let i = 0; i < 2; i++) { const yy = L0 - 5.2 + i * 1.35; c.moveTo(fx - 1.5, yy); c.lineTo(fx + 1.5, yy + 1); c.moveTo(fx + 1.5, yy); c.lineTo(fx - 1.5, yy + 1); }
  c.stroke(); // cadarço cruzado
  c.fillStyle = col === '#111827' ? '#ef4444' : '#111827'; c.beginPath(); c.moveTo(fx + sd * 3.7, L0 - 3.2); c.quadraticCurveTo(fx + sd * 1.2, L0 - 1.6, fx - sd * 2.6, L0 - 2.3); c.lineTo(fx - sd * 1, L0 - 1.5); c.closePath(); c.fill(); // listra
  rr(c, fx - 4.2, L0 - 1.8, 8.4, 2, 1); fillO(c, '#f8fafc', .8); // entressola
  if (lift) { c.strokeStyle = '#94a3b8'; c.lineWidth = 1; c.beginPath(); for (const sx of [fx - 2.4, fx + 1.4]) { c.moveTo(sx, fy - 1.9); c.lineTo(sx + 1.1, fy - 1.3); c.lineTo(sx - .3, fy - .7); c.lineTo(sx + 1.1, fy - .1); } c.stroke(); }
  rr(c, fx - 4.2, fy - .2, 8.4, 1, .45); c.fillStyle = '#374151'; c.fill(); // solado
}

function legF(c, f, hx, hy, fx, fy, sd) {
  const [kx, ky, ax, ay] = ik(hx, hy, fx, fy - 3, 5, 5, e => e[0] * sd);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(hx, hy); c.lineTo(kx, ky); c.lineTo(ax, ay); c.strokeStyle = edge(f.pele); c.lineWidth = 6.4; c.stroke(); c.strokeStyle = f.pele; c.lineWidth = 4.7; c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx + 1.2 * sd, hy + 1); c.lineTo(kx + 1.2 * sd, ky); c.stroke();
  shoeF(c, f, ax, ay + 3, sd);
}

function chainF(c, f, y, t, swing = 0) {
  const sw = Math.sin(t * 3) * .6 + swing;
  if (f.corrente === 'grossa') {
    for (let i = 0; i <= 10; i++) { const k = i / 10, px = lerp(-5, 5, k) + sw * Math.sin(k * Math.PI), py = y - 2.6 + Math.sin(k * Math.PI) * 7.4; c.beginPath(); c.ellipse(px, py, 1.3, 1, i % 2 ? .7 : -.7, 0, Math.PI * 2); c.fillStyle = metal(c, px, py, 1.3, true); c.fill(); c.strokeStyle = '#92400e'; c.lineWidth = .5; c.stroke(); }
    const cx = sw * 1.2, cy = y + 7.4; // pingente de coroa
    c.beginPath(); c.moveTo(cx - 2.6, cy + 1.6); c.lineTo(cx - 2.6, cy - 1.4); c.lineTo(cx - 1.2, cy); c.lineTo(cx, cy - 2); c.lineTo(cx + 1.2, cy); c.lineTo(cx + 2.6, cy - 1.4); c.lineTo(cx + 2.6, cy + 1.6); c.closePath(); fillO(c, '#fde047', .9);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(cx - 1, cy + .4, .5, 0, Math.PI * 2); c.fill();
  } else if (f.corrente !== 'nenhuma') {
    const cc = f.corrente === 'ouro' ? '#facc15' : '#e2e8f0';
    c.strokeStyle = OUT; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-4.4, y - 2.4); c.quadraticCurveTo(sw, y + 6.4, 4.4, y - 2.4); c.stroke();
    c.strokeStyle = cc; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(sw * 1.1, y + 3.8, 1.8, 0, Math.PI * 2); fillO(c, cc, 1);
  }
}

function drawFront(c, cx, feet, f, s, o) {
  const pose = o.pose || 'pipa', t = o.t || 0, td = o.td || 0, pull = o.pull || 0, beat = o.beat || 0;
  const act = pose === 'pipa' ? (o.act || '') : '', at = o.at || 0;
  const mood = pose === 'festa' ? 'festa' : pose === 'triste' ? 'triste' : o.foco ? 'foco' : 'normal';
  let jump = 0, rot = 0, sway = 0, kneel = 0, headDx = 0, headDy = 0, headRot = 0, sqx = 1, sqy = 1, hip = 0;
  let fL = [-4.8, 0], fR = [4.8, 0], aR = [15.5, -47], aL = [-13, -17], reel = true;
  let lookX = o.look ? o.look[0] : 0, lookY = o.look ? o.look[1] : 0;
  const bob = Math.sin(t * 2.4) * .5 + (pose === 'pipa' ? beat * 1.4 : 0);
  let handL = 'punho', handR = 'punho', bicep = 0;
  if (pose === 'pipa') {
    const ws = Math.sin(t * .9); // troca o peso de perna
    hip = ws * 1.1 + Math.sin(t * 1.3) * .3; sway = ws * .45; fL = [-4.8 + ws * .5, 0]; fR = [4.8 + ws * .5, 0];
    aR = [15.5 + Math.sin(t * 26) * pull * 1.8, -47 + Math.cos(t * 26) * pull * 1.4];
    if (act !== 'olha') { // olhadinhas rápidas pros lados
      const n = Math.floor(t / 1.35), r1 = (Math.sin(n * 91.7) * 43758.5) % 1, r2 = (Math.sin(n * 47.3) * 12345.6) % 1;
      lookX += Math.abs(r1) * .7 - .35; lookY += Math.abs(r2) * .44 - .22;
    }
    if (act) {
      const k = Math.sin(Math.min(at / 1.2, 1) * Math.PI);
      if (act === 'acena') { aL = [lerp(-13, -17, k), lerp(-17, -54, k) + Math.sin(at * 16) * 2.2 * k]; reel = k < .15; lookX = lerp(lookX, 0, k); lookY = lerp(lookY, 0, k); }
      else if (act === 'bone') { aL = [lerp(-13, -6, k), lerp(-17, -55, k)]; reel = k < .15; }
      else if (act === 'suor') { aL = [lerp(-13, -3, k), lerp(-17, -50, k)]; reel = k < .15; }
      else if (act === 'olha') { lookX = lerp(lookX, -1, k); lookY = lerp(lookY, -.3, k); headDx = -1.4 * k; headRot = -.06 * k; }
      else if (act === 'pulo') { jump = Math.max(0, Math.sin(Math.min(at / .45, 1) * Math.PI)) * 5; if (at > .42 && at < .55) { sqx = 1.07; sqy = .93; } }
      else if (act === 'joinha') { aL = [lerp(-13, -12, k), lerp(-17, -33, k)]; reel = k < .15; if (k > .3) handL = 'joinha'; lookX = lerp(lookX, 0, k); lookY = lerp(lookY, 0, k); }
      else if (act === 'muque') { aL = [lerp(-13, -11, k), lerp(-17, -43, k)]; reel = k < .15; bicep = k; headRot = .06 * k; lookX = lerp(lookX, -.6, k); }
      else if (act === 'aponta') { aL = [lerp(-13, -18, k), lerp(-17, -32, k)]; reel = k < .15; if (k > .3) handL = 'aponta'; lookX = lerp(lookX, 0, k); lookY = lerp(lookY, 0, k); }
      if (act === 'acena' && k > .25) handL = 'aberta';
    }
  } else if (pose === 'lanca') {
    const k = ease(td / .7); aR = [lerp(9, 16, k), lerp(-13, -53, k)]; jump = Math.sin(Math.min(td / .7, 1) * Math.PI) * 2; lookY = -1;
  } else if (pose === 'festa') {
    const d = f.danca, amp = ease(td / .2); reel = false;
    let tR = aR, tL = aL;
    if (d === 'passinho') { const ph = td * 10, sn = Math.sin(ph); sway = sn * 3; hip = sn * 1.5; fL = [-4.8 + sn * 2.5, sn > 0 ? -3 : 0]; fR = [4.8 + sn * 2.5, sn < 0 ? -3 : 0]; tR = [12 + sn * 4, -26 - Math.cos(ph) * 5]; tL = [-12 + sn * 4, -26 + Math.cos(ph) * 5]; headDy = Math.abs(sn) * -1.5; }
    else if (d === 'romano') { const ph = td * 9, sn = Math.sin(ph); handL = handR = 'aberta'; sway = sn * 2; jump = Math.abs(sn) * 2.4; fL = [sn > 0 ? 1 : -4.8, sn > 0 ? -3.5 : 0]; fR = [sn > 0 ? 4.8 : -1, sn > 0 ? 0 : -3.5]; tR = [18, -31 + sn * 7]; tL = [-18, -31 - sn * 7]; headDx = sn * .8; }
    else if (d === 'tremidinha') { const sh = Math.sin(td * 42); kneel = 2.4; sway = sh * 1.1; hip = sh * 1.2; tR = [7 + sh, -25]; tL = [-7 - sh, -25]; fL = [-6, 0]; fR = [6, 0]; headDy = Math.abs(sh) * .8; }
    else if (d === 'pulinho') { jump = Math.abs(Math.sin(td * 8)) * 8; tR = [10, -56]; tL = [-10, -56]; handL = handR = 'aberta'; if (jump < 1.2) { sqx = 1.08; sqy = .92; } }
    else if (d === 'dab') { const k = ease(td / .25); tR = [lerp(12, 19, k), lerp(-30, -53, k)]; tL = [lerp(-12, -2, k), lerp(-26, -46, k)]; headDx = -2.5 * k; headDy = 2.5 * k; headRot = -.25 * k; }
    else if (d === 'mortal') { const k = Math.min(td / .85, 1); jump = Math.sin(k * Math.PI) * 20; rot = -ease(k) * Math.PI * 2; tR = [10, -55]; tL = [-10, -55]; if (k > .95 && td < 1.05) { sqx = 1.1; sqy = .9; } }
    else { const sn = Math.sin(td * 9); hip = sn * 3; sway = sn * 1.4; rot = sn * .05; tR = [9, -19]; tL = [-9, -19]; }
    aR = [lerp(15.5, tR[0], amp), lerp(-47, tR[1], amp)]; aL = [lerp(-13, tL[0], amp), lerp(-17, tL[1], amp)];
    jump *= amp; sway *= amp; rot *= amp; hip *= amp;
  } else { // triste
    const k = ease(td / .4); kneel = 5 * k; headDy = 2.5 + k; headDx = Math.sin(t * 22) * .4 * k;
    aR = [lerp(15.5, 3.4, k), lerp(-47, -41, k)]; aL = [lerp(-13, -3.4, k), lerp(-17, -41, k)]; fL = [-6.5, 0]; fR = [6.5, 0]; reel = false;
  }
  c.save();
  c.translate(cx, feet); c.scale(s, s);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0, 0, Math.max(6, 14 - jump * .35), 3.2, 0, 0, Math.PI * 2); c.fill();
  c.translate(sway, -jump);
  if (sqx !== 1) c.scale(sqx, sqy);
  if (rot) { c.translate(0, -24); c.rotate(rot); c.translate(0, 24); }
  const hipY = -12.5 + kneel, shY = -27 + bob * .6 + kneel;
  const hxC = headDx, hyC = -43 + bob + headDy, R = 12.5;
  hairBackF(c, f, hxC, hyC, R, t);
  // pernas
  legF(c, f, -3.7 + hip * .3, hipY, fL[0], fL[1], -1);
  legF(c, f, 3.7 + hip * .3, hipY, fR[0], fR[1], 1);
  c.save(); c.translate(hip * .5, 0); shortsF(c, f, hipY); c.restore();
  // pescoço
  rr(c, hxC * .6 - 2.9, hyC + 7, 5.8, shY - hyC - 8, 2.2); c.fillStyle = lin(c, f.pele, -3, hyC + 7, 3, shY, 1, .82); c.fill(); c.strokeStyle = edge(f.pele); c.lineWidth = .9; c.stroke();
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(hxC * .6 - 2.9, hyC + 7, 5.8, 3);
  torsoF(c, f, shY - 3, t);
  c.fillStyle = 'rgba(0,0,0,.16)'; c.beginPath(); c.ellipse(headDx, shY - 1.2, 7.5, 2.8, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(0,0,0,.14)'; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * 3.9 + hip * .3, hipY + (f.bermuda === 'lisa' ? 3 : 5), 2.8, 1.2, 0, 0, Math.PI * 2); c.fill(); }
  chainF(c, f, shY, t, sway * .35 + hip * .2);
  // cabeça
  c.save(); if (headRot) { c.translate(hxC, hyC + 8); c.rotate(headRot); c.translate(-hxC, -hyC - 8); }
  for (const sd of [-1, 1]) {
    c.beginPath(); c.arc(hxC + sd * 12.4, hyC + 1.2, 3.1, 0, Math.PI * 2); fillO(c, f.pele, 1.4);
    c.strokeStyle = shade(f.pele, .72); c.lineWidth = .8; c.beginPath(); c.arc(hxC + sd * 12.4, hyC + 1.2, 1.4, sd > 0 ? -1.4 : 1.7, sd > 0 ? 1.4 : 4.6); c.stroke();
    if (f.brinco === 'argola') { c.beginPath(); c.arc(hxC + sd * 12.6, hyC + 5, 1.6, 0, Math.PI * 2); c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke(); c.strokeStyle = '#fbbf24'; c.lineWidth = .8; c.stroke(); }
    if (f.brinco === 'brilhante') { const gl = .6 + Math.sin(t * 5 + sd) * .4; c.fillStyle = '#e0f2fe'; c.beginPath(); c.arc(hxC + sd * 12.6, hyC + 3.6, 1.1, 0, Math.PI * 2); c.fill(); c.strokeStyle = `rgba(255,255,255,${gl})`; c.lineWidth = .6; c.beginPath(); c.moveTo(hxC + sd * 12.6 - 2, hyC + 3.6); c.lineTo(hxC + sd * 12.6 + 2, hyC + 3.6); c.moveTo(hxC + sd * 12.6, hyC + 1.6); c.lineTo(hxC + sd * 12.6, hyC + 5.6); c.stroke(); }
  }
  skinHead(c, f, hxC, hyC, R);
  c.fillStyle = 'rgba(0,0,0,.07)'; c.beginPath(); c.arc(hxC, hyC + 3, R - 1.4, .15 * Math.PI, .85 * Math.PI); c.fill();
  c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.ellipse(hxC - 4, hyC - 5.5, 5, 3, -.3, 0, Math.PI * 2); c.fill();
  faceF(c, f, hxC, hyC, mood, t, lookX, lookY, act, o.talk || 0);
  hairFrontF(c, f, hxC, hyC, R, t);
  if (f.fone === 'fone') {
    c.strokeStyle = OUT; c.lineWidth = 3.4; c.beginPath(); c.arc(hxC, hyC - 1, R + 2, Math.PI * 1.02, Math.PI * 1.98); c.stroke();
    c.strokeStyle = '#334155'; c.lineWidth = 2; c.stroke();
    for (const sd of [-1, 1]) { rr(c, hxC + sd * 13 - 2.8, hyC - 3.4, 5.6, 8.4, 2.3); fillO(c, f.cor1, 1.3); }
  }
  c.restore();
  // braços (por cima do corpo)
  const armCol = f.top === 'moletom' ? f.cor1 : f.pele, noSleeve = f.top === 'regata' || f.top === 'moletom' || f.top === 'semcamisa';
  const cuff = f.top === 'moletom' ? shade(f.cor1, .75) : null;
  const L2 = arm(c, -8.4, shY + 1.4, aL[0], aL[1], e => e[1] - e[0] * .35, armCol, noSleeve ? null : f.cor1, cuff, 8.6);
  if (f.relogio && f.relogio !== 'nenhum') { const wx = lerp(L2.hx, L2.ex, .3), wy = lerp(L2.hy, L2.ey, .3); c.beginPath(); c.arc(wx, wy, 2.3, 0, Math.PI * 2); fillO(c, f.relogio === 'dourado' ? '#fbbf24' : '#111827', 1); c.fillStyle = f.relogio === 'dourado' ? '#fff7cc' : '#64748b'; c.beginPath(); c.arc(wx, wy, 1.05, 0, Math.PI * 2); c.fill(); }
  if (bicep > .2) { const bx2 = lerp(-8.4, L2.ex, .55), by2 = lerp(shY + 1.4, L2.ey, .55) - 1.2 * bicep; c.beginPath(); c.ellipse(bx2, by2, 2.7 * bicep, 2.1 * bicep, -.5, 0, Math.PI * 2); c.fillStyle = armCol; c.fill(); c.strokeStyle = edge(armCol); c.lineWidth = .8; c.stroke(); }
  handF(c, L2.hx, L2.hy, Math.atan2(L2.hy - L2.ey, L2.hx - L2.ex), f.pele, handL, true);
  if (reel && (pose === 'pipa' || pose === 'lanca')) drawReel(c, L2.hx, L2.hy + 2, f.carretel, f.cor1, o.reel || 0);
  const R2 = arm(c, 8.4, shY + 1.4, aR[0], aR[1], e => e[0] + e[1] * .45, armCol, noSleeve ? null : f.cor1, cuff, 9.6);
  handF(c, R2.hx, R2.hy, Math.atan2(R2.hy - R2.ey, R2.hx - R2.ex), f.pele, handR, false);
  if (pose === 'pipa' && pull > .55) { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.2; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = t * 18 + i * 2.1; c.beginPath(); c.arc(R2.hx, R2.hy, 6 + i * 1.6, a, a + .7); c.stroke(); } }
  c.restore();
  return { x: cx + (sway + R2.hx) * s * sqx, y: feet + (R2.hy - jump) * s * sqy };
}

/* laje de destaque do lobby (palco do seu bonequinho) */
export function drawPlatform(c, cx, y, w, s, night, t = 0) {
  const h = 16 * s, d = 40 * s, L = cx - w / 2, Rr = cx + w / 2;
  c.save();
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(cx, y + d + 6 * s, w * .55, 8 * s, 0, 0, Math.PI * 2); c.fill();
  // fachada: tijolo aparente em cima, reboco embaixo
  const fx = L + 6 * s, fw = w - 12 * s, fy = y + h * .5;
  rr(c, fx, fy, fw, d, 3 * s);
  const g = c.createLinearGradient(0, fy, 0, fy + d); g.addColorStop(0, night ? '#475569' : '#d09a6c'); g.addColorStop(1, night ? '#1e293b' : '#9a6a47');
  c.fillStyle = g; c.fill();
  c.save(); rr(c, fx, fy, fw, d, 3 * s); c.clip();
  const bh = 4.4 * s, bw = 11 * s, top = fy + d * .42;
  c.fillStyle = night ? '#3b2218' : '#b5532f'; c.fillRect(fx, fy, fw, top - fy);
  c.fillStyle = night ? 'rgba(0,0,0,.35)' : 'rgba(255,225,190,.5)';
  for (let yy = fy, row = 0; yy < top; yy += bh, row++) { c.fillRect(fx, yy, fw, .8 * s); for (let xx = fx - (row % 2) * bw / 2; xx < fx + fw; xx += bw) c.fillRect(xx, yy, .8 * s, bh); }
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.moveTo(fx, top); for (let xx = fx; xx <= fx + fw; xx += 6 * s) c.lineTo(xx, top + Math.sin(xx * .3) * 1.4 * s); c.lineTo(fx + fw, top + 3 * s); c.lineTo(fx, top + 3 * s); c.fill(); // borda do reboco
  c.restore();
  rr(c, fx, fy, fw, d, 3 * s); c.strokeStyle = 'rgba(27,20,51,.8)'; c.lineWidth = 2 * s; c.stroke();
  for (let i = 0; i < 3; i++) { // janelas com cortina
    const wx = fx + 14 * s + i * (fw - 40 * s) / 2, wy = fy + d * .5, ww = 12 * s, wh = 14 * s;
    rr(c, wx - 1.5 * s, wy - 1.5 * s, ww + 3 * s, wh + 3 * s, 2 * s); c.fillStyle = night ? '#64748b' : '#e2e8f0'; c.fill();
    rr(c, wx, wy, ww, wh, 1.5 * s); c.fillStyle = night ? 'rgba(253,224,71,.85)' : 'rgba(30,41,59,.8)'; c.fill();
    c.fillStyle = ['#ef4444', '#3b82f6', '#22c55e'][i]; c.globalAlpha = .75; c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + ww * .45, wy); c.quadraticCurveTo(wx + ww * .2, wy + wh * .5, wx + ww * .35, wy + wh); c.lineTo(wx, wy + wh); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = 'rgba(27,20,51,.7)'; c.lineWidth = 1.2 * s; c.strokeRect(wx, wy, ww, wh);
  }
  // topo da laje (concreto) com rachadura
  rr(c, L, y - h * .2, w, h, 5 * s);
  const tg = c.createLinearGradient(0, y - h * .2, 0, y + h * .8); tg.addColorStop(0, night ? '#a3b1c6' : '#efe2c4'); tg.addColorStop(1, night ? '#64748b' : '#c4a676');
  c.fillStyle = tg; c.fill(); c.strokeStyle = 'rgba(27,20,51,.85)'; c.lineWidth = 2 * s; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(L + 6 * s, y - h * .2 + 2 * s, w - 12 * s, 1.6 * s);
  c.strokeStyle = 'rgba(80,60,40,.35)'; c.lineWidth = .9 * s; c.beginPath(); c.moveTo(cx + w * .18, y + h * .2); c.lineTo(cx + w * .22, y + h * .45); c.lineTo(cx + w * .2, y + h * .7); c.stroke();
  // vergalhões nos cantos
  c.strokeStyle = '#7c3f1d'; c.lineWidth = 1.4 * s; c.lineCap = 'round';
  for (const [bx, dir] of [[L + 5 * s, -1], [Rr - 5 * s, 1]]) for (let i = 0; i < 3; i++) { const x0 = bx + dir * i * 2.6 * s; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + dir * 1.5 * s, y - (10 + i * 3) * s); c.stroke(); }
  // caixa d'água com frisos
  const tx = L + 12 * s, tw = 26 * s, th = 21 * s;
  rr(c, tx, y - th, tw, th, 3.5 * s); const wg = c.createLinearGradient(tx, 0, tx + tw, 0); wg.addColorStop(0, '#1d4ed8'); wg.addColorStop(.4, '#3b82f6'); wg.addColorStop(1, '#1e3a8a');
  c.fillStyle = wg; c.fill(); c.strokeStyle = 'rgba(27,20,51,.85)'; c.lineWidth = 1.8 * s; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1 * s; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(tx + 2 * s, y - th + i * th / 4); c.lineTo(tx + tw - 2 * s, y - th + i * th / 4); c.stroke(); }
  c.beginPath(); c.ellipse(tx + tw / 2, y - th, tw / 2, 4.2 * s, 0, 0, Math.PI * 2); c.fillStyle = '#60a5fa'; c.fill(); c.strokeStyle = 'rgba(27,20,51,.85)'; c.lineWidth = 1.6 * s; c.stroke();
  // antena
  const ax = Rr - 16 * s;
  c.strokeStyle = 'rgba(27,20,51,.9)'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(ax, y); c.lineTo(ax, y - 36 * s); c.moveTo(ax - 10 * s, y - 28 * s); c.lineTo(ax + 10 * s, y - 28 * s); c.moveTo(ax - 7 * s, y - 20 * s); c.lineTo(ax + 7 * s, y - 20 * s); c.stroke();
  // vaso com planta
  const px = Rr - 34 * s;
  c.fillStyle = '#9a3412'; c.beginPath(); c.moveTo(px - 4 * s, y - 7 * s); c.lineTo(px + 4 * s, y - 7 * s); c.lineTo(px + 3 * s, y); c.lineTo(px - 3 * s, y); c.closePath(); c.fill(); c.strokeStyle = 'rgba(27,20,51,.8)'; c.lineWidth = 1.2 * s; c.stroke();
  c.fillStyle = night ? '#166534' : '#16a34a'; for (const [dx, dy, r] of [[-2.5, -10, 3.4], [2.5, -11, 3.2], [0, -14, 3.6], [-4.5, -13, 2.4], [4.2, -14.5, 2.2]]) { c.beginPath(); c.arc(px + dx * s, y + dy * s, r * s, 0, Math.PI * 2); c.fill(); }
  // varal de lâmpadas (pisca-pisca) da caixa d'água até a antena
  const x1 = tx + tw / 2, y1 = y - th - 3 * s, x2 = ax, y2 = y - 34 * s, sag = 16 * s;
  c.strokeStyle = 'rgba(27,20,51,.8)'; c.lineWidth = 1 * s; c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2); c.stroke();
  const cols = ['#fde047', '#f472b6', '#4ade80', '#60a5fa', '#fb923c'];
  for (let i = 1; i < 10; i++) {
    const k = i / 10, u = 1 - k, bx = u * u * x1 + 2 * u * k * (x1 + x2) / 2 + k * k * x2, by = u * u * y1 + 2 * u * k * (Math.max(y1, y2) + sag) + k * k * y2;
    const on = .55 + .45 * Math.sin(t * 3 + i * 1.7), col = cols[i % cols.length];
    const gl = c.createRadialGradient(bx, by + 2 * s, 0, bx, by + 2 * s, 6 * s); gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = (night ? .9 : .45) * on; c.fillStyle = gl; c.fillRect(bx - 6 * s, by - 4 * s, 12 * s, 12 * s);
    c.globalAlpha = 1; c.beginPath(); c.ellipse(bx, by + 2 * s, 1.5 * s, 2 * s, 0, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(27,20,51,.6)'; c.lineWidth = .5 * s; c.stroke();
  }
  c.restore();
}
