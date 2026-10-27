/* Pipa Combate — conteúdo do jogo: pipas, rivais, cenários, power-ups, bonequinhos */

/* saldo real, em centavos */
export const money = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Pipas (escolha livre) ----------
   shape: raia | capucheta | papagaio | arraia
   pat:   split | cross | bands | diag | star | dots | masson | arco */
export const SKINS = [
  { id: 'classica',  nome: 'Clássica',  shape: 'raia',      c1: '#e11d48', c2: '#f8fafc', pat: 'split' },
  { id: 'canarinho', nome: 'Canarinho', shape: 'raia',      c1: '#16a34a', c2: '#facc15', pat: 'cross' },
  { id: 'noturna',   nome: 'Noturna',   shape: 'raia',      c1: '#1e1b4b', c2: '#a855f7', pat: 'bands' },
  { id: 'fogo',      nome: 'Fogo',      shape: 'raia',      c1: '#ea580c', c2: '#fde047', pat: 'star' },
  { id: 'oceano',    nome: 'Oceano',    shape: 'capucheta', c1: '#0369a1', c2: '#67e8f9', pat: 'cross' },
  { id: 'tigre',     nome: 'Tigre',     shape: 'raia',      c1: '#f97316', c2: '#111827', pat: 'diag' },
  { id: 'arco',      nome: 'Arco-íris', shape: 'papagaio',  c1: '#ffffff', c2: '#ffffff', pat: 'arco' },
  { id: 'ouro',      nome: 'Ouro',      shape: 'papagaio',  c1: '#111827', c2: '#fbbf24', pat: 'star' },
  { id: 'arraia',    nome: 'Arraia',    shape: 'arraia',    c1: '#0f172a', c2: '#22d3ee', pat: 'diag' },
  { id: 'masson',    nome: 'Masson',    shape: 'raia',      c1: '#0a0a0a', c2: '#e5e7eb', pat: 'masson' },
  // pipas de time (uso licenciado): escudo no centro
  { id: 'rubronegra',  nome: 'Flamengo',      shape: 'raia',      c1: '#c8102e', c2: '#111111', pat: 'bands', time: 'flamengo' },
  { id: 'alvinegra',   nome: 'Corinthians',   shape: 'papagaio',  c1: '#111111', c2: '#f8fafc', pat: 'split', time: 'corinthians' },
  { id: 'alviverde',   nome: 'Palmeiras',     shape: 'capucheta', c1: '#006437', c2: '#f8fafc', pat: 'cross', time: 'palmeiras' },
  { id: 'albiceleste', nome: 'Argentina',     shape: 'raia',      c1: '#75aadb', c2: '#f8fafc', pat: 'bands', time: 'argentina' },
  { id: 'cruzmaltina', nome: 'Vasco',         shape: 'raia',      c1: '#111111', c2: '#f8fafc', pat: 'diag',  time: 'vasco' },
  { id: 'tricolor',    nome: 'São Paulo',     shape: 'arraia',    c1: '#d50000', c2: '#f8fafc', pat: 'bands', time: 'saopaulo' },
  { id: 'colorada',    nome: 'Internacional', shape: 'capucheta', c1: '#d00000', c2: '#f8fafc', pat: 'star',  time: 'internacional' },
  { id: 'canarinha',   nome: 'Brasil',        shape: 'papagaio',  c1: '#fcd116', c2: '#009c3b', pat: 'cross', time: 'brasil' },
];

