// Testes da camada de banco: garantias que vem do proprio Postgres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { db, migrate, tx } from './index.js';
import { Users, Charges } from './repos.js';
import { makeUser, balanceOf } from './testing.js';
import { start } from '../domain/game.js';
import { confirmDeposit } from '../domain/payments.js';

test('migrations sao idempotentes (rodar de novo nao quebra nem duplica)', async () => {
  await migrate();
  const rows = await db.query('SELECT name FROM schema_migrations');
  assert.equal(rows.length, new Set(rows.map((r) => r.name)).size);
});

test('CHECK do banco impede saldo negativo mesmo se o codigo errar', async () => {
  const u = await makeUser('1166660001', 100);
  await assert.rejects(() => tx((t) => Users.addBalance(t, u.id, -101)), (e) => e.code === '23514');
  assert.equal(await balanceOf(u.id), 100);
});

test('starts concorrentes: so um round aberto e so uma aposta debitada', async () => {
  const u = await makeUser('1166660002', 10000);
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => start(u.id, { betCents: 1000 })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await balanceOf(u.id), 9000);
});

test('webhooks concorrentes do mesmo pagamento creditam uma unica vez', async () => {
  const u = await makeUser('1166660003');
  const c = await tx((t) => Charges.create(t, { userId: u.id, amountCents: 5000, provider: 'mock', expiresAt: Date.now() + 60000 }));
  await tx((t) => Charges.attachPix(t, c.id, { providerRef: 'ref-concorrente', copyPaste: null, qrCodeBase64: null }));
  await Promise.all(Array.from({ length: 4 }, () => confirmDeposit({ providerRef: 'ref-concorrente', amountCents: 5000 })));
  assert.equal(await balanceOf(u.id), 5000);
});

test('dados persistem apos reiniciar o processo (PGlite em disco)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pc-db-'));
  try {
    const script = (code) => spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: '', PGLITE_DIR: join(dir, 'pg') },
      encoding: 'utf8',
    });
    const prelude = `const { initDb, closeDb, db } = await import(${JSON.stringify(new URL('./index.js', import.meta.url).href)});
      const { Users } = await import(${JSON.stringify(new URL('./repos.js', import.meta.url).href)});
      await initDb();`;
    const w = script(`${prelude} await Users.create(db, { name: 'Persiste', phone: '1166669999', passwordHash: 'x', ref: null, referralCode: 'PERSIST1' }); await closeDb();`);
    assert.equal(w.status, 0, w.stderr);
    const r = script(`${prelude} const u = await Users.getByPhone(db, '1166669999'); console.log(u?.name); await closeDb();`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Persiste/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
