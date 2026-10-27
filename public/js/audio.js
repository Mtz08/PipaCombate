/* Pipa Combate — áudio 100% sintetizado (WebAudio) + narrador/torcida (voz do aparelho).
   Trilha: funk leve (tamborzão) procedural. Efeitos: cartoon + realistas. */

let ac = null, master, sfxBus, musBus, musFilter, delay, noiseBuf;
const loops = {};
const opt = { sfx: true, music: true };
const R = (a, b) => a + Math.random() * (b - a);

/* ---------- primitivas ---------- */
function env(g, T, a, v, d) {
  g.gain.setValueAtTime(.0001, T);
  g.gain.exponentialRampToValueAtTime(Math.max(.0002, v), T + a);
  g.gain.exponentialRampToValueAtTime(.0001, T + a + d);
}
function tone({ f = 440, f2 = 0, type = 'sine', t = 0, at = 0, a = .005, d = .2, v = .2, dest, filt = 0, q = 1, det = 0, send = 0, vib = 0 }) {
  if (!ac) return;
  const T = at || ac.currentTime + t;
  const o = ac.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, T);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), T + a + d);
  if (det) o.detune.value = det;
  if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 9; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(T); l.stop(T + a + d + .05); }
  const g = ac.createGain(); env(g, T, a, v, d);
  let n = o;
  if (filt) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filt; fl.Q.value = q; o.connect(fl); n = fl; }
  n.connect(g).connect(dest || sfxBus);
  if (send) { const s = ac.createGain(); s.gain.value = send; g.connect(s).connect(delay); }
  o.start(T); o.stop(T + a + d + .05);
}
function noise({ t = 0, at = 0, a = .003, d = .2, v = .2, type = 'bandpass', f = 1000, f2 = 0, q = 1, dest }) {
  if (!ac) return;
  const T = at || ac.currentTime + t;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, T);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, T + a + d);
  fl.Q.value = q;
  const g = ac.createGain(); env(g, T, a, v, d);
  s.connect(fl).connect(g).connect(dest || sfxBus);
  s.start(T, Math.random() * 1.5); s.stop(T + a + d + .05);
}
function loopNoise(type, f, q) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(); g.gain.value = 0;
  s.connect(fl).connect(g).connect(sfxBus); s.start();
  return { f: fl, g };
}

/* ---------- áudios gravados: falas e música oficial ---------- */
const AUDIO_BASE = 'audio/';
const VOZES = { vai: ['um-dois-vai', 1.1], buscar: ['manda-buscar', 1.05], saidai: ['sai-dai-braco-de-violao', 1.7], dalinha: ['da-linha-mane', 1] };
const bufs = {};
let trackGain = null, analyser = null, freqData = null, loading = false, voiceUntil = 0, lastVoice = null;
/* música oficial em streaming (<audio> ligado no WebAudio): começa na hora do primeiro toque */
let musicEl = null, musicNode = null, trackOn = false, musicFailed = false, unlockAt = 0;
function preloadMusic() {
  if (musicEl) return;
  musicEl = document.createElement('audio');
  musicEl.src = AUDIO_BASE + 'pipa-combate-brenin.mp3'; musicEl.loop = true; musicEl.preload = 'auto';
  musicEl.setAttribute('playsinline', ''); musicEl.setAttribute('webkit-playsinline', '');
  musicEl.addEventListener('error', () => { musicFailed = true; });
  musicEl.load();
}
function startTrack() {
  if (!ac || musicFailed || !opt.music) return;
  preloadMusic();
  if (!musicNode) {
    try { musicNode = ac.createMediaElementSource(musicEl); } catch (e) { musicFailed = true; return; }
    trackGain = ac.createGain(); trackGain.gain.value = .9;
    analyser = ac.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = .45; freqData = new Uint8Array(analyser.frequencyBinCount);
    musicNode.connect(trackGain); trackGain.connect(musBus); musicNode.connect(analyser);
  }
  if (!musicEl.paused) { trackOn = true; return; }
  const pr = musicEl.play();
  if (pr && pr.then) pr.then(() => { trackOn = true; }).catch(() => {}); else trackOn = true;
}
function loadBuf(name) {
  return fetch(AUDIO_BASE + name + '.mp3').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(ab => new Promise((res, rej) => ac.decodeAudioData(ab, res, rej)));
}
function loadAssets() {
  if (loading || !ac) return;
  loading = true;
  for (const k in VOZES) loadBuf(VOZES[k][0]).then(b => { bufs[k] = b; }).catch(() => {});
}
let bassAvg = 0, bassPeak = .05, beatVal = 0, beatAt = 0;
function trackBeat() {
  const now = performance.now();
  if (now - beatAt < 12) return beatVal; // calcula uma vez por quadro
  beatAt = now;
  analyser.getByteFrequencyData(freqData);
  const e = (freqData[1] + freqData[2] + freqData[3]) / 765; // graves (~80–260 Hz)
  bassAvg += (e - bassAvg) * .04; bassPeak = Math.max(bassPeak * .996, e);
  const k = (e - bassAvg) / Math.max(.06, bassPeak - bassAvg);
  beatVal = Math.max(beatVal * .84, Math.min(1, Math.max(0, k * 1.3)));
  return beatVal;
}

