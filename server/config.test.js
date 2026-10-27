// A configuracao recusa subir inseguro fora de development/test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CONFIG_URL = new URL('./config.js', import.meta.url).href;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const forte = 'x'.repeat(40);

/** Importa o config num processo limpo com o ambiente dado; devolve o erro (ou ''). */
function load(env) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(CONFIG_URL)})`], {
    cwd: ROOT, encoding: 'utf8', env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, ...env },
  });
  return r.status === 0 ? '' : r.stderr;
}
const prod = { DATABASE_URL: 'postgres://x', SESSION_SECRET: forte, DATA_KEY: forte, PAYMENTS_PROVIDER: 'psp', PAYMENTS_WEBHOOK_SECRET: forte };

test('producao completa sobe; NODE_ENV vazio ou staging valem como producao', () => {
  assert.equal(load({ ...prod, NODE_ENV: 'production' }), '');
  assert.match(load({ NODE_ENV: '' }), /SESSION_SECRET/);
  assert.match(load({ NODE_ENV: 'staging' }), /DATA_KEY/);
  assert.equal(load({ NODE_ENV: 'development' }), '');
});

test('producao recusa pagamento simulado, TRUST_PROXY invalido e ADMIN_PHONES', () => {
  assert.match(load({ ...prod, NODE_ENV: 'production', PAYMENTS_PROVIDER: 'mock' }), /PAYMENTS_PROVIDER/);
  assert.match(load({ ...prod, NODE_ENV: 'production', TRUST_PROXY: 'true' }), /TRUST_PROXY/);
  assert.match(load({ ...prod, NODE_ENV: 'production', ADMIN_PHONES: '11999999999' }), /ADMIN_PHONES/);
});