/* ---------- Rivais (chave = tipo usado no cálculo da % no servidor) ---------- */
export const ENEMIES = {
  moleque:  { nome: 'Moleque',  desc: 'Rival comum, equilibrado',                  shape: 'raia',      hp: 1,   str: 1,    spd: 1,    agg: 1,   rel: 1,   sc: 1,    from: 1 },
  veloz:    { nome: 'Veloz',    desc: 'Rápido e frágil, difícil de alcançar',      shape: 'capucheta', hp: .6,  str: .85,  spd: 1.45, agg: 1.1, rel: 1.4, sc: .82,  from: 3 },
  aparador: { nome: 'Aparador', desc: 'Rouba as pipas que caem antes de você',     shape: 'raia',      hp: .9,  str: .8,   spd: 1.25, agg: .3,  rel: 1,   sc: .95,  from: 3, thief: true },
  pesadao:  { nome: 'Pesadão',  desc: 'Lento, mas a linha aguenta muito',          shape: 'papagaio',  hp: 2.3, str: 1.25, spd: .72,  agg: .8,  rel: .8,  sc: 1.25, from: 4 },
  cortador: { nome: 'Cortador', desc: 'Agressivo, linha forte: cuidado na cruzada', shape: 'capucheta', hp: .8,  str: 1.45, spd: 1.15, agg: 1.6, rel: 1.3, sc: .9,   from: 6, redline: true },
};
export const ENEMY_LOOKS = [
  { c1: '#2563eb', c2: '#f8fafc', pat: 'split' }, { c1: '#16a34a', c2: '#0f172a', pat: 'cross' },
  { c1: '#f97316', c2: '#1e3a8a', pat: 'bands' }, { c1: '#9333ea', c2: '#fde047', pat: 'split' },
  { c1: '#0891b2', c2: '#f43f5e', pat: 'cross' }, { c1: '#facc15', c2: '#dc2626', pat: 'star' },
  { c1: '#f8fafc', c2: '#0f172a', pat: 'bands' }, { c1: '#db2777', c2: '#fdf2f8', pat: 'dots' },
];
export const THIEF_LOOK = { c1: '#14532d', c2: '#fde047', pat: 'dots' };
export const CUTTER_LOOK = { c1: '#7f1d1d', c2: '#fca5a5', pat: 'diag' };

export const BOSSES = [
  { nome: 'CHEFÃO DA LAJE', shape: 'arraia',   hp: 260, str: 1.2,  spd: 1.1, look: { c1: '#0f172a', c2: '#ef4444', pat: 'star' },  abil: ['enrage'] },
  { nome: 'REI DO MORRO',   shape: 'papagaio', hp: 340, str: 1.3,  spd: 1,   look: { c1: '#78350f', c2: '#fbbf24', pat: 'diag' },  abil: ['enrage', 'summon'] },
  { nome: 'DONO DO CÉU',    shape: 'arraia',   hp: 420, str: 1.45, spd: 1.2, look: { c1: '#4c1d95', c2: '#22d3ee', pat: 'cross' }, abil: ['enrage', 'summon', 'gust'] },
];

export const NOMES = ['Zé', 'Juninho', 'Tião', 'Biel', 'Kauã', 'Dudu', 'Nando', 'Tico', 'Léo', 'Pedrinho', 'Rafa', 'Vini',
  'Caio', 'Luan', 'Bruninho', 'Tuca', 'Gui', 'Mateus', 'Davi', 'Enzo', 'Cadu', 'Nego', 'Buiú', 'Pará'];

