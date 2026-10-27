-- Contas de demonstracao (npm run demo): aparecem no lobby para ver o visual,
-- mas ficam fora de todos os numeros e listas do painel admin.
ALTER TABLE users ADD COLUMN demo BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET demo = true WHERE phone LIKE '1000000%' AND password_hash = 'demo-sem-login';
