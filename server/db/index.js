// Conexao com o banco + transacoes.
//
// Dois drivers, mesmo SQL:
//  - Postgres real (pg) quando DATABASE_URL esta definido. Producao.
//  - PGlite (Postgres 17 em WASM, dentro do processo) sem DATABASE_URL.
//    Dev local e testes sem instalar nada. Persiste em PGLITE_DIR.
//
// Interface unica (o "executor"): { query(sql, params) -> rows, exec(sql) }.
// tx(fn) abre BEGIN/COMMIT e entrega um executor preso a transacao.
// REGRA: dentro de tx(fn), use SEMPRE o executor recebido, nunca `db`.

import { mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONFIG } from '../config.js';
import { domainError } from '../util/money.js';
import { mapUser } from './repos.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const INT8_OID = 20;

let driver = null;

/** Executor fora de transacao (leituras simples). */
export const db = {
  query: (sql, params) => requireDriver().query(sql, params),
};

export const tx = (fn) => requireDriver().tx(fn);

function requireDriver() {
  if (!driver) throw new Error('Banco nao inicializado: chame initDb() antes');
  return driver;
}

export async function initDb() {
  if (driver) return driver;
  driver = CONFIG.db.url ? await pgDriver(CONFIG.db.url) : await pgliteDriver(CONFIG.db.pgliteDir);
  if (CONFIG.db.autoMigrate) await migrate();
  return driver;
}

export async function closeDb() {
  if (driver) await driver.close();
  driver = null;
}

export const dbKind = () => driver?.kind ?? null;

// ---------- drivers ----------

async function pgDriver(url) {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(INT8_OID, Number); // centavos cabem com folga em 2^53
  const pool = new pg.Pool({ connectionString: url, max: CONFIG.db.poolMax });
  const wrap = (c) => ({
    query: async (sql, params) => (await c.query(sql, params)).rows,
    exec: async (sql) => { await c.query(sql); },
  });
  return {
    kind: 'postgres',
    query: wrap(pool).query,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function pgliteDriver(dir) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (!dir.startsWith('memory://')) await mkdir(dir, { recursive: true });
  const lite = new PGlite(dir, { parsers: { [INT8_OID]: Number } });
  await lite.waitReady;
  // PGlite tem UMA conexao: serializamos tudo para uma query avulsa nunca
  // cair no meio de uma transacao aberta.
  let chain = Promise.resolve();
  const serial = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };
  const wrap = (c) => ({
    query: async (sql, params) => (await c.query(sql, params)).rows,
    exec: async (sql) => { await c.exec(sql); },
  });
  return {
    kind: 'pglite',
    query: (sql, params) => serial(() => wrap(lite).query(sql, params)),
    tx: (fn) => serial(() => lite.transaction((t) => fn(wrap(t)))),
    close: () => serial(() => lite.close()),
  };
}

// ---------- migrations ----------

/** Aplica migrations/*.sql pendentes, em ordem, cada uma na sua transacao. */
export async function migrate() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  await tx(async (t) => {
    // trava global: duas instancias subindo juntas nao aplicam a mesma migration
    await t.query('SELECT pg_advisory_xact_lock(727274)');
    await t.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await t.query('SELECT name FROM schema_migrations')).map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      await t.exec(await readFile(join(MIGRATIONS_DIR, file), 'utf8'));
      await t.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      if (!CONFIG.isTest) console.log(`[migrate] aplicada ${file}`);
    }
  });
}

// ---------- helpers ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** Violacao de UNIQUE (23505), opcionalmente de uma constraint especifica. */
export const isUniqueViolation = (err, constraint) =>
  err?.code === '23505' && (!constraint || String(err.constraint || err.message).includes(constraint));

/**
 * Trava a linha do usuario (SELECT ... FOR UPDATE) e roda fn na mesma transacao.
 * Serializa toda operacao de saldo do mesmo usuario, entre processos e instancias.
 */
export async function withUserLock(userId, fn) {
  if (!isUuid(userId)) throw domainError('NOT_FOUND', 'Usuario inexistente', 404);
  return tx(async (t) => {
    const rows = await t.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!rows[0]) throw domainError('NOT_FOUND', 'Usuario inexistente', 404);
    return fn(t, mapUser(rows[0]));
  });
}
