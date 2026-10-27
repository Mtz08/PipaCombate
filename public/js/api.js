/* Pipa Combate — cliente da API.
   Sessao por cookie httpOnly (nao ha token no JS) e CSRF via X-Requested-With.
   O front do jogo foi escrito para o formato antigo de respostas; as funcoes
   abaixo traduzem as respostas do servidor atual para esse formato, assim o
   motor e as telas ficam iguais ao original. Saldo sempre em centavos. */
const BASE = '/api/';
const UK = 'pipacombate_user';

function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }

/* A sessao vive no cookie; guardamos so o usuario para mostrar na tela
   enquanto o cookie decide se esta logado de verdade. */
export const Auth = {
  token: localStorage.getItem(UK) ? 'cookie' : '',
  user: read(UK),
  get logged() { return !!(this.token && this.user); },
  set(token, user) {
    this.token = user ? 'cookie' : '';
    this.user = user;
    try { user ? localStorage.setItem(UK, JSON.stringify({ id: user.id, username: user.username })) : localStorage.removeItem(UK); } catch (e) {}
  },
  clear() {
    this.token = ''; this.user = null;
    try { localStorage.removeItem(UK); } catch (e) {}
  },
};

async function call(path, { method = 'GET', body, keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin', cache: 'no-store', keepalive,
    });
  } catch (e) { throw Object.assign(new Error('Sem conexão. Verifique sua internet.'), { status: 0 }); }
  let j = {};
  try { j = await res.json(); } catch (e) {}
  if (!res.ok) {
    const msg = (j && j.error && j.error.message) || 'Erro no servidor. Tente de novo.';
    throw Object.assign(new Error(msg), { status: res.status, code: (j.error && j.error.code) || '', data: j });
  }
  return j;
}
const post = (path, body, opts) => call(path, { method: 'POST', body, ...opts });
const rid = (round) => encodeURIComponent(round);

function fromSession(j) {
  const u = j.user || {};
  return {
    ok: true, token: 'cookie', balance: j.balanceCents ?? 0,
    user: { id: u.id, username: u.username || 'Jogador', phone: u.phone, referralCode: u.referralCode, admin: !!u.admin },
  };
}

/* % acumulado a partir do multiplicador (1,40x -> 40) */
const pctOf = (mult) => Math.round(((mult || 1) - 1) * 100);

/* cfg no formato do front antigo: % por tipo, teto em "x a aposta" e limites */
function toCfg(lobby) {
  const pct = {};
  for (const k in lobby.pct) pct[k] = Math.round(lobby.pct[k] * 100);
  return {
    pct, cap: lobby.maxMult, stake_min: lobby.betMinCents, stake_max: lobby.betMaxCents,
    rtp: lobby.rtpPct, forca: lobby.forca, maps: lobby.maps,
  };
}

function toHistory(r) {
  return {
    id: r.id, map: r.map, cuts: r.cuts, counts: r.counts || {}, stake: r.betCents, win: r.prizeCents || 0, pct: pctOf(r.multiplier),
    status: r.state === 'cashed' ? 'won' : 'lost', reason: r.endReason, wind: r.wind, at: r.createdAt,
    // dados para verificar o sorteio (server_seed so vem depois de revelada)
    nonce: r.nonce, clientSeed: r.clientSeed, serverSeedHash: r.serverSeedHash, serverSeed: r.serverSeed,
    rtpBps: r.rtpBps, maxMultX100: r.maxMultX100, // parametros com que o vento desta rodada foi sorteado
  };
}
const toTop = (t) => ({ username: t.name, map: t.map, stake: t.betCents, win: t.prizeCents, at: t.at });

/* extrato: depósitos e saques vêm com status próprio; do livro-caixa entram só
   os créditos/débitos avulsos (bônus, ajuste do admin, comissão) */
const LEDGER_SHOWN = ['bonus', 'adjust', 'commission'];
const DEP_ST = { paid: ['PAID', 'pago'], pending: ['PENDING', 'aguardando PIX'], expired: ['CANCELED', 'expirado'], review: ['PENDING', 'em análise'] };
const SAQ_ST = {
  review: ['PENDING', 'em análise'], processing: ['PENDING', 'enviando'], paid: ['PAID', 'pago'],
  failed: ['FAILED', 'falhou · estornado'], rejected: ['REJECTED', 'recusado · estornado'],
};

