// Testes do admin: acesso restrito, numeros, ajuste auditado, expiracao de rounds.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { CONFIG } from '../config.js';
import { db } from '../db/index.js';
import { makeUser, balanceOf } from '../db/testing.js';
import { start, cut } from './game.js';
import { expireRounds, adjustBalance } from './admin.js';

const ADMIN = '11900000001';
CONFIG.adminPhones = [ADMIN];
CONFIG.game.minCutIntervalMs = 0;

let server, base;
before(() => new Promise((r) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => new Promise((r) => server.close(r)));

async function session(phone) {
  const res = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ name: 'Adm', phone, password: 'senha-forte-1' }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return (path, opts = {}) => fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Cookie: cookie } });
}

test('jogador comum nao enxerga o admin (404)', async () => {
  const c = await session('11900000002');
  assert.equal((await c('/api/admin/stats')).status, 404);
});

test('admin ve numeros, busca jogador e ajusta saldo com motivo (auditado)', async () => {
  const c = await session(ADMIN);
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
});

test('ajuste nao deixa saldo negativo', async () => {
  const u = await makeUser('11900000004', 100);
  await assert.rejects(() => adjustBalance({ id: u.id }, u.id, { deltaCents: -500, reason: 'estorno teste' }), (e) => e.code === 'INSUFFICIENT_FUNDS');
});

test('login com falha fica na auditoria', async () => {
  await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ phone: '11999999999', password: 'errada-123' }) });
  const rows = await db.query("SELECT 1 FROM audit_log WHERE action = 'login_failed'");
  assert.ok(rows.length >= 1);
});

test('round abandonado expira: com corte recolhe a favor do jogador; sem corte desiste', async () => {
  const a = await makeUser('11900000005', 10000);
  const b = await makeUser('11900000006', 10000);
  let ra;
  for (;;) { ({ round: ra } = await start(a.id, { betCents: 1000 })); if (!(await cut(a.id, ra.id, { kind: 'moleque' })).wind) break; }
  const { round: rb } = await start(b.id, { betCents: 1000 });
  await db.query("UPDATE rounds SET created_at = now() - interval '2 hours' WHERE id = ANY($1)", [[ra.id, rb.id]]);
  const before = await balanceOf(a.id);
  assert.equal(await expireRounds(), 2);
  assert.equal(await balanceOf(a.id), before + 1100);
  const [r] = await db.query('SELECT end_reason FROM rounds WHERE id = $1', [rb.id]);
  assert.equal(r.end_reason, 'forfeit');
});
