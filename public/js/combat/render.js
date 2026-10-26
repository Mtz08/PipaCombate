// Desenho: ambientes, pipas (3 formatos), linhas e rabiolas. Arte original em codigo.

const seeded = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

export function groundY(env, x, w, h) {
  // altura do "chao" (de onde saem as linhas), por ambiente
  if (env.ground === 'praia') return h * 0.9;
  if (env.ground === 'serra') return h * 0.86 + Math.sin(x / w * 6) * h * 0.015;
  if (env.ground === 'deserto') return h * 0.88 + Math.sin(x / w * 4 + 1) * h * 0.02;
  return h * 0.84;
}

export function drawEnv(ctx, w, h, env, t, fx) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  env.sky.forEach((c, i) => g.addColorStop(i / (env.sky.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  if (env.sun) {
    const [sx, sy, col] = env.sun, r = Math.min(w, h) * 0.07;
    const glow = ctx.createRadialGradient(sx * w, sy * h, r * 0.4, sx * w, sy * h, r * 4);
    glow.addColorStop(0, col); glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx * w, sy * h, r, 0, 7); ctx.fill();
  }
  if (env.night) {
    const rnd = seeded(5);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) { ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i)); ctx.fillRect(rnd() * w, rnd() * h * 0.6, 1.5, 1.5); }
    ctx.globalAlpha = 1;
    const [mx, my] = env.moon, r = Math.min(w, h) * 0.05;
    ctx.fillStyle = '#f5f3ff'; ctx.beginPath(); ctx.arc(mx * w, my * h, r, 0, 7); ctx.fill();
    ctx.fillStyle = env.sky[0]; ctx.beginPath(); ctx.arc(mx * w + r * 0.4, my * h - r * 0.2, r * 0.85, 0, 7); ctx.fill();
  }
  // nuvens
  ctx.fillStyle = env.storm ? 'rgba(30,36,50,0.7)' : env.night ? 'rgba(120,80,160,0.25)' : 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) {
    const x = ((i * 0.27 + t * 0.006 * (1 + i * 0.3)) % 1.3 - 0.15) * w, y = h * (0.08 + i * 0.06), s = w * 0.07;
    ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, 7); ctx.arc(x + s * 0.5, y - s * 0.2, s * 0.4, 0, 7); ctx.arc(x + s, y, s * 0.45, 0, 7); ctx.fill();
  }

  GROUND[env.ground](ctx, w, h, env, t);

  if (env.fog) { const f = ctx.createLinearGradient(0, h * 0.5, 0, h); f.addColorStop(0, 'rgba(240,244,246,0)'); f.addColorStop(1, 'rgba(240,244,246,0.55)'); ctx.fillStyle = f; ctx.fillRect(0, 0, w, h); }
  if (env.heat) { ctx.fillStyle = `rgba(255,200,120,${0.06 + Math.sin(t * 3) * 0.02})`; ctx.fillRect(0, 0, w, h); }
  if (env.storm) {
    ctx.strokeStyle = 'rgba(180,200,230,0.35)'; ctx.lineWidth = 1;
    const rnd = seeded(Math.floor(t * 30));
    ctx.beginPath();
    for (let i = 0; i < 80; i++) { const x = rnd() * w, y = rnd() * h; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14); }
    ctx.stroke();
    if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.6})`; ctx.fillRect(0, 0, w, h); }
  }
}

const GROUND = {
  laje(ctx, w, h) {
    const rnd = seeded(7);
    ctx.fillStyle = 'rgba(40,40,70,0.35)';
    for (let x = 0; x < w;) { const bw = w * (0.06 + rnd() * 0.07), bh = h * (0.1 + rnd() * 0.12); ctx.fillRect(x, h * 0.84 - bh, bw, bh + h); x += bw + 2; }
    for (let x = -10; x < w;) {
      const bw = w * (0.1 + rnd() * 0.1), top = h * 0.84 + rnd() * h * 0.03;
      ctx.fillStyle = rnd() > 0.5 ? '#a85d45' : '#c08457'; ctx.fillRect(x, top, bw, h);
      ctx.fillStyle = 'rgba(30,30,50,0.5)';
      for (let wx = x + bw * 0.15; wx < x + bw * 0.8; wx += bw * 0.3) ctx.fillRect(wx, top + h * 0.04, bw * 0.13, h * 0.03);
      if (rnd() > 0.5) { ctx.fillStyle = '#2b6cb0'; ctx.fillRect(x + bw * 0.3, top - h * 0.03, bw * 0.25, h * 0.03); }
      x += bw;
    }
  },
  praia(ctx, w, h, env, t) {
    ctx.fillStyle = '#1f78b4'; ctx.fillRect(0, h * 0.76, w, h * 0.14);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    for (let r = 0; r < 3; r++) { ctx.beginPath(); for (let x = 0; x <= w; x += 12) { const y = h * (0.79 + r * 0.035) + Math.sin(x / 40 + t * 1.6 + r) * 3; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    ctx.fillStyle = '#f0d9a0'; ctx.fillRect(0, h * 0.9, w, h);
    // predios da orla ao fundo
    const rnd = seeded(11); ctx.fillStyle = 'rgba(90,120,150,0.5)';
    for (let x = w * 0.55; x < w; x += w * 0.06) { const bh = h * (0.1 + rnd() * 0.15); ctx.fillRect(x, h * 0.76 - bh, w * 0.05, bh); }
  },
  serra(ctx, w, h) {
    const layer = (col, base, amp, f, ph) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * base - Math.abs(Math.sin(x / w * f + ph)) * h * amp); ctx.lineTo(w, h); ctx.fill(); };
    layer('#8fa9b8', 0.7, 0.25, 3, 0.5); layer('#5f8a6e', 0.8, 0.18, 4, 2); layer('#3f6b4f', 0.88, 0.06, 6, 1);
    // araucarias
    const rnd = seeded(4); ctx.fillStyle = '#24432f';
    for (let i = 0; i < 6; i++) { const x = rnd() * w, y = h * 0.86, s = h * 0.06; ctx.fillRect(x - 1.5, y - s, 3, s); ctx.beginPath(); ctx.ellipse(x, y - s, s * 0.5, s * 0.15, 0, 0, 7); ctx.fill(); }
  },
  cidade(ctx, w, h, env, t) {
    const rnd = seeded(9);
    for (let x = 0; x < w;) {
      const bw = w * (0.07 + rnd() * 0.08), bh = h * (0.15 + rnd() * 0.25), top = h * 0.84 - bh;
      ctx.fillStyle = '#120a2a'; ctx.fillRect(x, top, bw, h);
      for (let wy = top + 8; wy < h * 0.84; wy += 12) for (let wx = x + 4; wx < x + bw - 6; wx += 9) if (rnd() > 0.55) { ctx.fillStyle = rnd() > 0.5 ? '#ffd166' : '#7b2cbf'; ctx.fillRect(wx, wy, 4, 5); }
      if (rnd() > 0.6) { ctx.fillStyle = `rgba(0,245,212,${0.6 + Math.sin(t * 4 + x) * 0.3})`; ctx.fillRect(x + 4, top + 6, bw - 8, 3); }
      x += bw + 3;
    }
    ctx.fillStyle = '#0a0518'; ctx.fillRect(0, h * 0.84, w, h);
  },
  deserto(ctx, w, h) {
    const dune = (col, base, amp, f, ph) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * base + Math.sin(x / w * f + ph) * h * amp); ctx.lineTo(w, h); ctx.fill(); };
    dune('#d9935a', 0.78, 0.04, 3, 0); dune('#e8a96a', 0.84, 0.03, 5, 2); dune('#f2c27e', 0.9, 0.02, 4, 1);
    ctx.fillStyle = '#4b7f3a'; const cx = w * 0.15, cy = h * 0.88, s = h * 0.08;
    ctx.fillRect(cx - 3, cy - s, 6, s); ctx.fillRect(cx - 12, cy - s * 0.7, 4, s * 0.35); ctx.fillRect(cx - 12, cy - s * 0.7, 10, 4); ctx.fillRect(cx + 8, cy - s * 0.85, 4, s * 0.4); ctx.fillRect(cx + 2, cy - s * 0.5, 10, 4);
  },
};

/** Linha da mao ate a pipa (pontos ja calculados). */
export function drawLine(ctx, pts, color, width = 1.3) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

export function drawTail(ctx, tail, color, s) {
  if (!tail.length) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tail[0].x, tail[0].y);
  for (const p of tail) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 2; i < tail.length; i += 2) { const p = tail[i]; ctx.fillRect(p.x - s * 0.12, p.y - s * 0.05, s * 0.24, s * 0.1); }
}

/** Pipa centrada em (x,y), tamanho s, angulo a. c = [cor1, cor2]. */
export function drawKite(ctx, x, y, s, a, shape, c, flash = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const P = SHAPES[shape](s);
  // metade esquerda/direita em cores diferentes
  for (const [poly, col] of [[P.left, c[0]], [P.right, c[1]]]) {
    ctx.fillStyle = col; ctx.beginPath(); poly.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath(); P.outline.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(60,35,15,0.6)'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.moveTo(-s * 0.7, -s * 0.15); ctx.lineTo(s * 0.7, -s * 0.15); ctx.stroke();
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flash * 8)})`; ctx.beginPath(); P.outline.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.fill(); }
  ctx.restore();
}

