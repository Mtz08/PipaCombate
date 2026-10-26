// Conteudo do jogo: ambientes, rivais, chefoes, power-ups. Tudo visual/jogabilidade;
// o premio e o vento sao do servidor.

export const MAPS = {
  laje:      { name: 'Laje ao Entardecer', sky: ['#2f4fb0', '#f29a6b', '#ffd59a'], sun: [0.8, 0.3, '#fff1c2'], ground: 'laje', wind: 12 },
  praia:     { name: 'Orla',               sky: ['#0b7fc9', '#55c2f0', '#dff3ff'], sun: [0.2, 0.2, '#fffbe6'], ground: 'praia', wind: 20 },
  serra:     { name: 'Serra na Neblina',   sky: ['#7aa7c7', '#c9dbe6', '#eef3f5'], sun: [0.7, 0.22, '#ffffff'], ground: 'serra', wind: 16, fog: true },
  cidade:    { name: 'Cidade Neon',        sky: ['#0a0620', '#2a0f4f', '#5b1f6e'], moon: [0.82, 0.18], ground: 'cidade', wind: 14, night: true },
  deserto:   { name: 'Dunas',              sky: ['#e27a3f', '#f4b26a', '#ffe2a8'], sun: [0.5, 0.18, '#fff3d0'], ground: 'deserto', wind: 22, heat: true },
  tempestade:{ name: 'Tempestade',         sky: ['#10151f', '#2a3344', '#46516a'], ground: 'laje', wind: 28, storm: true },
};

// shape: losango | capucheta | arraia
export const SKINS = [
  { id: 'classica', name: 'Clássica', shape: 'losango', c: ['#e63946', '#f1faee'], tail: '#e63946' },
  { id: 'canario', name: 'Canário', shape: 'losango', c: ['#ffd60a', '#1b4332'], tail: '#ffd60a' },
  { id: 'mar', name: 'Mar', shape: 'capucheta', c: ['#0077b6', '#90e0ef'], tail: '#90e0ef' },
  { id: 'brasa', name: 'Brasa', shape: 'losango', c: ['#ff7b00', '#370617'], tail: '#ffba08' },
  { id: 'neon', name: 'Neon', shape: 'arraia', c: ['#14002e', '#00f5d4'], tail: '#f15bb5' },
  { id: 'ouro', name: 'Ouro', shape: 'arraia', c: ['#1a1a1a', '#ffc300'], tail: '#ffc300' },
];
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

// Rivais um pouco mais faceis que a referencia (str/agg menores). Igual em TODO round.
export const RIVALS = {
  moleque:  { name: 'Moleque',  shape: 'losango',   hp: 1,   str: 0.85, spd: 1,    agg: 0.85, from: 1 },
  veloz:    { name: 'Veloz',    shape: 'capucheta', hp: 0.6, str: 0.75, spd: 1.4,  agg: 0.95, from: 3 },
  aparador: { name: 'Aparador', shape: 'losango',   hp: 0.9, str: 0.7,  spd: 1.2,  agg: 0.3,  from: 3, thief: true },
  pesadao:  { name: 'Pesadão',  shape: 'arraia',    hp: 2.1, str: 1.05, spd: 0.75, agg: 0.7,  from: 4 },
  cortador: { name: 'Cortador', shape: 'capucheta', hp: 0.8, str: 1.2,  spd: 1.1,  agg: 1.3,  from: 6 },
};
export const RIVAL_COLORS = [['#2563eb', '#f8fafc'], ['#16a34a', '#0f172a'], ['#9333ea', '#fde047'], ['#0891b2', '#f43f5e'], ['#f8fafc', '#111827'], ['#db2777', '#fdf2f8']];
export const BOSSES = [
  { name: 'DONO DA LAJE', shape: 'arraia', hp: 240, str: 1.1, spd: 1.05, c: ['#0f172a', '#ef4444'] },
  { name: 'REI DA SERRA', shape: 'arraia', hp: 320, str: 1.2, spd: 1, c: ['#78350f', '#fbbf24'], summon: true },
  { name: 'SENHOR DOS VENTOS', shape: 'arraia', hp: 400, str: 1.3, spd: 1.15, c: ['#4c1d95', '#22d3ee'], summon: true, gust: true },
];
export const POWERS = {
  vento: { name: 'VENTO!', color: '#7dd3fc', dur: 8 },
  ouro: { name: 'LINHA DE OURO!', color: '#facc15', dur: 8 },
  escudo: { name: 'ESCUDO!', color: '#a78bfa', dur: 6 },
};
export const CUT_TXT = ['CORTOU!', 'NO GRAU!', 'LÁ SE VAI!', 'VOOU!', 'TCHAU!', 'MANDOU EMBORA!'];