export const Api = {
  /* ---- conta ---- */
  register: (name, phone, password, ref) =>
    post('auth/register', {
      name, phone, password, ref: ref || null, terms: true,
      utm: (window.PCPixel && window.PCPixel.utm()) || null, // origem da campanha (1ª visita)
    }).then(fromSession),
  login: (phone, password) => post('auth/login', { phone, password }).then(fromSession),
  me: () => call('auth/me').then(fromSession),
  logout: () => post('auth/logout').catch(() => {}),

  /* ---- jogo ---- */
  async lobby() {
    const [l, me, h] = await Promise.all([call('game/lobby'), call('auth/me'), call('game/history').catch(() => ({ rounds: [] }))]);
    const s = fromSession(me);
    return { balance: s.balance, user: s.user, cfg: toCfg(l), history: (h.rounds || []).map(toHistory), top: (l.top || []).map(toTop), canRefill: false };
  },
  active: () => call('game/active'),
  async start(stake, map) {
    const [j, l] = await Promise.all([post('game/start', { betCents: stake, map }), call('game/lobby')]);
    return { round: j.round.id, stake: j.round.betCents, balance: j.balanceCents, cfg: toCfg(l) };
  },
  /* um corte confirmado pelo servidor; wind = true quando o vento virou */
  async cut(round, kind) {
    const j = await post('game/' + rid(round) + '/cut', { kind });
    return { wind: !!j.wind, pct: pctOf(j.round.multiplier), windAt: j.round.wind };
  },
  async cashout(round) {
    const j = await post('game/' + rid(round) + '/cashout');
    return { win: j.prizeCents, pct: pctOf(j.round.multiplier), balance: j.balanceCents };
  },
  async lose(round, keepalive = false) {
    await post('game/' + rid(round) + '/lose', { reason: 'cut' }, { keepalive });
    return { balance: (await call('auth/me')).balanceCents };
  },
  history: () => call('game/history'),
  fair: () => call('fair'),
  rotateSeed: () => post('fair/rotate'),
  setClientSeed: (clientSeed) => post('fair/client-seed', { clientSeed }),

  /* ---- carteira ---- */
  async wallet() {
    const j = await call('wallet');
    const tx = [
      ...(j.deposits || []).map((d) => ({ type: 'deposit', amountCents: d.amountCents, pos: true, at: d.createdAt, status: (DEP_ST[d.status] || ['PENDING'])[0], statusLabel: (DEP_ST[d.status] || [0, d.status])[1] })),
      ...(j.withdrawals || []).map((w) => ({ type: w.source === 'affiliate' ? 'withdraw_aff' : 'withdraw', amountCents: w.amountCents, pos: false, at: w.createdAt, status: (SAQ_ST[w.status] || ['PENDING'])[0], statusLabel: (SAQ_ST[w.status] || [0, w.status])[1], note: w.note })),
      ...(j.ledger || []).filter((t) => LEDGER_SHOWN.includes(t.type)).map((t) => ({
        type: t.type, amountCents: Math.abs(t.deltaCents), pos: t.deltaCents > 0, at: t.at, status: 'COMPLETED', statusLabel: '',
      })),
    ].sort((a, b) => (b.at || 0) - (a.at || 0));
    return { balanceCents: j.balanceCents, transactions: tx };
  },
  async depositInfo() {
    const j = await call('wallet/deposit-info');
    return { depositoMinimoCents: j.minCents, depositoMaximoCents: j.maxCents, provider: j.provider, chips: j.chipsCents, rotulos: j.rotulos || {}, cores: j.cores || {} };
  },
  async deposit(amountCents) {
    const j = await post('wallet/deposit', { amountCents });
    const c = j.charge || {};
    if (c.status === 'paid') return { id: c.id, paid: true, balanceCents: j.balanceCents }; // confirmado na hora (mock)
    return {
      id: c.id, pixCode: c.copyPaste || '', balanceCents: j.balanceCents,
      qrcode: c.qrCodeBase64 ? 'data:image/png;base64,' + c.qrCodeBase64 : '',
    };
  },
  async withdrawInfo() {
    const j = await call('wallet/withdraw-info');
    return { saqueMinimoCents: j.minCents, saqueMaximoCents: j.maxCents, rolloverRestanteCents: j.rolloverRestanteCents || 0 };
  },
  withdraw: (amountCents, pixKey, cpf, password) => post('wallet/withdraw', { amountCents, pixKey, cpf, password }),

  /* ---- jogo responsável ---- */
  responsavel: () => call('wallet/responsavel'),
  setDepositLimit: (cents, period) => post('wallet/responsavel/limite', { cents, period }),
  selfExclude: (dias) => post('wallet/responsavel/pausa', { dias }),

  /* ---- indique e ganhe (afiliados entram na Fase 5) ---- */
  async indicacao() {
    const j = await call('indicacao/info');
    const reais = (c) => 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: c % 100 ? 2 : 0 });
    const n = j.indicados || {};
    return {
      ativo: j.ativo, modelo: j.modelo, codigo: j.codigo,
      link: location.origin + '/cadastro?ref=' + j.codigo,
      // rótulo de cada nível: "10%" (depósito/revshare) ou "R$ 15" (CPA)
      niveisLabel: (j.niveis || []).map((x) => (x.tipo === 'valor' ? reais(x.cents) : x.pct + '%')),
      cpaDepositoMinCents: j.cpaDepositoMinCents,
      n1Count: n.n1, n2Count: n.n2, n3Count: n.n3,
      totalCommissionCents: j.ganhoCents, affiliateBalanceCents: j.saldoCents,
      saqueMinCents: j.saqueMinCents, saqueMaxCents: j.saqueMaxCents,
    };
  },
  withdrawAffiliate: (amountCents, pixKey, cpf, password) => post('wallet/withdraw-affiliate', { amountCents, pixKey, cpf, password }),
  refill: () => Promise.reject(Object.assign(new Error('Recarga indisponível.'), { status: 400 })),
};

/* usados pelo painel admin */
export const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Escapa texto para inserir em HTML. TODO dado vindo da API passa por aqui. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