const SHAPES = {
  losango: (s) => ({
    outline: [[0, -s], [s * 0.75, -s * 0.15], [0, s * 1.1], [-s * 0.75, -s * 0.15]],
    left: [[0, -s], [0, s * 1.1], [-s * 0.75, -s * 0.15]], right: [[0, -s], [s * 0.75, -s * 0.15], [0, s * 1.1]],
  }),
  capucheta: (s) => ({
    outline: [[0, -s * 0.8], [s * 0.6, -s * 0.5], [s * 0.6, s * 0.4], [0, s * 0.8], [-s * 0.6, s * 0.4], [-s * 0.6, -s * 0.5]],
    left: [[0, -s * 0.8], [0, s * 0.8], [-s * 0.6, s * 0.4], [-s * 0.6, -s * 0.5]], right: [[0, -s * 0.8], [s * 0.6, -s * 0.5], [s * 0.6, s * 0.4], [0, s * 0.8]],
  }),
  arraia: (s) => ({
    outline: [[0, -s * 0.9], [s * 0.95, s * 0.1], [s * 0.25, s * 0.35], [0, s * 1.2], [-s * 0.25, s * 0.35], [-s * 0.95, s * 0.1]],
    left: [[0, -s * 0.9], [0, s * 1.2], [-s * 0.25, s * 0.35], [-s * 0.95, s * 0.1]], right: [[0, -s * 0.9], [s * 0.95, s * 0.1], [s * 0.25, s * 0.35], [0, s * 1.2]],
  }),
};

