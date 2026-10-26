// Carregado antes de cada arquivo de teste (node --test --import).
// Cada arquivo roda em processo proprio com um Postgres (PGlite) em memoria,
// zerado e com as migrations aplicadas.
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL; // nunca rodar testes contra um banco real por acidente

const { initDb } = await import('../server/db/index.js');
await initDb();