/* ---------- trilha reserva: funk leve (tamborzão) sintetizado ---------- */
const ROOT = [110, 110, 87.31, 98];                  // Am Am F G
const STAB = [[220, 261.63, 329.63], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];
const PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880];

const Music = {
  mode: 'menu', step: 0, nextT: 0, timer: null, motif: [],
  start() { if (this.timer || !ac) return; this.nextT = ac.currentTime + .1; this.timer = setInterval(() => this.tick(), 25); },
  newMotif() {
    this.motif = []; let i = 2;
    for (let s = 0; s < 32; s++) {
      if ((s % 2 === 0 && Math.random() < .4) || Math.random() < .06) { i = Math.max(0, Math.min(PENTA.length - 1, i + Math.round(R(-2, 2)))); this.motif.push(PENTA[i]); }
      else this.motif.push(0);
    }
  },
  tick() {
    if (!ac || ac.state !== 'running' || !opt.music || trackOn) return;
    if (!musicFailed) return; // a sintetizada é só reserva
    const bpm = this.mode === 'boss' ? 138 : this.mode === 'game' ? 130 : 124;
    const sd = 60 / bpm / 4;
    if (this.nextT < ac.currentTime - .05) this.nextT = ac.currentTime + .05;
    while (this.nextT < ac.currentTime + .15) { this.play(this.step, this.nextT, sd); this.nextT += sd; this.step++; }
  },
  play(step, t, sd) {
    if (step % 128 === 0 || !this.motif.length) this.newMotif();
    const bar = Math.floor(step / 16) % 4, s = step % 16, m = this.mode, root = ROOT[bar];
    const boss = m === 'boss', menu = m === 'menu', k = menu ? .78 : 1;
    const mel = this.motif[(Math.floor(step / 16) % 2) * 16 + s];
    const h = s % 8; // tamborzão 3-3-2: TU ta ta | TU ta ta | TA u
    if (h === 0 || h === 3) { kick(t, (h === 0 ? .95 : .75) * k); tom(t, false, .42 * k); bass(root, t, sd * 2.2, .13 * k); }
    if (h === 1 || h === 2 || h === 4 || h === 5) tom(t, true, (h === 1 || h === 4 ? .34 : .24) * k);
    if (h === 6) { clap(t, k); tom(t, true, .26 * k); }
    if (h === 7) { tom(t, false, .34 * k); kick(t, .3 * k); }
    if (s % 2 === 0) hat(t, (s % 4 === 2 ? .05 : .028) * k);
    if (boss && (s === 8 || s === 12)) kick(t, .6);
    if (!menu && s === 0 && (bar === 0 || bar === 2)) stab(STAB[bar], t);
    if (boss && s === 0 && bar % 2 === 0) siren(t, sd * 16);
    if (mel && !boss && step % 64 >= 32) pluck(mel, t, .04);
  },
};
const kicks = [];
function kick(at, v) {
  kicks.push(at); if (kicks.length > 16) kicks.shift(); tone({ at, f: 160, f2: 42, d: .28, v, dest: musBus }); tone({ at, f: 900, f2: 200, d: .02, v: v * .3, type: 'triangle', dest: musBus }); }
