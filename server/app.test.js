// Testes ponta a ponta da API HTTP (app numa porta efemera, fetch nativo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { CONFIG } from './config.js';
import * as mock from './payments/mock.js';
import { db } from './db/index.js';
import { Users } from './db/repos.js';

let server, base;
before(() => new Promise((r) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => new Promise((r) => server.close(r)));

/** Cliente com "pote de cookie" simples, como um navegador. */
function client() {
  let cookie = '';
  return async (method, path, body, { xhr = true, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(xhr ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json, headers: res.headers, cookie };
  };
}

const CPF_OK = '52998224725';
let phoneSeq = 0;
const newPhone = () => `11977${String(++phoneSeq).padStart(6, '0')}`;

async function signedUp() {
  const c = client();
  const r = await c('POST', '/api/auth/register', { name: 'Ana', phone: newPhone(), password: 'senha-forte-1', terms: true });
  assert.equal(r.status, 201);
  return c;
}

test('fluxo completo: cadastro -> deposito -> jogo -> saque', async () => {
  const c = await signedUp();
  const dep = await c('POST', '/api/wallet/deposit', { amountCents: 50000 });
  assert.equal(dep.status, 201);
  assert.equal(dep.body.charge.status, 'paid');
  assert.equal(dep.body.balanceCents, 50000);

  const s = await c('POST', '/api/game/start', { betCents: 1000, map: 'praia' });
  assert.equal(s.status, 201);
  assert.equal(s.body.balanceCents, 49000);

  const act = await c('GET', '/api/game/active');
  assert.equal(act.body.round.id, s.body.round.id);
  await c('POST', `/api/game/${s.body.round.id}/lose`);

  const pedido = { amountCents: 10000, pixKey: 'ana@exemplo.com', cpf: CPF_OK };
  // rollover: o deposito ainda nao foi apostado
  const r1 = await c('POST', '/api/wallet/withdraw', { ...pedido, password: 'senha-forte-1' });
  assert.equal(r1.body.error.code, 'ROLLOVER_PENDING');
  const me = await c('GET', '/api/auth/me');
  await db.query('UPDATE users SET wager_required_cents = 0 WHERE id = $1', [me.body.user.id]); // (apostou)
  // sessao sozinha nao saca: precisa da senha
  assert.equal((await c('POST', '/api/wallet/withdraw', pedido)).body.error.code, 'BAD_PASSWORD');
  const w = await c('POST', '/api/wallet/withdraw', { ...pedido, password: 'senha-forte-1' });
  assert.equal(w.status, 201);
  assert.equal(w.body.balanceCents, 39000);

  const wallet = await c('GET', '/api/wallet');
  assert.deepEqual(wallet.body.ledger.map((l) => l.type), ['withdraw', 'bet', 'deposit']);
  assert.equal(JSON.stringify(wallet.body).includes(CPF_OK), false);
});

test('sem login -> 401; sem header CSRF -> 403', async () => {
  const c = client();
  assert.equal((await c('GET', '/api/wallet')).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { phone: '11999999999', password: 'x' }, { xhr: false })).status, 403);
});

test('aposta maior que o saldo -> 400 e saldo intacto', async () => {
  const c = await signedUp();
  const r = await c('POST', '/api/game/start', { betCents: 5000 });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INSUFFICIENT_FUNDS');
  assert.equal((await c('GET', '/api/auth/me')).body.balanceCents, 0);
});

test('logout revoga o cookie mesmo se alguem guardou uma copia', async () => {
  const c = await signedUp();
  const stolen = (await c('GET', '/api/auth/me')).cookie;
  await c('POST', '/api/auth/logout');
  const r = await fetch(`${base}/api/auth/me`, { headers: { Cookie: stolen } });
  assert.equal(r.status, 401);
});

test('cookie adulterado -> 401', async () => {
  const r = await fetch(`${base}/api/auth/me`, { headers: { Cookie: 'pc_session=eyJ1c2VySWQiOiJ1XzEifQ.assinaturafalsa' } });
  assert.equal(r.status, 401);
});

test('login errado: mesma mensagem para telefone inexistente e senha errada', async () => {
  const c = client();
  const phone = newPhone();
  await c('POST', '/api/auth/register', { name: 'Bia', phone, password: 'senha-forte-1', terms: true });
  const wrongPw = await client()('POST', '/api/auth/login', { phone, password: 'outra-senha' });
  const noUser = await client()('POST', '/api/auth/login', { phone: newPhone(), password: 'outra-senha' });
  assert.equal(wrongPw.status, 401);
  assert.deepEqual(wrongPw.body, noUser.body);
});

test('telefone repetido -> 409; senha curta -> 400', async () => {
  const phone = newPhone();
  await client()('POST', '/api/auth/register', { name: 'Caio', phone, password: 'senha-forte-1', terms: true });
  assert.equal((await client()('POST', '/api/auth/register', { name: 'Caio', phone, password: 'senha-forte-1', terms: true })).status, 409);
  assert.equal((await client()('POST', '/api/auth/register', { name: 'Caio', phone: newPhone(), password: '123', terms: true })).status, 400);
});

