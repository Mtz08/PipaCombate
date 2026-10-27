// Testes do admin: acesso restrito, numeros, ajuste auditado, expiracao de rounds.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { CONFIG } from '../config.js';
import { db } from '../db/index.js';
import { makeUser, balanceOf } from '../db/testing.js';
import { start, cut, lose } from './game.js';
import { expireRounds, adjustBalance } from './admin.js';
import { codeAt, stepAt } from '../util/totp.js';

const ADMIN = '11900000001';
CONFIG.game.minCutIntervalMs = 0;
const promote = (phone) => db.query("UPDATE users SET role = 'admin' WHERE phone = $1", [phone]);

let server, base;
before(() => new Promise((r) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => new Promise((r) => server.close(r)));

async function session(phone) {
  const res = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ name: 'Adm', phone, password: 'senha-forte-1', terms: true }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return (path, opts = {}) => fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Cookie: cookie } });
}

test('jogador comum nao enxerga o admin (404)', async () => {
  const c = await session('11900000002');
  assert.equal((await c('/api/admin/stats')).status, 404);
});

test('cadastrar o telefone de um admin NAO da acesso ao admin (so pela linha de comando)', async () => {
  const c = await session('11900000009');
  assert.equal((await c('/api/admin/stats')).status, 404);
});

test('admin ve numeros, busca jogador e ajusta saldo com motivo (auditado e com 2FA)', async () => {
  const c = await session(ADMIN);
  await promote(ADMIN);
  // sem 2FA, acao critica e barrada
  const semOtp = await c('/api/admin/users/00000000-0000-0000-0000-000000000000/adjust', { method: 'POST', body: '{}' });
  assert.equal((await semOtp.json()).error.code, 'ADMIN_2FA_REQUIRED');
  const { secret } = await (await c('/api/admin/2fa/setup', { method: 'POST', body: '{}' })).json();
  assert.equal((await c('/api/admin/2fa/enable', { method: 'POST', body: JSON.stringify({ code: '000000' }) })).status, 403);
  const code = codeAt(secret, stepAt());
  assert.equal((await c('/api/admin/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) })).status, 200);
  // o mesmo codigo nao vale duas vezes
  assert.equal((await c('/api/admin/2fa/confirm', { method: 'POST', body: JSON.stringify({ code }) })).status, 403);
  const st = await (await c('/api/admin/stats')).json();
  assert.ok(st.users >= 1 && 'ggr' in st.money);
  const u = await makeUser('11900000003', 1000);
  const found = await (await c('/api/admin/users?q=11900000003')).json();
  assert.equal(found.users[0].id, u.id);
  assert.match(found.users[0].phone, /\*/); // telefone mascarado
  assert.equal((await c(`/api/admin/users/${u.id}/adjust`, { method: 'POST', body: JSON.stringify({ deltaCents: 500 }) })).status, 400);
  const ok = await c(`/api/admin/users/${u.id}/adjust`, { method: 'POST', body: JSON.stringify({ deltaCents: 500, reason: 'bonus de teste' }) });
  assert.equal((await ok.json()).balanceCents, 1500);
  const [row] = await db.query("SELECT * FROM audit_log WHERE action = 'admin_adjust' AND user_id = $1", [u.id]);
  assert.equal(row.meta.deltaCents, 500);
  // nunca na propria conta
  const me = (await db.query('SELECT id FROM users WHERE phone = $1', [ADMIN]))[0].id;
  const self = await c(`/api/admin/users/${me}/adjust`, { method: 'POST', body: JSON.stringify({ deltaCents: 500, reason: 'tentativa propria' }) });
  assert.equal((await self.json()).error.code, 'SELF_ACTION');
  // janela de 2FA vencida: precisa confirmar de novo
  await db.query("UPDATE users SET admin_reauth_until = now() - interval '1 minute' WHERE phone = $1", [ADMIN]);
  const venceu = await c(`/api/admin/users/${u.id}/adjust`, { method: 'POST', body: JSON.stringify({ deltaCents: 1, reason: 'outro teste' }) });
  assert.equal((await venceu.json()).error.code, 'ADMIN_REAUTH_REQUIRED');
});

test('login: 5 erros seguidos bloqueiam o telefone (mesmo sem conta), acerto zera', async () => {
  const post = (body) => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(body) });
  await session('11900000010'); // senha-forte-1
  for (let i = 0; i < 5; i++) assert.equal((await post({ phone: '11900000010', password: 'errada-123' })).status, 401);
  const travado = await post({ phone: '11900000010', password: 'senha-forte-1' });
  assert.equal(travado.status, 429);
  assert.equal((await travado.json()).error.code, 'LOGIN_LOCKED');
  for (let i = 0; i < 5; i++) await post({ phone: '11900000011', password: 'errada-123' }); // nao existe
  assert.equal((await post({ phone: '11900000011', password: 'x' })).status, 429); // mesmo comportamento
  await db.query("UPDATE login_throttle SET locked_until = now() - interval '1 second' WHERE phone = '11900000010'");
  assert.equal((await post({ phone: '11900000010', password: 'senha-forte-1' })).status, 200);
  assert.equal((await db.query("SELECT 1 FROM login_throttle WHERE phone = '11900000010'")).length, 0);
});

test('ajuste nao deixa saldo negativo', async () => {
  const u = await makeUser('11900000004', 100);
  await assert.rejects(() => adjustBalance({ id: null }, u.id, { deltaCents: -500, reason: 'estorno teste' }), (e) => e.code === 'INSUFFICIENT_FUNDS');
});

test('login com falha fica na auditoria', async () => {
  await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ phone: '11999999999', password: 'errada-123' }) });
  const rows = await db.query("SELECT 1 FROM audit_log WHERE action = 'login_failed'");
  assert.ok(rows.length >= 1);
});