// ---------- bonequinho (quem solta a pipa) ----------

export const KID_OPTS = {
  pele: ['#4a2c17', '#6b3e1f', '#8d5524', '#c68642', '#e0ac69', '#ffdbac'],
  camisa: ['#e63946', '#ffd60a', '#16a34a', '#2563eb', '#7c3aed', '#f8fafc', '#111827', '#f97316'],
  bermuda: ['#1e3a8a', '#111827', '#374151', '#065f46', '#7c2d12', '#e11d48'],
  cabeca: ['bone', 'bonetras', 'black', 'raspado', 'bandana'],
  oculos: ['nenhum', 'escuro', 'juliete', 'neon'],
  corrente: ['nenhuma', 'ouro', 'prata'],
  danca: ['pulinho', 'passinho', 'bracos'],
};
const pickO = (a) => a[Math.floor(Math.random() * a.length)];
export const randomKid = () => ({ pele: pickO(KID_OPTS.pele), camisa: pickO(KID_OPTS.camisa), bermuda: pickO(KID_OPTS.bermuda), cabeca: pickO(KID_OPTS.cabeca), cor2: pickO(KID_OPTS.camisa), oculos: pickO(KID_OPTS.oculos), corrente: pickO(KID_OPTS.corrente), danca: pickO(KID_OPTS.danca) });

