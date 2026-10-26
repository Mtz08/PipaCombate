// Cliente da API. Sessao por cookie httpOnly; nao ha token no JS.
// CSRF via X-Requested-With.

const BASE = '/api/';

async function call(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw Object.assign(new Error('Sem conexao.'), { status: 0 });
  }
  let j = {};
  try { j = await res.json(); } catch {}
  if (!res.ok) {
    const msg = j?.error?.message || 'Erro no servidor.';
    throw Object.assign(new Error(msg), { status: res.status, code: j?.error?.code || '', data: j });
  }
  return j;
}

const post = (path, body) => call(path, { method: 'POST', body });

export const Api = {
  config: () => call('public/config'),
  register: (name, phone, password, ref) => post('auth/register', { name, phone, password, ref: ref || null }),
  login: (phone, password) => post('auth/login', { phone, password }),
  me: () => call('auth/me'),
  logout: () => post('auth/logout').catch(() => {}),

  lobby: () => call('game/lobby'),
  active: () => call('game/active'),
  start: (betCents, map) => post('game/start', { betCents, map }),
  cut: (round, kind) => post(`game/${encodeURIComponent(round)}/cut`, { kind }),
  cashout: (round) => post(`game/${encodeURIComponent(round)}/cashout`),
  lose: (round, reason) => post(`game/${encodeURIComponent(round)}/lose`, { reason }),

  history: () => call('game/history'),
  fair: () => call('fair'),
  rotateSeed: () => post('fair/rotate'),
  setClientSeed: (clientSeed) => post('fair/client-seed', { clientSeed }),

  wallet: () => call('wallet'),
  deposit: (amountCents) => post('wallet/deposit', { amountCents }),
  depositStatus: (id) => call(`wallet/deposit/${encodeURIComponent(id)}`),
  withdraw: (amountCents, pixKey, cpf) => post('wallet/withdraw', { amountCents, pixKey, cpf }),
};

export const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Escapa texto para inserir em HTML. TODO dado vindo da API passa por aqui. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
