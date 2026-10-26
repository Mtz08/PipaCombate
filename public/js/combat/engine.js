// Motor do Combate: fisica das pipas, linhas, cruzadas, IA dos rivais, ondas,
// chefoes, aparar, power-ups, rajadas. Roda no cliente; cada corte do jogador
// e informado ao servidor (onCut), que decide se o vento virou.

import { MAPS, RIVALS, RIVAL_COLORS, BOSSES, POWERS, CUT_TXT, skinById } from './world.js';
import { drawEnv, drawKite, drawLine, drawTail, groundY, drawKid, randomKid } from './render.js';

// Modo treino (sem aposta): rivais mais fracos para aprender. Nunca usado em round valendo.
const PRACTICE_EASE = { hp: 0.7, str: 0.65, agg: 0.75 };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DMG = 30;
const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function segX(a, b, c, d) {
  const r1x = b.x - a.x, r1y = b.y - a.y, r2x = d.x - c.x, r2y = d.y - c.y, den = r1x * r2y - r1y * r2x;
  if (!den) return null;
  const qx = c.x - a.x, qy = c.y - a.y, t = (qx * r2y - qy * r2x) / den, u = (qx * r1y - qy * r1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * r1x, y: a.y + t * r1y } : null;
}
function lineHit(A, B) {
  for (let i = 2; i < A.length - 1; i++) for (let j = 2; j < B.length - 1; j++) { const p = segX(A[i], A[i + 1], B[j], B[j + 1]); if (p) return p; }
  return null;
}
const power = (k) => k.str * (0.3 + Math.min(k.spd / 420, 1) * 1.1);