/** Bonequinho em pe com os pes em (x, y), segurando a linha. pose: 'linha' | 'festa' | 'triste'. */
export function drawKid(ctx, x, y, s, kid, t = 0, pose = 'linha', dir = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  const party = pose === 'festa', dance = kid.danca || 'pulinho';
  const bob = party && dance === 'pulinho' ? Math.abs(Math.sin(t * 10)) * s * 0.25 : 0;
  ctx.translate(party && dance === 'passinho' ? Math.sin(t * 9) * s * 0.2 : 0, -bob);
  if (party && dance === 'passinho') ctx.rotate(Math.sin(t * 9) * 0.12);
  // pernas e tenis
  ctx.fillStyle = kid.pele; ctx.fillRect(-s * 0.28, -s * 0.9, s * 0.18, s * 0.8); ctx.fillRect(s * 0.1, -s * 0.9, s * 0.18, s * 0.8);
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(-s * 0.34, -s * 0.12, s * 0.3, s * 0.14); ctx.fillRect(s * 0.06, -s * 0.12, s * 0.3, s * 0.14);
  // bermuda
  ctx.fillStyle = kid.bermuda; ctx.fillRect(-s * 0.34, -s * 1.3, s * 0.68, s * 0.5);
  // tronco (camisa com faixa)
  ctx.fillStyle = kid.camisa; ctx.fillRect(-s * 0.38, -s * 2.15, s * 0.76, s * 0.9);
  ctx.fillStyle = kid.cor2; ctx.fillRect(-s * 0.38, -s * 1.8, s * 0.76, s * 0.12);
  // bracos: um segurando a linha (pra cima), outro com a lata/carretel
  ctx.strokeStyle = kid.pele; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
  const up = party ? (dance === 'bracos' ? Math.sin(t * 14) * 0.6 : Math.sin(t * 12) * 0.3) : pose === 'triste' ? 1.2 : 0;
  ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 2.0); ctx.lineTo(s * (0.55 + up * 0.1), -s * (2.7 - up)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 2.0); ctx.lineTo(-s * 0.5, -s * (pose === 'festa' ? 2.7 : 1.5)); ctx.stroke();
  ctx.fillStyle = '#9ca3af'; ctx.fillRect(-s * 0.62, -s * 1.55, s * 0.24, s * 0.22); // lata
  // cabeca
  ctx.fillStyle = kid.pele; ctx.beginPath(); ctx.arc(0, -s * 2.55, s * 0.38, 0, 7); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(s * 0.1, -s * 2.62, s * 0.07, s * 0.09);
  if (pose === 'triste') { ctx.strokeStyle = '#111'; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.arc(s * 0.12, -s * 2.3, s * 0.1, 3.6, 5.8); ctx.stroke(); }
  // oculos e corrente
  if (kid.oculos && kid.oculos !== 'nenhum') {
    ctx.fillStyle = { escuro: '#111', juliete: '#7dd3fc', neon: '#f0f' }[kid.oculos];
    ctx.fillRect(-s * 0.05, -s * 2.68, s * 0.36, s * 0.12);
  }
  if (kid.corrente && kid.corrente !== 'nenhuma') {
    ctx.strokeStyle = kid.corrente === 'ouro' ? '#facc15' : '#d1d5db'; ctx.lineWidth = s * 0.07;
    ctx.beginPath(); ctx.arc(0, -s * 2.15, s * 0.22, 0.2, Math.PI - 0.2); ctx.stroke();
  }
  // cabelo / bone
  const c = kid.cabeca;
  if (c === 'bone' || c === 'bonetras') {
    ctx.fillStyle = kid.cor2; ctx.beginPath(); ctx.arc(0, -s * 2.62, s * 0.4, Math.PI, 0); ctx.fill();
    ctx.fillRect(c === 'bone' ? 0 : -s * 0.7, -s * 2.66, s * 0.7, s * 0.1);
  } else if (c === 'black') { ctx.fillStyle = '#1c1917'; ctx.beginPath(); ctx.arc(0, -s * 2.75, s * 0.5, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); }
  else if (c === 'bandana') { ctx.fillStyle = kid.cor2; ctx.fillRect(-s * 0.4, -s * 2.85, s * 0.8, s * 0.16); ctx.fillRect(-s * 0.6, -s * 2.8, s * 0.22, s * 0.3); }
  else { ctx.fillStyle = 'rgba(20,20,20,0.6)'; ctx.beginPath(); ctx.arc(0, -s * 2.6, s * 0.39, Math.PI, 0); ctx.fill(); }
  ctx.restore();
}