/* ---------- Cenários (todos liberados) ---------- */
export const MAPS = [
  { id: 'laje', ic: '🏠', nome: 'Laje do Bairro', desc: 'Fim de tarde clássico', diff: 1, wind: 12, gust: 1,
    sky: ['#2750b8', '#5fa8ee', '#ffd89b', '#ffab66'], sun: { x: .82, y: .3, r: 46, c: '#fff4c7', g: '255,220,140' },
    far: 'morrinhos', farCol: 'rgba(96,120,170,.55)', style: 'favela' },
  { id: 'campinho', ic: '⚽', nome: 'Campinho de Várzea', desc: 'Domingo de manhã no campo', diff: 1.05, wind: 14, gust: 1.1,
    sky: ['#1d6fd6', '#6cb8f5', '#cfe9ff', '#fff1c1'], sun: { x: .14, y: .17, r: 38, c: '#fffbe0', g: '255,245,200' },
    far: 'morrinhos', farCol: 'rgba(70,130,110,.55)', style: 'campo' },
  { id: 'morro', ic: '🌄', nome: 'Morro ao Pôr do Sol', desc: 'Vento forte e rivais bravos', diff: 1.15, wind: 18, gust: 1.3,
    sky: ['#2b1650', '#8e3a78', '#f2735d', '#ffc36e'], sun: { x: .22, y: .6, r: 60, c: '#ffe0a3', g: '255,150,90' },
    far: 'morro', farCol: 'rgba(70,40,90,.6)', style: 'favela' },
  { id: 'praia', ic: '🏖️', nome: 'Orla da Praia', desc: 'Rajadas de vento do mar', diff: 1.3, wind: 26, gust: 1.8,
    sky: ['#0284c7', '#38bdf8', '#bae6fd', '#fef3c7'], sun: { x: .78, y: .2, r: 40, c: '#fffbe6', g: '255,250,220' },
    far: 'mar', farCol: 'rgba(60,110,150,.75)', style: 'predios' },
  { id: 'tempestade', ic: '⛈️', nome: 'Tempestade', desc: 'Chuva, raios e rajadas brutais', diff: 1.4, wind: 30, gust: 2.2,
    sky: ['#111827', '#283548', '#3d4a5c', '#5b6574'], far: 'morrinhos', farCol: 'rgba(20,28,40,.75)', style: 'favela', storm: true },
  { id: 'noite', ic: '🌙', nome: 'Noite de Lua', desc: 'Só os brabos voam à noite', diff: 1.5, wind: 16, gust: 1.2,
    sky: ['#020617', '#0b1a3d', '#1e2e5c', '#3b3f7a'], moon: { x: .8, y: .22, r: 34 },
    far: 'morrinhos', farCol: 'rgba(15,23,50,.9)', style: 'favela', night: true },
];

/* ---------- Power-ups ---------- */
export const POW = {
  vento:  { nome: 'VENTO!',         col: '#7dd3fc', dur: 8 },
  ouro:   { nome: 'LINHA DE OURO!', col: '#facc15', dur: 8 },
  escudo: { nome: 'ESCUDO!',        col: '#a78bfa', dur: 6 },
};
export const POW_BAG = ['vento', 'ouro', 'escudo'];

