/* Pipa Combate — escudos dos times e marcas de material esportivo (uso licenciado).
   Versões simplificadas desenhadas em canvas: formato, cores e iniciais de cada escudo.
   drawEscudo(c, id, cx, cy, r): r = meia altura do escudo.
   drawFornecedor(c, id, cx, cy, r, col): marca do fornecedor do uniforme. */

/* forma: escudo | circulo | triangulo | oval
   fundo: listras (hoops/stripes/tri), faixa diagonal (sash) ou liso */
export const ESCUDOS = {
  flamengo:      { forma: 'escudo',    c1: '#c8102e', c2: '#111111', borda: '#111111', fundo: 'hoops', txt: 'CRF', tc: '#ffffff' },
  corinthians:   { forma: 'circulo',   c1: '#f8fafc', c2: '#111111', borda: '#111111', txt: 'SCCP', tc: '#111111', anel: '#111111' },
  brasil:        { forma: 'escudo',    c1: '#1e3a8a', c2: '#fcd116', borda: '#fcd116', txt: 'CBF', tc: '#fcd116', estrelas: 5 },
  argentina:     { forma: 'oval',      c1: '#75aadb', c2: '#f8fafc', borda: '#0b2a4a', fundo: 'stripes', txt: 'AFA', tc: '#0b2a4a', estrelas: 3 },
  saopaulo:      { forma: 'triangulo', c1: '#f8fafc', c2: '#d50000', c3: '#111111', borda: '#111111', fundo: 'band', txt: 'SPFC', tc: '#111111' },
  palmeiras:     { forma: 'circulo',   c1: '#006437', c2: '#f8fafc', borda: '#f8fafc', txt: 'P', tc: '#f8fafc', anel: '#f8fafc' },
  vasco:         { forma: 'escudo',    c1: '#111111', c2: '#f8fafc', borda: '#f8fafc', fundo: 'sash', cruz: '#d50000' },
  botafogo:      { forma: 'escudo',    c1: '#111111', c2: '#f8fafc', borda: '#f8fafc', estrelaGrande: '#f8fafc' },
  fluminense:    { forma: 'escudo',    c1: '#7a0a2a', c2: '#00613c', c3: '#f8fafc', borda: '#f8fafc', fundo: 'tri', txt: 'FFC', tc: '#f8fafc' },
  internacional: { forma: 'circulo',   c1: '#d00000', c2: '#f8fafc', borda: '#f8fafc', txt: 'SCI', tc: '#f8fafc', anel: '#f8fafc' },
  cruzeiro:      { forma: 'circulo',   c1: '#1d4ed8', c2: '#f8fafc', borda: '#f8fafc', cruzeiroSul: true, anel: '#f8fafc' },
  holanda:       { forma: 'escudo',    c1: '#f36c21', c2: '#111111', borda: '#111111', txt: 'KNVB', tc: '#111111' },
};

function shieldPath(c, cx, cy, r) {
  const w = r * .86;
  c.beginPath();
  c.moveTo(cx - w, cy - r); c.lineTo(cx + w, cy - r);
  c.lineTo(cx + w, cy + r * .1); c.quadraticCurveTo(cx + w, cy + r * .7, cx, cy + r);
  c.quadraticCurveTo(cx - w, cy + r * .7, cx - w, cy + r * .1); c.closePath();
}
function shapePath(c, forma, cx, cy, r) {
  if (forma === 'circulo') { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); }
  else if (forma === 'oval') { c.beginPath(); c.ellipse(cx, cy, r * .78, r, 0, 0, Math.PI * 2); }
  else if (forma === 'triangulo') { c.beginPath(); c.moveTo(cx - r * .95, cy - r * .8); c.lineTo(cx + r * .95, cy - r * .8); c.lineTo(cx, cy + r); c.closePath(); }
  else shieldPath(c, cx, cy, r);
}
function star(c, cx, cy, r1, r2) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? r2 : r1, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  c.closePath();
}

