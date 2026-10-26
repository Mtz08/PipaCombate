// Efeitos sonoros sintetizados com Web Audio (sem arquivos de audio).
// O navegador so libera audio apos um gesto do usuario: unlock() no 1o clique.

let ctx = null;
let muted = false;
try { muted = localStorage.getItem('pc_muted') === '1'; } catch {}

export const Sound = {
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('pc_muted', muted ? '1' : '0'); } catch {}
    return muted;
  },
  unlock() {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  },
  launch: () => sweep(220, 520, 0.5, 'triangle', 0.08),
  whoosh: () => noise(0.35, 0.05, 900),
  cut: () => { noise(0.12, 0.12, 3000); sweep(600, 1200, 0.15, 'square', 0.05); },
  lose: () => { noise(0.2, 0.1, 1500); sweep(500, 90, 0.7, 'sawtooth', 0.06); },
  cashout: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, i * 0.09)),
  click: () => tone(880, 0.04, 'square', 0.03),
};

function ready() {
  if (muted || !ctx) return false;
  if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return false; } // sem gesto ainda: pula este som
  return true;
}

function envelope(gainNode, start, dur, vol) {
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + dur);
}

function tone(freq, dur, type, vol, delay = 0) {
  if (!ready()) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  envelope(g, t0, dur, vol);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function sweep(from, to, dur, type, vol) {
  if (!ready()) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  envelope(g, t0, dur, vol);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, vol, cutoff) {
  if (!ready()) return;
  const t0 = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff;
  envelope(g, t0, dur, vol);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

// ---------- musica (sequenciador sintetizado) e narracao ----------

let musicTimer = null, step = 0;
const BASS = [55, 0, 55, 65.4, 0, 73.4, 0, 65.4, 49, 0, 49, 58.3, 0, 65.4, 0, 58.3];
const CHORDS = [[220, 277, 330], [196, 247, 294]];

Sound.music = (on) => {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (!on) return;
  step = 0;
  musicTimer = setInterval(() => { // ~115 bpm em semicolcheias
    if (!ready()) return;
    const s = step++ % 16, bar = Math.floor(step / 16) % 2;
    if (BASS[s]) tone(BASS[s] * (bar ? 0.89 : 1), 0.18, 'triangle', 0.07);
    if (s % 2 === 0) noise(0.04, s % 4 === 0 ? 0.03 : 0.015, 7000); // chimbal
    if (s === 4 || s === 12) noise(0.08, 0.05, 1800);                // caixa
    if (s === 0 || s === 10) CHORDS[bar].forEach((f) => tone(f, 0.12, 'square', 0.012));
  }, 130);
};

let lastSpeech = 0;
/** Narrador com a voz pt-BR do navegador. Frases curtas, sem atropelar. */
Sound.say = (text, force = false) => {
  if (muted || !window.speechSynthesis) return;
  const now = Date.now();
  if (!force && now - lastSpeech < 2500) return;
  lastSpeech = now;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR'; u.rate = 1.15; u.pitch = 1.1; u.volume = 0.9;
  const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('pt'));
  if (v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
};
