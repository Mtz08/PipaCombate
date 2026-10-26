// Aplica as migrations pendentes e sai. Uso: npm run migrate
import { initDb, closeDb, dbKind } from '../server/db/index.js';

await initDb(); // initDb ja roda migrate() (DB_AUTO_MIGRATE padrao)
console.log(`[migrate] banco=${dbKind()} em dia`);
await closeDb();