export class Combat {
  constructor(canvas, opts = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.o = opts; this.env = MAPS[opts.map] || MAPS.laje; this.skin = skinById(opts.skin);
    this.demo = !!opts.demo;
    this.ease = opts.practice ? PRACTICE_EASE : { hp: 1, str: 1, agg: 1 };
    this.kid = opts.kid || randomKid();
    this.t = 0; this.bots = []; this.falling = []; this.parts = []; this.texts = []; this.powers = [];
    this.wave = 0; this.queue = []; this.spawnT = 1; this.powerT = rnd(9, 13); this.gustT = rnd(14, 22); this.gust = null; this.gustF = 0;
    this.buffs = { vento: 0, ouro: 0, escudo: 0 }; this.dashT = 0; this.dashCd = 0; this.shake = 0; this.flash = 0; this.boltT = rnd(5, 10);
    this.player = null; this.over = false; this.streak = 0; this.streakT = -9;
    this.resize();
    this.aim = { x: this.w / 2, y: this.h * 0.35 };
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas);
    if (!this.demo) this.bindInput();
    if (this.demo) for (let i = 0; i < 3; i++) this.spawn(this.rivalSpec(this.pickType(4), 3));
    else { this.spawnPlayer(); this.startWave(1); }
    this.running = true; this.last = performance.now();
    const frame = (now) => { if (!this.running) return; const dt = Math.min(0.033, (now - this.last) / 1000); this.last = now; this.update(dt); this.draw(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }

  destroy() { this.running = false; this.ro.disconnect(); this.unbind?.(); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = this.c.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.S = Math.min(this.w, this.h) / 420; // escala geral
    this.skyTop = this.h * 0.08; this.skyBot = this.h * 0.68;
  }

  bindInput() {
    const pos = (e) => { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top - (e.pointerType === 'touch' ? 60 * this.S : 0) }; };
    const move = (e) => { if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch') { const p = pos(e); this.aim.x = clamp(p.x, 20, this.w - 20); this.aim.y = clamp(p.y, this.skyTop, this.skyBot); } };
    let lastTap = 0;
    const down = (e) => { move(e); const now = performance.now(); if (now - lastTap < 280) this.dash(); lastTap = now; };
    const key = (e) => { if (e.code === 'Space') { e.preventDefault(); this.dash(); } };
    this.c.addEventListener('pointermove', move); this.c.addEventListener('pointerdown', down); window.addEventListener('keydown', key);
    this.unbind = () => { this.c.removeEventListener('pointermove', move); this.c.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }

  anchor(frac) { const x = frac * this.w; return { x, y: groundY(this.env, x, this.w, this.h) - 8 * this.S }; }

  kite(o) {
    const k = Object.assign({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, ang: 0, spd: 0, hp: 100, maxHp: 100, str: 1, alive: true, pts: [], tail: [], flash: 0, launch: 1, lastContact: -9, seed: Math.random() * 9 }, o);
    for (let i = 0; i <= 10; i++) k.pts.push({ x: k.x, y: k.y });
    return k;
  }

  spawnPlayer() {
    const a = this.anchor(0.5);
    this.player = this.kite({ isPlayer: true, frac: 0.5, x: a.x, y: a.y - 20, shape: this.skin.shape, c: this.skin.c, tailCol: this.skin.tail, s: 16 * this.S, inv: 1.5, launch: 0.6 });
  }

  pickType(n) { const bag = []; for (const k in RIVALS) if (RIVALS[k].from <= n) for (let i = 0; i < (k === 'moleque' ? 5 : 2); i++) bag.push(k); return pick(bag); }

  rivalSpec(type, n) {
    const T = RIVALS[type], m = Math.min(n, 16), col = pick(RIVAL_COLORS);
    return { type, shape: T.shape, c: col, tailCol: col[0], thief: !!T.thief, s: 15 * this.S * (T.hp > 1.5 ? 1.2 : 1),
      hp: (60 + m * 7 + rnd(0, 15)) * T.hp * this.ease.hp, str: clamp((0.6 + m * 0.035) * T.str, 0.4, 1.6) * this.ease.str,
      K: (14 + m * 1.1) * T.spd, maxV: (330 + m * 15) * T.spd * this.S, agg: clamp((0.25 + m * 0.045) * T.agg, 0.08, 0.85) * this.ease.agg, kid: randomKid() };
  }

  bossSpec(n) {
    const B = BOSSES[(Math.floor(n / 5) - 1) % BOSSES.length];
    return { type: 'chefe', boss: B, shape: B.shape, c: B.c, tailCol: B.c[1], s: 22 * this.S, kid: randomKid(), hp: B.hp * (1 + n * 0.04) * this.ease.hp, str: B.str * (1 + n * 0.012) * this.ease.str,
      K: 26 * B.spd, maxV: 540 * B.spd * this.S, agg: 0.9, sumT: 12, gustT: 10 };
  }

  freeFrac() {
    const used = this.bots.map((b) => b.frac);
    for (let i = 0; i < 30; i++) { const f = rnd(0.07, 0.93); if (Math.abs(f - 0.5) > 0.12 && used.every((u) => Math.abs(u - f) > 0.09)) return f; }
    return pick([rnd(0.07, 0.35), rnd(0.65, 0.93)]);
  }

  spawn(spec) {
    const frac = this.freeFrac(), a = this.anchor(frac);
    const b = this.kite({ ...spec, frac, x: a.x, y: a.y - 10, tx: a.x, ty: rnd(this.skyTop + 20, this.skyBot - 40), maxHp: spec.hp, launch: 1.3, ai: { t: rnd(1, 2), mode: 'wander' } });
    this.bots.push(b);
    if (spec.boss) { this.boss = b; this.emit('boss', spec.boss.name); }
    return b;
  }

  startWave(n) {
    this.wave = n;
    const boss = n % 5 === 0;
    this.queue = boss ? [this.bossSpec(n), ...Array.from({ length: 1 + Math.floor(n / 5) }, () => this.rivalSpec(this.pickType(n), n))]
      : Array.from({ length: Math.min(2 + n, 14) }, () => this.rivalSpec(this.pickType(n), n));
    this.maxAlive = boss ? 3 : Math.min(1 + Math.ceil(n / 2), 4);
    this.spawnT = boss ? 2 : 1.2; this.clearT = 0;
    this.emit('wave', n);
  }

  emit(type, data) { this.o.onEvent?.(type, data); }

  // ---------- acoes ----------

  dash() {
    const p = this.player;
    if (!p?.alive || this.over || this.dashCd > 0) return;
    let dx = this.aim.x - p.x, dy = this.aim.y - p.y, d = Math.hypot(dx, dy);
    if (d < 20) { dx = p.vx; dy = p.vy; d = Math.hypot(dx, dy) || 1; }
    p.vx += (dx / d) * 950 * this.S; p.vy += (dy / d) * 950 * this.S;
    this.dashT = 0.45; this.dashCd = 4;
    this.burst(p.x, p.y, 14, ['#fde047', '#fff'], 200);
    this.emit('dash');
  }

  /** O servidor avisou que o vento virou: todas as linhas arrebentam. */
  windTurn(mult) {
    this.over = true;
    this.gust = { dir: pick([-1, 1]), force: 900 * this.S, t: 0, dur: 2.5 };
    for (const k of [this.player, ...this.bots]) if (k?.alive) this.drop(k);
    this.say(`O VENTO VIROU! ${mult ?? ''}`, this.w / 2, this.h * 0.4, '#fde047', 1.4);
    this.shake = 10;
  }

  /** Jogador recolheu: pipa desce em seguranca. */
  reelIn() { this.over = true; if (this.player) this.player.reeling = true; }

  // ---------- fisica ----------

  physics(k, dt, K, C, maxV) {
    const tx = clamp(k.tx + this.gustF * 0.45, 24, this.w - 24), ty = clamp(k.ty, this.skyTop, this.skyBot);
    k.vx += ((tx - k.x) * K - k.vx * C) * dt; k.vy += ((ty - k.y) * K - k.vy * C) * dt;
    k.vx += Math.sin(this.t * 1.3 + k.seed) * 18 * dt;
    const sp = Math.hypot(k.vx, k.vy);
    if (sp > maxV) { k.vx *= maxV / sp; k.vy *= maxV / sp; }
    k.x = clamp(k.x + k.vx * dt, 16, this.w - 16); k.y = clamp(k.y + k.vy * dt, this.skyTop - 30, this.skyBot + 24);
    k.ang += (clamp(k.vx / 520, -0.7, 0.7) - k.ang) * Math.min(1, dt * 8);
    k.spd += (sp / this.S - k.spd) * Math.min(1, dt * 6);
  }

  updLine(k) {
    const a = this.anchor(k.frac), ex = k.x, ey = k.y + k.s * 0.3, d = Math.hypot(ex - a.x, ey - a.y);
    const cx = (a.x + ex) / 2, cy = (a.y + ey) / 2 + d * 0.12, N = k.pts.length - 1;
    for (let i = 0; i <= N; i++) { const t = i / N, u = 1 - t; k.pts[i].x = u * u * a.x + 2 * u * t * cx + t * t * ex; k.pts[i].y = u * u * a.y + 2 * u * t * cy + t * t * ey; }
  }

  updTail(k, dt) {
    const L = k.s * 1.1, hx = k.x - Math.sin(k.ang) * L, hy = k.y + Math.cos(k.ang) * L, seg = 7 * this.S;
    if (!k.tail.length) for (let i = 0; i < 12; i++) k.tail.push({ x: hx, y: hy + i * seg });
    k.tail[0].x = hx; k.tail[0].y = hy;
    const wind = this.env.wind * 0.6 + this.gustF * 0.5;
    for (let i = 1; i < k.tail.length; i++) {
      const p = k.tail[i], q = k.tail[i - 1];
      p.y += 70 * dt; p.x -= wind * dt;
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
      p.x = q.x + (dx / d) * seg; p.y = q.y + (dy / d) * seg;
    }
  }

  crossTarget(b, k) {
    const a = k.pts[0], e = k.pts[k.pts.length - 1], m = k.pts[6];
    const lx = e.x - a.x, ly = e.y - a.y, L = Math.hypot(lx, ly) || 1, nx = -ly / L, ny = lx / L;
    const side = Math.sign((b.x - a.x) * nx + (b.y - a.y) * ny) || 1;
    b.tx = m.x - nx * side * 110 * this.S; b.ty = m.y - ny * side * 110 * this.S;
  }

  think(b, dt) {
    const ai = b.ai, p = this.player;
    ai.t -= dt;
    if (b.boss) this.bossAbilities(b, dt);
    if (b.contact) {
      if (!ai.inC) { ai.inC = true; ai.cx = b.x; ai.cy = b.y; ai.ph = 0; }
      ai.ph += dt * 6;
      b.tx = ai.cx + Math.sin(ai.ph) * 70 * this.S; b.ty = ai.cy + Math.cos(ai.ph * 1.3) * 40 * this.S;
      if (b.hp < b.maxHp * 0.25 && !b.boss && Math.random() < dt * 0.7) { ai.mode = 'flee'; ai.t = 2; }
      if (ai.mode !== 'flee') return;
    } else ai.inC = false;
    if (b.thief) {
      const f = this.falling.filter((f) => !f.caught && !f.stolen).sort((x, y) => Math.hypot(b.x - x.x, b.y - x.y) - Math.hypot(b.x - y.x, b.y - y.y))[0];
      if (f) { b.tx = f.x; b.ty = f.y; if (Math.hypot(b.x - f.x, b.y - f.y) < 30 * this.S) { f.stolen = true; this.say('ROUBOU!', f.x, f.y - 20, '#fca5a5'); } return; }
    }
    if (ai.t <= 0) {
      const roll = Math.random();
      if (p?.alive && p.launch <= 0 && !this.over && roll < b.agg) { ai.mode = 'attack'; ai.target = p; ai.t = rnd(2.5, 4.5); }
      else { const others = this.bots.filter((o) => o !== b && o.alive && !o.boss && !b.boss); if (others.length && roll < b.agg + 0.18) { ai.mode = 'attack'; ai.target = pick(others); ai.t = rnd(2, 3.5); } else { ai.mode = 'wander'; ai.t = rnd(1.5, 3.5); b.tx = rnd(this.w * 0.08, this.w * 0.92); b.ty = rnd(this.skyTop + 10, this.skyBot - 10); } }
    }
    if (ai.mode === 'attack') { if (ai.target?.alive) this.crossTarget(b, ai.target); else ai.t = 0; }
    else if (ai.mode === 'flee') { b.tx = b.x < this.w / 2 ? this.w * 0.06 : this.w * 0.94; b.ty = this.skyTop + 10; if (ai.t <= 0) ai.mode = 'wander'; }
  }

  bossAbilities(b, dt) {
    if (!b.enraged && b.hp < b.maxHp * 0.5) { b.enraged = true; b.K *= 1.25; b.maxV *= 1.2; this.say('ENFURECIDO!', b.x, b.y - 40, '#ef4444', 1.1); this.shake = 6; }
    if (b.boss.summon && (b.sumT -= dt) <= 0) { b.sumT = b.enraged ? 9 : 13; if (this.bots.length < 5) this.spawn(this.rivalSpec('moleque', this.wave)); }
    if (b.boss.gust && (b.gustT -= dt) <= 0) { b.gustT = rnd(9, 13); this.startGust(Math.sign((this.player?.x ?? 0) - b.x) || 1, 1.3); }
  }

  startGust(dir, k = 1) { this.gust = { dir, force: rnd(220, 340) * k * this.S, t: 0, dur: rnd(2.5, 4) }; this.emit('gust'); }

  contacts(dt) {
    const p = this.player;
    for (const b of this.bots) { b.prevP = b.withP; b.withP = null; b.contact = null; }
    if (p?.alive && p.launch <= 0 && !this.over) {
      p.contact = null;
      for (const b of this.bots) {
        if (b.launch > 0 || !b.alive) continue;
        const hit = lineHit(p.pts, b.pts);
        if (!hit) continue;
        b.withP = b.contact = p.contact = hit; b.lastContact = p.lastContact = this.t;
        const dashing = this.dashT > 0;
        const pp = power(p) * (this.buffs.ouro > 0 ? 2 : 1) * (dashing ? 2.5 : 1), bp = power(b);
        if (!b.prevP && (p.spd > 480 || dashing)) { b.hp -= b.maxHp * 0.22 * (dashing ? 1.5 : 1); this.say('CHEGADA!', hit.x, hit.y - 30, '#fde047', 0.8); this.shake = 3; this.emit('hit'); }
        b.hp -= pp * DMG * dt; b.flash = 0.08;
        if (p.inv <= 0 && this.buffs.escudo <= 0) { p.hp -= bp * DMG * dt; p.flash = 0.08; }
        if (Math.random() < 0.7) this.burst(hit.x, hit.y, 2, ['#fff7ae', '#fde047'], 170, 0.35, 2);
        this.grinding = true;
        if (b.hp <= 0) this.cut(b, 'player');
        else if (p.hp <= 0) { this.cut(p, b); break; }
      }
    }
    for (let i = 0; i < this.bots.length; i++) for (let j = i + 1; j < this.bots.length; j++) {
      const a = this.bots[i], b = this.bots[j];
      if (!a.alive || !b.alive || a.launch > 0 || b.launch > 0 || a.boss || b.boss) continue;
      const hit = lineHit(a.pts, b.pts);
      if (!hit) continue;
      a.contact ||= hit; b.contact ||= hit;
      a.hp -= power(b) * DMG * 0.55 * dt; b.hp -= power(a) * DMG * 0.55 * dt;
      if (a.hp <= 0) this.cut(a, b); else if (b.hp <= 0) this.cut(b, a);
    }
    this.bots = this.bots.filter((b) => b.alive);
  }

  drop(k) {
    k.alive = false;
    this.falling.push({ x: k.x, y: k.y, vx: k.vx * 0.3, vy: -60, ang: k.ang, spin: rnd(7, 11) * pick([-1, 1]), t: 0, shape: k.shape, c: k.c, s: k.s, own: !!k.isPlayer, tail: k.tail, tailCol: k.tailCol, boss: !!k.boss });
    this.burst(k.x, k.y, 26, [k.c[0], k.c[1], '#fff'], 300, 0.9, 3.5);
  }

  cut(k, by) {
    this.drop(k);
    if (k.isPlayer) {
      this.over = true; this.shake = 8; this.pose = { kind: 'triste', t: 99 };
      this.say('CORTARAM SUA PIPA!', k.x, k.y - 30, '#fca5a5', 1.1);
      this.o.onPlayerCut?.();
      return;
    }
    if (k.boss) this.boss = null;
    if (by !== 'player') { this.say('CORTADA!', k.x, k.y - 20, '#e2e8f0', 0.7); return; }
    const kind = k.boss ? 'chefe' : k.type;
    this.pose = { kind: 'festa', t: 1.5 };
    if (by && by !== 'player') by.party = 1.5;
    this.streak = this.t - this.streakT < 2.2 ? this.streak + 1 : 1; this.streakT = this.t;
    this.say(k.boss ? 'CHEFÃO CORTADO!' : pick(CUT_TXT), k.x, k.y - 34, k.boss ? '#fde047' : '#fff', k.boss ? 1.3 : 1);
    if (this.streak >= 2) this.say(['', '', 'CORTE DUPLO!', 'TRIPLO!', 'QUÁDRUPLO!'][Math.min(this.streak, 4)] || 'MASSACRE!', this.w / 2, this.h * 0.25, '#fde047', 1.2);
    if (k.boss) this.shake = 9;
    this.o.onCut?.(kind, { x: k.x, y: k.y });
  }

  catch(f) {
    f.caught = true;
    this.say('APARADA!', f.x, f.y - 26, '#86efac');
    this.burst(f.x, f.y, 18, ['#86efac', '#fff'], 200);
    this.o.onCut?.('aparar', { x: f.x, y: f.y });
  }

  burst(x, y, n, cols, sp = 220, life = 0.7, size = 3) {
    if (reduce()) n = Math.ceil(n / 4);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = rnd(0.3, 1) * sp * this.S; this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.5, 1) * life, max: life, col: pick(cols), r: rnd(1, size) }); }
  }

  say(txt, x, y, col = '#fff', scale = 1) { this.texts.push({ txt, x, y, col, scale, life: 1.3, max: 1.3 }); }

  // ---------- loop ----------

  update(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2); this.shake = Math.max(0, this.shake - dt * 30);
    if (this.env.storm && (this.boltT -= dt) <= 0) { this.boltT = rnd(6, 12); this.flash = 1; this.emit('thunder'); }

    if (this.gust) { const g = this.gust; g.t += dt; this.gustF = g.dir * g.force * Math.sin(Math.PI * clamp(g.t / g.dur, 0, 1)); if (g.t >= g.dur) { this.gust = null; this.gustF = 0; } }
    else if (!this.demo && !this.over && (this.gustT -= dt) <= 0) { this.gustT = rnd(16, 26) / (this.env.wind / 14); this.startGust(pick([-1, 1])); }

    const p = this.player;
    this.grinding = false;
    if (!this.demo) {
      for (const b in this.buffs) this.buffs[b] = Math.max(0, this.buffs[b] - dt);
      this.dashT = Math.max(0, this.dashT - dt); this.dashCd = Math.max(0, this.dashCd - dt);
      if (p?.alive) {
        if (p.reeling) { const a = this.anchor(0.5); p.tx = a.x; p.ty = a.y; }
        else { p.tx = this.aim.x; p.ty = this.aim.y; }
        const ag = this.buffs.vento > 0 ? 1.4 : 1;
        this.physics(p, dt, 36 * ag, 9, 700 * ag * (this.dashT > 0 ? 1.8 : 1) * this.S);
        p.inv = Math.max(0, p.inv - dt); p.launch = Math.max(0, p.launch - dt);
      }
      if (!this.over) {
        if (this.clearT > 0) { if ((this.clearT -= dt) <= 0) this.startWave(this.wave + 1); }
        else {
          this.spawnT -= dt;
          if (this.queue.length && this.bots.length < this.maxAlive && this.spawnT <= 0) { this.spawn(this.queue.shift()); this.spawnT = rnd(1.1, 2.2); }
          if (!this.queue.length && !this.bots.length) { this.clearT = 3; this.emit('waveClear', this.wave); }
        }
        if ((this.powerT -= dt) <= 0) { this.powerT = rnd(11, 16); const left = Math.random() < 0.5; this.powers.push({ type: pick(Object.keys(POWERS)), x: left ? -30 : this.w + 30, y: rnd(this.skyTop + 30, this.skyBot - 30), vx: (left ? 1 : -1) * rnd(45, 75), t: 0 }); }
      }
      for (const pw of this.powers) {
        pw.t += dt; pw.x += pw.vx * dt; pw.y += Math.sin(pw.t * 2) * 20 * dt;
        if (p?.alive && !this.over && Math.hypot(p.x - pw.x, p.y - pw.y) < 36 * this.S) { pw.dead = true; this.buffs[pw.type] = POWERS[pw.type].dur; this.say(POWERS[pw.type].name, pw.x, pw.y - 20, POWERS[pw.type].color); this.emit('power', pw.type); }
        if (pw.x < -60 || pw.x > this.w + 60) pw.dead = true;
      }
      this.powers = this.powers.filter((pw) => !pw.dead);
    } else if ((this.spawnT -= dt) <= 0 && this.bots.length < 3) { this.spawn(this.rivalSpec(this.pickType(4), 3)); this.spawnT = rnd(1.5, 3); }

    for (const b of this.bots) { this.think(b, dt); this.physics(b, dt, b.K, 8, b.maxV); b.launch = Math.max(0, b.launch - dt); }
    const kites = p?.alive ? [p, ...this.bots] : this.bots;
    for (const k of kites) { this.updLine(k); this.updTail(k, dt); k.flash = Math.max(0, k.flash - dt); }
    this.contacts(dt);
    for (const k of kites) if (k.alive && this.t - k.lastContact > 1.2) k.hp = Math.min(k.maxHp, k.hp + 6 * dt);

    const reach = 40 * this.S;
    for (const f of this.falling) {
      f.t += dt;
      if (f.caught || f.stolen) { f.y -= 60 * dt; f.gone = (f.gone || 0) + dt; continue; }
      f.vy = Math.min(f.vy + 60 * dt, 80); f.vx += ((this.env.wind * 0.8 + this.gustF * 0.5 - f.vx) * 0.5 + Math.sin(f.t * 2) * 30) * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.spin *= Math.pow(0.25, dt); f.ang += f.spin * dt;
      this.updTail(f, dt);
      if (!this.demo && !f.own && p?.alive && !this.over && f.y < this.skyBot + 40 && Math.hypot(p.x - f.x, p.y - f.y) < reach) this.catch(f);
    }
    this.falling = this.falling.filter((f) => f.y < this.h + 80 && !(f.gone > 0.7) && f.x > -120 && f.x < this.w + 120);
    for (const q of this.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 260 * dt; }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 40 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.pose && (this.pose.t -= dt) <= 0) this.pose = null;
    for (const b of this.bots) b.party = Math.max(0, (b.party || 0) - dt);
    this.o.onTick?.(this);
  }

  draw() {
    const { ctx, w, h } = this;
    ctx.save();
    if (this.shake > 0 && !reduce()) ctx.translate(rnd(-1, 1) * this.shake, rnd(-1, 1) * this.shake);
    drawEnv(ctx, w, h, this.env, this.t, { flash: this.flash });
    const ks = 11 * this.S;
    for (const b of this.bots) { const a = this.anchor(b.frac); drawKid(ctx, a.x, a.y + 8 * this.S, ks, b.kid, this.t, b.party > 0 ? 'festa' : 'linha', b.x < a.x ? -1 : 1); }
    if (!this.demo) { const a = this.anchor(0.5); drawKid(ctx, a.x, a.y + 8 * this.S, ks * 1.15, this.kid, this.t, this.pose?.kind || 'linha', (this.player?.x ?? a.x) < a.x ? -1 : 1); }

    for (const pw of this.powers) {
      const P = POWERS[pw.type];
      ctx.fillStyle = P.color; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(pw.x, pw.y, 20 * this.S, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(pw.x, pw.y, 11 * this.S, 0, 7); ctx.fill();
    }
    const p = this.player;
    for (const b of this.bots) {
      drawLine(ctx, b.pts, b.contact ? '#fde047' : 'rgba(20,20,30,0.55)');
      drawTail(ctx, b.tail, b.tailCol, b.s);
      drawKite(ctx, b.x, b.y, b.s, b.ang, b.shape, b.c, b.flash);
      if (b.hp < b.maxHp && b.alive) this.bar(b.x, b.y - b.s * 1.6, b.hp / b.maxHp, b.boss ? '#ef4444' : '#f97316');
    }
    for (const f of this.falling) { ctx.globalAlpha = f.caught || f.stolen ? Math.max(0, 1 - (f.gone || 0) / 0.7) : 1; drawTail(ctx, f.tail, f.tailCol, f.s); drawKite(ctx, f.x, f.y, f.s, f.ang, f.shape, f.c); ctx.globalAlpha = 1; }
    if (p?.alive) {
      drawLine(ctx, p.pts, this.buffs.ouro > 0 ? '#facc15' : p.contact ? '#fde047' : 'rgba(255,255,255,0.9)', this.buffs.ouro > 0 ? 2.2 : 1.5);
      drawTail(ctx, p.tail, p.tailCol, p.s);
      if (this.buffs.escudo > 0) { ctx.strokeStyle = 'rgba(167,139,250,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 1.8, 0, 7); ctx.stroke(); }
      drawKite(ctx, p.x, p.y, p.s, p.ang, p.shape, p.c, p.flash);
    }
    for (const q of this.parts) { ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.col; ctx.fillRect(q.x, q.y, q.r, q.r); }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const size = Math.round(22 * this.S * t.scale);
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.4)); ctx.font = `900 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(3, size * 0.14); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(t.txt, t.x, t.y); ctx.fillStyle = t.col; ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  bar(x, y, v, col) {
    const w = 36 * this.S, ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * clamp(v, 0, 1), 4);
  }
}