test('round abandonado expira sem premio (com ou sem corte)', async () => {
  const a = await makeUser('11900000005', 10000);
  const b = await makeUser('11900000006', 10000);
  let ra;
  for (;;) { ({ round: ra } = await start(a.id, { betCents: 1000 })); if (!(await cut(a.id, ra.id, { kind: 'moleque' })).wind) break; }
  const { round: rb } = await start(b.id, { betCents: 1000 });
  await db.query("UPDATE rounds SET created_at = now() - interval '2 hours' WHERE id = ANY($1)", [[ra.id, rb.id]]);
  const before = await balanceOf(a.id);
  assert.equal(await expireRounds(), 2);
  assert.equal(await balanceOf(a.id), before);
  const rows = await db.query('SELECT end_reason, prize_cents FROM rounds WHERE id = ANY($1)', [[ra.id, rb.id]]);
  assert.ok(rows.every((r) => r.end_reason === 'timeout' && Number(r.prize_cents) === 0));
});

test('lista de possiveis robos: 20+ rodadas sem nunca ser cortado por rival', async () => {
  const { suspects } = await import('./admin.js');
  const bot = await makeUser('11900000020', 100000);
  for (let i = 0; i < 20; i++) {
    const { round } = await start(bot.id, { betCents: 500 });
    const k = await cut(bot.id, round.id, { kind: 'moleque' });
    if (!k.wind) await lose(bot.id, round.id, { reason: 'forfeit' });
  }
  const humano = await makeUser('11900000021', 100000);
  for (let i = 0; i < 20; i++) { const { round } = await start(humano.id, { betCents: 500 }); await lose(humano.id, round.id, { reason: 'cut' }); }
  const list = await suspects();
  assert.ok(list.some((s) => s.id === bot.id));
  assert.ok(!list.some((s) => s.id === humano.id));
});

test('cabecalhos: CSP sem style inline, Permissions-Policy e Referrer-Policy', async () => {
  const r = await fetch(`${base}/`);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /style-src-attr 'none'/);
  assert.doesNotMatch(csp, /\*\./); // nenhum curinga de dominio
  assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
  assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('painel: contas de demonstracao e rodadas do modo teste ficam fora dos numeros', async () => {
  const { stats, searchUsers } = await import('./admin.js');
  const antes = await stats();
  const demo = await makeUser('10000009999', 50000);
  await db.query('UPDATE users SET demo = true WHERE id = $1', [demo.id]);
  const dono = await makeUser('11900000030', 50000);
  await db.query('UPDATE users SET test_always_win = true WHERE id = $1', [dono.id]);
  const { round } = await start(dono.id, { betCents: 1000 }); // rodada do modo teste
  await lose(dono.id, round.id, { reason: 'cut' });

  const depois = await stats();
  assert.equal(depois.users, antes.users + 1);                         // so o dono (real) conta
  assert.equal(Number(depois.money.bets), Number(antes.money.bets));     // aposta de teste nao entra
  assert.equal(Number(depois.money.deposits), Number(antes.money.deposits) + 50000); // deposito real do dono
  assert.equal(depois.rounds.cut, antes.rounds.cut);
  assert.equal(Number(depois.balancesCents), Number(antes.balancesCents)); // saldo de conta em modo teste fora
  assert.ok(!(await searchUsers('10000009999')).length);
});