/* ---------- Bonequinhos (personalização, tudo grátis) ---------- */
export const PELES = ['#4a2c17', '#6b3e1f', '#8d5524', '#a8693a', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac'];
export const CORES = ['#e11d48', '#f97316', '#facc15', '#16a34a', '#0ea5e9', '#2563eb', '#7c3aed', '#db2777', '#f8fafc', '#111827', '#78350f', '#0f766e'];
export const CORES_CABELO = ['#1c1917', '#3b2314', '#7c4a1e', '#b45309', '#d6a14b', '#f5e6a8', '#2563eb', '#db2777', '#16a34a'];
/* Mantos: camisas de time (uso licenciado). escudo = id em marcas.js;
   fornecedor = marca do material esportivo (conferir os contratos vigentes).
   pat: gola (lisa com gola/frisos) | hoops (listras horizontais) | stripes (verticais)
        | sash (faixa diagonal) | band (faixa no peito c2/c3/c2) | tri (verticais c1/c2/c3) */
export const MANTOS = [
  { id: 'livre',       nome: 'Cores livres' },
  { id: 'rubronegro',  nome: 'Flamengo',      c1: '#c8102e', c2: '#111111', pat: 'hoops',   escudo: 'flamengo',      fornecedor: 'adidas' },
  { id: 'alvinegro',   nome: 'Corinthians',   c1: '#f8fafc', c2: '#111111', pat: 'gola',    escudo: 'corinthians',   fornecedor: 'nike' },
  { id: 'canarinho',   nome: 'Brasil',        c1: '#fcd116', c2: '#009c3b', pat: 'gola',    escudo: 'brasil',        fornecedor: 'nike' },
  { id: 'albiceleste', nome: 'Argentina',     c1: '#f8fafc', c2: '#75aadb', pat: 'stripes', escudo: 'argentina',     fornecedor: 'adidas' },
  { id: 'tricolor',    nome: 'São Paulo',     c1: '#f8fafc', c2: '#d50000', c3: '#111111', pat: 'band', escudo: 'saopaulo' },
  { id: 'alviverde',   nome: 'Palmeiras',     c1: '#006437', c2: '#f8fafc', pat: 'gola',    escudo: 'palmeiras' },
  { id: 'cruzmaltino', nome: 'Vasco',         c1: '#111111', c2: '#f8fafc', pat: 'sash',    escudo: 'vasco' },
  { id: 'estrela',     nome: 'Botafogo',      c1: '#111111', c2: '#f8fafc', pat: 'stripes', escudo: 'botafogo' },
  { id: 'tricolorrj',  nome: 'Fluminense',    c1: '#7a0a2a', c2: '#00613c', c3: '#f8fafc', pat: 'tri', escudo: 'fluminense', fornecedor: 'umbro' },
  { id: 'colorado',    nome: 'Internacional', c1: '#d00000', c2: '#f8fafc', pat: 'gola',    escudo: 'internacional', fornecedor: 'adidas' },
  { id: 'celeste',     nome: 'Cruzeiro',      c1: '#1d4ed8', c2: '#f8fafc', pat: 'gola',    escudo: 'cruzeiro',      fornecedor: 'adidas' },
  { id: 'laranja',     nome: 'Holanda',       c1: '#f36c21', c2: '#111111', pat: 'gola',    escudo: 'holanda',       fornecedor: 'nike' },
];
export const mantoById = id => MANTOS.find(m => m.id === id) || MANTOS[0];

export const KID = {
  manto:      MANTOS.map(m => [m.id, m.nome]),
  cabelo:     [['bone', 'Boné aba reta'], ['bonetras', 'Boné pra trás'], ['nevou', 'Nevou (luzes)'], ['disfarcado', 'Disfarçado c/ risco'], ['curto', 'Degradê'],
               ['cacheado', 'Cacheado'], ['black', 'Black power'], ['moicano', 'Moicano'], ['trancas', 'Tranças'], ['liso', 'Liso'], ['raspado', 'Raspado'], ['bandana', 'Bandana'], ['careca', 'Careca']],
  olhos:      [['normal', 'Normal'], ['feliz', 'Sorridente'], ['bravo', 'Bravo'], ['sono', 'Sonolento'], ['estrela', 'Estrela']],
  sobrancelha:[['normal', 'Normal'], ['risco', 'Com risquinho'], ['grossa', 'Grossa'], ['brava', 'Brava'], ['nenhuma', 'Nenhuma']],
  barba:      [['nenhuma', 'Nenhuma'], ['rala', 'Barba rala'], ['bigode', 'Bigodinho fino'], ['cavanhaque', 'Cavanhaque'], ['desenhada', 'Barba desenhada'], ['barba', 'Barba cheia']],
  olhoCor:    [['castanho', 'Castanho'], ['preto', 'Preto'], ['mel', 'Mel'], ['verde', 'Verde'], ['azul', 'Azul']],
  boca:       [['sorriso', 'Sorriso'], ['ouro', 'Dente de ouro'], ['serio', 'Sério'], ['lingua', 'Língua de fora']],
  marca:      [['nenhuma', 'Nenhuma'], ['sardas', 'Sardas'], ['curativo', 'Curativo'], ['pinta', 'Pinta']],
  top:        [['time', 'Camisa de time'], ['regata', 'Regata de time'], ['semcamisa', 'Sem camisa'], ['moletom', 'Moletom'], ['lisa', 'Camiseta'], ['listrada', 'Listrada'], ['cortavento', 'Corta-vento']],
  bermuda:    [['tactel', 'Tactel listrada'], ['lisa', 'Lisa'], ['estampada', 'Estampada']],
  calcado:    [['mola', 'Tênis de mola'], ['tenis', 'Tênis'], ['meiachinelo', 'Meião + chinelo'], ['chinelo', 'Chinelo'], ['bota', 'Bota']],
  oculos:     [['nenhum', 'Nenhum'], ['juliete', 'Juliete'], ['escuro', 'Escuro'], ['redondo', 'Redondo'], ['neon', 'Neon']],
  corrente:   [['nenhuma', 'Nenhuma'], ['grossa', 'Cordão de ouro grosso'], ['ouro', 'Corrente de ouro'], ['prata', 'Corrente de prata']],
  brinco:     [['nenhum', 'Nenhum'], ['brilhante', 'Brilhante'], ['argola', 'Argola de ouro']],
  relogio:    [['nenhum', 'Nenhum'], ['dourado', 'Relógio dourado'], ['preto', 'Relógio preto']],
  fone:       [['nenhum', 'Nenhum'], ['fone', 'Fone de ouvido']],
  carretel:   [['lata', 'Lata'], ['madeira', 'Carretel de madeira'], ['neon', 'Carretel neon'], ['ouro', 'Carretel de ouro']],
  danca:      [['passinho', 'Passinho'], ['romano', 'Passinho do Romano'], ['tremidinha', 'Tremidinha'], ['pulinho', 'Pulinho'], ['dab', 'Dab'], ['mortal', 'Mortal'], ['rebolado', 'Rebolado']],
};
const pickR = a => a[Math.floor(Math.random() * a.length)];
export function randomKid(base = {}) {
  const o = k => pickR(KID[k])[0];
  const w = (list) => { const tot = list.reduce((a, [, p]) => a + p, 0); let r = Math.random() * tot; for (const [v, p] of list) { r -= p; if (r <= 0) return v; } return list[0][0]; };
  const cabelo = w([['bone', 4], ['bonetras', 2], ['nevou', 3], ['disfarcado', 3], ['curto', 2], ['cacheado', 2], ['black', 1], ['moicano', 1], ['trancas', 1], ['raspado', 1], ['bandana', 1], ['liso', .5], ['careca', .5]]);
  return Object.assign({
    pele: pickR(PELES), cabelo, corCabelo: cabelo === 'nevou' ? '#f5e6a8' : pickR(CORES_CABELO.slice(0, 6)),
    olhos: pickR(['normal', 'normal', 'feliz', 'bravo', 'sono']), sobrancelha: w([['normal', 3], ['risco', 3], ['grossa', 1], ['brava', 1]]),
    barba: w([['nenhuma', 5], ['rala', 2], ['bigode', 2], ['desenhada', 1.5], ['cavanhaque', 1], ['barba', .8]]), olhoCor: w([['castanho', 5], ['preto', 3], ['mel', 2], ['verde', .8], ['azul', .6]]), boca: w([['sorriso', 5], ['ouro', 2], ['serio', 2], ['lingua', 1]]), marca: Math.random() < .8 ? 'nenhuma' : o('marca'),
    top: w([['time', 4], ['regata', 3], ['semcamisa', 1.5], ['listrada', 1.5], ['lisa', 1], ['moletom', 1], ['cortavento', 1.5]]),
    manto: Math.random() < .8 ? pickR(MANTOS.slice(1)).id : 'livre', // a maioria da quebrada veste manto
    cor1: pickR(CORES), cor2: pickR(CORES), num: String(1 + Math.floor(Math.random() * 99)),
    bermuda: w([['tactel', 4], ['estampada', 2], ['lisa', 2]]), short: pickR(['#1e3a8a', '#111827', '#374151', '#7c2d12', '#065f46', '#f8fafc', '#0ea5e9', '#e11d48']),
    calcado: w([['mola', 3], ['meiachinelo', 3], ['tenis', 2], ['chinelo', 2], ['bota', .3]]), corCalcado: pickR(['#f8fafc', '#111827', '#ef4444', '#facc15', '#22c55e', '#2563eb']),
    oculos: w([['nenhum', 5], ['juliete', 2.5], ['escuro', 1], ['redondo', .5], ['neon', .5]]),
    corrente: w([['nenhuma', 3], ['grossa', 2.5], ['ouro', 2], ['prata', 1]]), brinco: w([['nenhum', 3], ['brilhante', 2], ['argola', 1]]),
    relogio: w([['nenhum', 3], ['dourado', 1.5], ['preto', 1]]), fone: Math.random() < .85 ? 'nenhum' : 'fone',
    carretel: o('carretel'), danca: o('danca'),
  }, base);
}

export const CUT_TXT = ['CORTOU!', 'MANDOU EMBORA!', 'LÁ SE VAI!', 'VOOU!', 'NO GRAU!', 'TCHAU!', 'SEM CHANCE!'];
export const STREAK_TXT = { 2: 'CORTE DUPLO!', 3: 'CORTE TRIPLO!', 4: 'QUÁDRUPLO!', 5: 'MASSACRE NO CÉU!' };