export function drawEscudo(c, id, cx, cy, r) {
  const e = ESCUDOS[id];
  if (!e) return false;
  c.save();
  shapePath(c, e.forma, cx, cy, r);
  c.fillStyle = e.c1; c.fill();
  c.save(); c.clip();
  const x0 = cx - r, y0 = cy - r, d = r * 2;
  c.fillStyle = e.c2;
  if (e.fundo === 'hoops') for (let y = y0 + d * .14; y < y0 + d; y += d * .28) c.fillRect(x0, y, d, d * .14);
  else if (e.fundo === 'stripes') for (let x = x0 + d * .18; x < x0 + d; x += d * .36) c.fillRect(x, y0, d * .18, d);
  else if (e.fundo === 'tri') { const cs = [e.c2, e.c3]; for (let i = 0, x = x0 + d * .2; x < x0 + d; x += d * .2, i++) { c.fillStyle = cs[i % 2]; c.fillRect(x, y0, d * .1, d); } }
  else if (e.fundo === 'band') { const m = cy - r * .15; c.fillRect(x0, m, d, r * .16); c.fillStyle = e.c3; c.fillRect(x0, m + r * .16, d, r * .16); c.fillStyle = e.c2; c.fillRect(x0, m + r * .32, d, r * .16); }
  else if (e.fundo === 'sash') { c.beginPath(); c.moveTo(x0 + d, y0); c.lineTo(x0 + d, y0 + d * .28); c.lineTo(x0 + d * .28, y0 + d); c.lineTo(x0, y0 + d); c.lineTo(x0, y0 + d * .72); c.lineTo(x0 + d * .72, y0); c.closePath(); c.fill(); }
  c.restore();
  if (e.anel) { c.beginPath(); c.arc(cx, cy, r * .78, 0, Math.PI * 2); c.strokeStyle = e.anel; c.lineWidth = r * .1; c.stroke(); }
  if (e.cruz) { // cruz pátea
    c.fillStyle = e.cruz; const a = r * .42, b = r * .14;
    c.beginPath(); c.moveTo(cx - b, cy - b); c.lineTo(cx - a * .6, cy - a); c.lineTo(cx + a * .6, cy - a); c.lineTo(cx + b, cy - b);
    c.lineTo(cx + a, cy - a * .6); c.lineTo(cx + a, cy + a * .6); c.lineTo(cx + b, cy + b); c.lineTo(cx + a * .6, cy + a);
    c.lineTo(cx - a * .6, cy + a); c.lineTo(cx - b, cy + b); c.lineTo(cx - a, cy + a * .6); c.lineTo(cx - a, cy - a * .6); c.closePath(); c.fill();
  }
  if (e.estrelaGrande) { star(c, cx, cy + r * .05, r * .55, r * .22); c.fillStyle = e.estrelaGrande; c.fill(); }
  if (e.cruzeiroSul) { c.fillStyle = e.c2; for (const [dx, dy, s] of [[0, -.45, .2], [.38, -.05, .17], [0, .45, .2], [-.34, .08, .16], [.12, .14, .1]]) { star(c, cx + dx * r, cy + dy * r, r * s, r * s * .45); c.fill(); } }
  if (e.estrelas) { c.fillStyle = e.tc || '#fcd116'; const n = e.estrelas; for (let i = 0; i < n; i++) { const sx = cx + (i - (n - 1) / 2) * r * .3; star(c, sx, cy - r * 1.22, r * .15, r * .06); c.fill(); } }
  if (e.txt) {
    c.fillStyle = e.tc; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${r * (e.txt.length > 3 ? .46 : e.txt.length > 1 ? .58 : 1)}px Nunito, Arial, sans-serif`;
    c.fillText(e.txt, cx, cy + (e.forma === 'triangulo' ? -r * .35 : e.forma === 'escudo' ? -r * .05 : r * .04));
  }
  shapePath(c, e.forma, cx, cy, r);
  c.strokeStyle = e.borda; c.lineWidth = Math.max(.5, r * .12); c.stroke();
  c.restore();
  return true;
}

/* marcas de fornecedor (conferir os contratos de material esportivo vigentes) */
export function drawFornecedor(c, id, cx, cy, r, col) {
  c.save(); c.fillStyle = col; c.strokeStyle = col;
  if (id === 'nike') { // swoosh
    c.beginPath();
    c.moveTo(cx - r * 1.1, cy - r * .1);
    c.quadraticCurveTo(cx - r * 1.4, cy + r * .9, cx - r * .2, cy + r * .45);
    c.lineTo(cx + r * 1.3, cy - r * .5);
    c.lineTo(cx - r * .3, cy + r * .2);
    c.quadraticCurveTo(cx - r * 1, cy + r * .45, cx - r * 1.1, cy - r * .1);
    c.closePath(); c.fill();
  } else if (id === 'adidas') { // três barras inclinadas formando a "montanha"
    const base = cy + r * .6;
    for (let i = 0; i < 3; i++) {
      const h = r * (.55 + i * .5), x = cx - r * 1.05 + i * r * .72, w = r * .48, t = h * .55;
      c.beginPath(); c.moveTo(x, base); c.lineTo(x + t, base - h); c.lineTo(x + t + w, base - h); c.lineTo(x + w, base); c.closePath(); c.fill();
    }
  } else if (id === 'umbro') { // losango duplo
    c.lineWidth = r * .28;
    for (const dx of [-.4, .4]) { c.beginPath(); c.moveTo(cx + dx * r, cy - r * .7); c.lineTo(cx + dx * r + r * .6, cy); c.lineTo(cx + dx * r, cy + r * .7); c.lineTo(cx + dx * r - r * .6, cy); c.closePath(); c.stroke(); }
  } else { c.restore(); return false; }
  c.restore();
  return true;
}