function clap(at, k) {
  for (let i = 0; i < 3; i++) noise({ at: at + i * .011, d: .03, v: .2 * k, f: 1500, q: .9, dest: musBus });
  noise({ at: at + .033, d: .15, v: .12 * k, f: 1300, q: .8, dest: musBus });
}
function tom(at, hi, v = .32) { tone({ at, f: hi ? 290 : 170, f2: hi ? 200 : 110, d: hi ? .11 : .16, v, dest: musBus }); noise({ at, d: .018, v: v * .28, f: hi ? 2400 : 1500, q: 2, dest: musBus }); }
function hat(at, v) { noise({ at, d: .035, v, type: 'highpass', f: 8000, dest: musBus }); }
function agogo(at, hi) { tone({ at, f: hi ? 1175 : 880, type: 'triangle', d: .1, v: .045, dest: musBus }); tone({ at, f: (hi ? 1175 : 880) * 2.76, type: 'sine', d: .05, v: .012, dest: musBus }); }
function bass(f, at, d, v) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f * 1.6, at); o.frequency.exponentialRampToValueAtTime(f, at + .045);
  env(g, at, .006, v * 1.6, d); o.connect(g).connect(musBus); o.start(at); o.stop(at + d + .06);
  tone({ at, f: f * 2, type: 'triangle', d, v: v * .35, dest: musBus });
}
function stab(ch, at) { for (const f of ch) tone({ at, f, type: 'sawtooth', a: .01, d: .16, v: .03, filt: 1800, dest: musBus, send: .25 }); }
function siren(at, d) {
  const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
  o.type = 'square'; fl.type = 'lowpass'; fl.frequency.value = 1600;
  o.frequency.setValueAtTime(600, at);
  for (let i = 0; i < 4; i++) { o.frequency.linearRampToValueAtTime(1150, at + d * (i + .5) / 4); o.frequency.linearRampToValueAtTime(600, at + d * (i + 1) / 4); }
  g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.018, at + .1); g.gain.setValueAtTime(.018, at + d - .2); g.gain.exponentialRampToValueAtTime(.0001, at + d);
  o.connect(fl).connect(g).connect(musBus); o.start(at); o.stop(at + d + .05);
}
function pluck(f, at, v) { tone({ at, f, type: 'triangle', d: .26, v, dest: musBus, send: .5 }); }

/* iPhone com a chave do silencioso: tocar um <audio> mudo faz o WebAudio sair no alto-falante */
let iosEl = null;
function unmuteIOS() {
  if (iosEl || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
  const n = 800, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer), str = (o, t) => [...t].forEach((ch, i) => buf[o + i] = ch.charCodeAt(0));
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); str(36, 'data'); dv.setUint32(40, n, true);
  buf.fill(128, 44);
  let b64 = ''; buf.forEach(v => b64 += String.fromCharCode(v));
  iosEl = document.createElement('audio'); iosEl.src = 'data:audio/wav;base64,' + btoa(b64); iosEl.loop = true; iosEl.setAttribute('playsinline', ''); iosEl.volume = .01;
  iosEl.play().catch(() => { iosEl = null; });
}