test('cadastro sem aceite dos termos -> 400 e nada e criado', async () => {
  const phone = newPhone();
  const r = await client()('POST', '/api/auth/register', { name: 'Duda', phone, password: 'senha-forte-1' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'TERMS_REQUIRED');
  assert.equal(await Users.getByPhone(db, phone), null);
});

test('indicacao: codigo valido vincula o afiliado (sem diferenciar maiusculas); invalido so e ignorado', async () => {
  const afiliado = client();
  const a = await afiliado('POST', '/api/auth/register', { name: 'Afiliado', phone: newPhone(), password: 'senha-forte-1', terms: true });
  const code = a.body.user.referralCode;

  const ok = await client()('POST', '/api/auth/register', { name: 'Indicado', phone: newPhone(), password: 'senha-forte-1', terms: true, ref: code.toLowerCase() });
  assert.equal(ok.status, 201);
  const indicado = await Users.getById(db, ok.body.user.id);
  assert.equal(indicado.referredBy, a.body.user.id);
  assert.equal(indicado.ref, code);
  assert.ok(indicado.termsAcceptedAt);
  assert.ok(indicado.termsVersion);

  const bad = await client()('POST', '/api/auth/register', { name: 'Sem Afiliado', phone: newPhone(), password: 'senha-forte-1', terms: true, ref: 'NAOEXISTE' });
  assert.equal(bad.status, 201);
  assert.equal((await Users.getById(db, bad.body.user.id)).referredBy, null);
});

test('webhook com assinatura invalida -> 401; JSON malformado -> 400', async () => {
  const body = JSON.stringify({ type: 'charge.paid', providerRef: 'x', amountCents: 1 });
  const bad = await client()('POST', '/api/webhooks/payments', body, { xhr: false, headers: { 'x-signature': 'abc' } });
  assert.equal(bad.status, 401);
  const c = await signedUp();
  assert.equal((await c('POST', '/api/game/start', '{quebrado')).status, 400);
});

test('webhook assinado de cobranca inexistente -> 200 e ignorado (PSP nao fica reenviando)', async () => {
  const body = JSON.stringify({ type: 'charge.paid', providerRef: 'nao-existe', amountCents: 1 });
  const r = await client()('POST', '/api/webhooks/payments', body, { xhr: false, headers: { 'x-signature': mock.sign(Buffer.from(body)) } });
  assert.equal(r.status, 200);
});

test('headers de seguranca presentes e sem x-powered-by', async () => {
  const r = await fetch(`${base}/`);
  assert.ok(r.headers.get('content-security-policy'));
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('saques recentes publicos: so saques PAGOS, com nome abreviado', async () => {
  const c = await signedUp(); // "Ana"
  await c('POST', '/api/wallet/deposit', { amountCents: 50000 });
  const me = await c('GET', '/api/auth/me');
  await db.query("UPDATE users SET wager_required_cents = 0, name = 'Ana Paula Souza' WHERE id = $1", [me.body.user.id]);
  const w = await c('POST', '/api/wallet/withdraw', { amountCents: 10000, pixKey: 'ana@exemplo.com', cpf: '11144477735', password: 'senha-forte-1' });
  assert.equal(w.body.withdrawal.status, 'review'); // ainda nao pago: nao aparece
  let r = await client()('GET', '/api/public/saques-recentes');
  assert.ok(!r.body.saques.some((s) => s.nome === 'Ana S.'));
  await db.query("UPDATE withdrawals SET status = 'paid', updated_at = now() WHERE id = $1", [w.body.withdrawal.id]);
  r = await client()('GET', '/api/public/saques-recentes');
  const s = r.body.saques.find((x) => x.nome === 'Ana S.');
  assert.equal(s.valorCents, 10000);
  assert.equal(JSON.stringify(r.body).includes('Paula'), false);
});

test('senha de demonstracao: sem ela o site pede login (401); com ela abre; webhook fica livre', async () => {
  CONFIG.demoAccess.password = 'senha-demo-123';
  try {
    assert.equal((await fetch(base + '/')).status, 401);
    const ok = await fetch(base + '/', { headers: { Authorization: 'Basic ' + Buffer.from('equipe:senha-demo-123').toString('base64') } });
    assert.equal(ok.status, 200);
    const errada = await fetch(base + '/', { headers: { Authorization: 'Basic ' + Buffer.from('equipe:outra').toString('base64') } });
    assert.equal(errada.status, 401);
    const wh = await fetch(base + '/api/webhooks/payments', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    assert.equal((await wh.json()).error.code, 'BAD_SIGNATURE'); // passou do portao: quem barrou foi a assinatura
    assert.equal((await fetch(base + '/healthz')).status, 200);
  } finally { CONFIG.demoAccess.password = ''; }
});
