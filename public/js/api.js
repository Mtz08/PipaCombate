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
    try { user ? localStorage.setItem(UK, JSON.stringify(user)) : localStorage.removeItem(UK); } catch (e) {}
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
    id: r.id, map: r.map, cuts: r.cuts, stake: r.betCents, win: r.prizeCents || 0, pct: pctOf(r.multiplier),
    status: r.state === 'cashed' ? 'won' : 'lost', reason: r.endReason, wind: r.wind,
  };
}

const LEDGER_SHOWN = ['deposit', 'withdraw', 'withdraw_reversal', 'bonus', 'adjust', 'commission'];

export const Api = {
  /* ---- conta ---- */
  register: (name, phone, password, ref) =>
    post('auth/register', { name, phone, password, ref: ref || null, terms: true }).then(fromSession),
  login: (phone, password) => post('auth/login', { phone, password }).then(fromSession),
  me: () => call('auth/me').then(fromSession),
  logout: () => post('auth/logout').catch(() => {}),

  /* ---- jogo ---- */
  async lobby() {
    const [l, me, h] = await Promise.all([call('game/lobby'), call('auth/me'), call('game/history').catch(() => ({ rounds: [] }))]);
    const s = fromSession(me);
    return { balance: s.balance, user: s.user, cfg: toCfg(l), history: (h.rounds || []).map(toHistory), top: l.top || [], canRefill: false };
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

  /* ---- carteira ---- */
  async wallet() {
    const j = await call('wallet');
    const transactions = (j.ledger || []).filter((t) => LEDGER_SHOWN.includes(t.type)).map((t) => ({
      type: t.type, amountCents: Math.abs(t.deltaCents), status: 'COMPLETED', at: t.at,
    }));
    return { balanceCents: j.balanceCents, transactions };
  },
  async depositInfo() {
    const j = await call('wallet/deposit-info');
    return { depositoMinimoCents: j.minCents, depositoMaximoCents: j.maxCents, provider: j.provider };
  },
  async deposit(amountCents) {
    const j = await post('wallet/deposit', { amountCents });
    const c = j.charge || {};
    if (c.status === 'paid') return { balanceCents: j.balanceCents }; // confirmado na hora (mock)
    return {
      id: c.id, pixCode: c.copyPaste || '', balanceCents: j.balanceCents,
      qrcode: c.qrCodeBase64 ? 'data:image/png;base64,' + c.qrCodeBase64 : '',
    };
  },
  async withdrawInfo() {
    const j = await call('wallet/withdraw-info');
    return { saqueMinimoCents: j.minCents, saqueMaximoCents: j.maxCents };
  },
  withdraw: (amountCents, pixKey, cpf) => post('wallet/withdraw', { amountCents, pixKey, cpf }),

  /* ---- indique e ganhe (afiliados entram na Fase 5) ---- */
  async indicacao() {
    const s = fromSession(await call('auth/me'));
    const codigo = s.user.referralCode || '';
    return { codigo, link: location.origin + '/cadastro?ref=' + codigo };
  },
  withdrawAffiliate: () => Promise.reject(Object.assign(new Error('Saque de comissão disponível em breve.'), { status: 400 })),
  refill: () => Promise.reject(Object.assign(new Error('Recarga indisponível.'), { status: 400 })),
};

/* usados pelo painel admin */
export const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Escapa texto para inserir em HTML. TODO dado vindo da API passa por aqui. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