/* ---------- API de som ---------- */
export const Sound = {
  running() { return !!ac && ac.state === 'running'; },
  sleep() { if (ac && ac.state === 'running') ac.suspend(); if (musicEl && !musicEl.paused) { musicEl.pause(); trackOn = false; } },
  preload() { preloadMusic(); },
  musicState() { return { on: trackOn, failed: musicFailed, t: musicEl ? +musicEl.currentTime.toFixed(1) : 0 }; },
  init() {
    unmuteIOS();
    if (ac) { if (ac.state !== 'running') ac.resume().catch(() => {}); startTrack(); loadAssets(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    try { ac = new C(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = .9;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = opt.sfx ? 1 : 0; sfxBus.connect(master);
    musFilter = ac.createBiquadFilter(); musFilter.type = 'lowpass'; musFilter.frequency.value = 18000;
    musBus = ac.createGain(); musBus.gain.value = opt.music ? .36 : 0; musBus.connect(musFilter).connect(master);
    delay = ac.createDelay(1); delay.delayTime.value = .24;
    const fb = ac.createGain(); fb.gain.value = .3; const wet = ac.createGain(); wet.gain.value = .3;
    delay.connect(fb).connect(delay); delay.connect(wet).connect(musBus);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (ac.state !== 'running') ac.resume().catch(() => {});
    loops.grind = loopNoise('bandpass', 3500, 1.4);
    loops.wind = loopNoise('lowpass', 500, .7);
    loops.rain = loopNoise('highpass', 1600, .4);
    loops.crowd = loopNoise('bandpass', 650, .9);
    // "zzz" da linha raspando: dente-de-serra filtrada
    const ro = ac.createOscillator(), rf = ac.createBiquadFilter(), rg = ac.createGain();
    ro.type = 'sawtooth'; ro.frequency.value = 95; rf.type = 'bandpass'; rf.frequency.value = 1800; rf.Q.value = 3; rg.gain.value = 0;
    ro.connect(rf).connect(rg).connect(sfxBus); ro.start();
    loops.rasp = { o: ro, g: rg };
    unlockAt = performance.now();
    startTrack();
    Music.start();
    loadAssets();
  },
  config(o) {
    Object.assign(opt, o);
    if (!ac) return;
    const T = ac.currentTime;
    sfxBus.gain.setTargetAtTime(opt.sfx ? 1 : 0, T, .05);
    musBus.gain.setTargetAtTime(opt.music ? .36 : 0, T, .1);
    if (opt.music) { Music.start(); startTrack(); } else if (musicEl && !musicEl.paused) { musicEl.pause(); trackOn = false; }
  },
  music(mode) { Music.mode = mode; },
  /* pulso do grave (0..1) para bonequinhos e caixa de som dançarem no ritmo */
  beat() {
    if (analyser && trackOn && opt.music && ac.state === 'running') return trackBeat();
    if (ac && opt.music && ac.state === 'running') {
      const now = ac.currentTime; let lastK = -1;
      for (const k of kicks) if (k <= now && k > lastK) lastK = k;
      if (lastK >= 0 && now - lastK < 1) return Math.exp(-(now - lastK) * 9);
    }
    const ph = (performance.now() / 1000 * 126 / 60) % 1; // sem música: batida imaginária
    return Math.exp(-ph * 7) * .6;
  },
  muffle(on) { if (ac) musFilter.frequency.setTargetAtTime(on ? 650 : 18000, ac.currentTime, .15); },

  /* loops contínuos */
  grind(level, ratio = .5) {
    if (!ac) return;
    const T = ac.currentTime;
    loops.grind.g.gain.setTargetAtTime(level * .18, T, .03);
    loops.grind.f.frequency.setTargetAtTime(2200 + ratio * 4000, T, .05);
    loops.rasp.g.gain.setTargetAtTime(level * .05, T, .03);
    loops.rasp.o.frequency.setTargetAtTime(80 + ratio * 70 + Math.random() * 20, T, .02);
  },
  wind(v) { if (!ac) return; const T = ac.currentTime; loops.wind.g.gain.setTargetAtTime(v * .1, T, .2); loops.wind.f.frequency.setTargetAtTime(300 + v * 1100, T, .2); },
  rain(v) { if (ac) loops.rain.g.gain.setTargetAtTime(v * .07, ac.currentTime, .5); },
  crowdAmb(v) { if (ac) loops.crowd.g.gain.setTargetAtTime(v * .035, ac.currentTime, .6); },
  /* fala gravada; abaixa a música enquanto fala. prio 2 interrompe outra fala */
  voice(name, prio = 1) {
    if (!ac || !opt.sfx || !bufs[name] || ac.state !== 'running') return false;
    const now = ac.currentTime, b = bufs[name];
    if (now < voiceUntil && prio < 2) return false;
    if (lastVoice) try { lastVoice.stop(); } catch (e) {}
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = b; g.gain.value = VOZES[name][1];
    src.connect(g).connect(sfxBus); src.start();
    lastVoice = src; voiceUntil = now + b.duration;
    if (opt.music) { musBus.gain.cancelScheduledValues(now); musBus.gain.setTargetAtTime(.2, now, .12); musBus.gain.setTargetAtTime(.36, now + b.duration - .15, .35); }
    return true;
  },
  hasVoice(name) { return !!bufs[name]; },
  silence() { this.grind(0); this.wind(0); this.rain(0); this.crowdAmb(0); },

  /* interface (cartoon) */
  click()   { tone({ f: 620, f2: 760, type: 'triangle', d: .05, v: .12 }); },
  tap()     { tone({ f: 880, type: 'triangle', d: .05, v: .1 }); tone({ f: 1320, type: 'triangle', t: .04, d: .07, v: .08 }); },
  pop()     { tone({ f: 950, f2: 320, d: .07, v: .14 }); },
  boing()   { tone({ f: 190, f2: 560, d: .12, v: .14, vib: 18 }); tone({ f: 560, f2: 230, t: .12, d: .2, v: .1, vib: 25 }); },
  whoosh()  { noise({ f: 500, f2: 2600, q: 1.4, d: .2, v: .12 }); },
  back()    { tone({ f: 540, f2: 380, type: 'triangle', d: .08, v: .1 }); },
  deny()    { tone({ f: 200, type: 'square', d: .08, v: .06, filt: 900 }); tone({ f: 160, type: 'square', t: .09, d: .12, v: .06, filt: 900 }); },
  tick()    { tone({ f: 1400 + Math.random() * 300, type: 'square', d: .025, v: .03, filt: 4000 }); },
  _ci: 0, _ct: 0,
  coin() {
    if (!ac) return;
    const now = ac.currentTime;
    this._ci = now - this._ct < .5 ? Math.min(this._ci + 1, 14) : 0; this._ct = now;
    const f = 988 * Math.pow(2, this._ci / 12);
    tone({ f, type: 'square', d: .045, v: .04, filt: 5000 }); tone({ f: f * 1.5, type: 'square', t: .04, d: .11, v: .04, filt: 5000 });
  },
  buy()     { [1319, 1568, 2093].forEach((f, i) => tone({ f, type: 'square', t: i * .05, d: .12, v: .05, filt: 6000 })); noise({ type: 'highpass', f: 6000, d: .3, v: .06 }); },

  /* jogo */
  snap()    { noise({ type: 'highpass', f: 3500, d: .05, v: .38 }); tone({ f: 1900, f2: 180, type: 'square', d: .09, v: .05, filt: 5000 }); },
  cut(big) {
    this.snap();
    noise({ f: 3000, f2: 450, q: .8, t: .02, d: .32, v: .28 });
    tone({ f: 280, f2: 70, type: 'sawtooth', d: .3, v: .1, filt: 1800 });
    if (big) { tone({ f: 120, f2: 32, d: .8, v: .55 }); noise({ type: 'lowpass', f: 500, f2: 120, d: .9, v: .3 }); }
  },
  fall()    { tone({ f: 1500, f2: 330, d: .95, v: .045, vib: 30, t: .1 }); },
  flap()    { noise({ f: 1500 + Math.random() * 500, q: 2.2, d: .025, v: .045 }); },
  cheer(k = 1) {
    for (let i = 0; i < 6; i++) noise({ type: 'bandpass', f: R(500, 1300), f2: R(900, 2300), q: 4, a: .07, d: R(.8, 1.3), v: .05 * k, t: Math.random() * .12 });
    for (let i = 0; i < 5; i++) tone({ f: R(240, 420), f2: R(480, 820), type: 'sawtooth', a: .08, d: R(.5, .8), v: .012 * k, filt: 1500, t: Math.random() * .15 });
  },
  aww()     { for (let i = 0; i < 5; i++) tone({ f: R(380, 520), f2: R(200, 260), type: 'sawtooth', a: .1, d: 1, v: .012, filt: 1200, t: Math.random() * .1 }); noise({ f: 700, f2: 400, q: 2, a: .1, d: 1, v: .04 }); },
  catch()   { [784, 1047, 1319, 1568].forEach((f, i) => tone({ f, type: 'triangle', t: i * .055, d: .18, v: .12 })); },
  streak()  { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'sawtooth', t: i * .05, d: .16, v: .06, filt: 3200 })); },
  power()   { tone({ f: 300, f2: 1400, d: .3, v: .16 }); [1047, 1319, 1568].forEach((f, i) => tone({ f, type: 'triangle', t: .12 + i * .05, d: .15, v: .08 })); },
  lose()    { tone({ f: 440, f2: 110, type: 'sawtooth', d: .8, v: .11, filt: 1500 }); tone({ f: 330, f2: 82, type: 'triangle', t: .1, d: .8, v: .12 }); },
  waveStart() { tone({ f: 2100, d: .1, v: .1 }); for (let i = 0; i < 8; i++) tone({ f: i % 2 ? 2250 : 2050, t: .16 + i * .045, d: .04, v: .09 }); },
  waveClear() { [659, 784, 988, 1319].forEach((f, i) => tone({ f, type: 'triangle', t: i * .08, d: .22, v: .12 })); },
  bossWarn() {
    for (let i = 0; i < 3; i++) { tone({ f: 440, f2: 660, type: 'sawtooth', t: i * .5, d: .25, v: .09, filt: 1600 }); tone({ f: 660, f2: 440, type: 'sawtooth', t: i * .5 + .25, d: .25, v: .09, filt: 1600 }); }
    tone({ f: 55, d: 1.5, a: .1, v: .3 });
  },
  dash()    { noise({ f: 400, f2: 3500, q: 1.5, d: .25, v: .3 }); tone({ f: 200, f2: 620, d: .2, v: .12 }); },
  chegada() { noise({ type: 'lowpass', f: 1400, f2: 200, d: .25, v: .45 }); tone({ f: 170, f2: 45, d: .35, v: .45 }); },
  gust()    { noise({ type: 'lowpass', f: 300, f2: 1300, a: .5, d: 1.8, v: .22 }); },
  steal()   { tone({ f: 700, f2: 300, type: 'square', d: .22, v: .06, filt: 2000 }); },
  thunder() { noise({ type: 'highpass', f: 2500, d: .12, v: .25 }); noise({ type: 'lowpass', f: 260, f2: 60, t: .05, a: .05, d: 2.2, v: .55 }); tone({ f: 48, f2: 30, t: .05, d: 1.6, v: .35 }); },
  cashout() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone({ f, type: 'square', t: i * .06, d: .14, v: .05, filt: 6000 }));
    for (let i = 0; i < 10; i++) tone({ f: 2000 + Math.random() * 1500, type: 'triangle', t: .3 + i * .05, d: .08, v: .05 });
    tone({ f: 523, type: 'triangle', t: .3, a: .02, d: .8, v: .1 }); tone({ f: 659, type: 'triangle', t: .3, a: .02, d: .8, v: .08 });
  },
  mult(n) { const f = 523 * Math.pow(2, Math.min(n, 24) / 12); tone({ f, type: 'triangle', d: .1, v: .12 }); tone({ f: f * 1.5, type: 'triangle', t: .07, d: .16, v: .1 }); },
};
