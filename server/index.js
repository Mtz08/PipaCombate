// Bootstrap: conecta o banco (e aplica migrations), abre a porta e trata
// desligamento gracioso (deploy/restart).

import { CONFIG } from './config.js';
import { initDb, closeDb, dbKind } from './db/index.js';
import { createApp } from './app.js';
import { expireRounds } from './domain/admin.js';
import { log } from './util/log.js';

await initDb();

const server = createApp().listen(CONFIG.port, () => {
  log('info', 'start', { env: CONFIG.env, db: dbKind(), payments: CONFIG.payments.provider, url: `http://localhost:${CONFIG.port}` });
});

// encerra rounds abandonados a cada minuto
const expireTimer = setInterval(() => expireRounds().catch((err) => log('error', 'expire-job', { err: err.message })), 60_000);
expireTimer.unref();

// SIGTERM/SIGINT: para de aceitar conexoes, termina as requisicoes em curso e fecha o banco.
function shutdown(signal) {
  console.log(`${signal} recebido, encerrando...`);
  server.close(async () => { await closeDb().catch(() => {}); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
