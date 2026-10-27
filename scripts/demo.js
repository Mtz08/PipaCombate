// DADOS DE DEMONSTRACAO — so para ver o visual no ambiente local.
// Cria jogadores de exemplo com rodadas de ganho alto e saques pagos, para
// preencher "Maiores ganhos" e "Ultimos saques pagos". NUNCA roda em producao.
//
//   npm run demo -- criar     (pare o servidor antes: o banco local e de um processo so)
//   npm run demo -- limpar
//
// Contas de demo usam telefones com DDD 10 (nao existe no Brasil): faceis de
// identificar e apagar, sem risco de colidir com jogador real.

import { randomUUID } from 'node:crypto';
import { CONFIG } from '../server/config.js';
import { initDb, db, tx, closeDb } from '../server/db/index.js';

if (CONFIG.isProd || process.env.DATABASE_URL) {
  console.error('Recusado: dados de demonstracao so no banco LOCAL de desenvolvimento (NODE_ENV=development, sem DATABASE_URL).');
  process.exit(1);
}

const PREFIXO = '1000000'; // + 4 digitos => 11 digitos, DDD 10
const NOMES = [
  'Carlos Henrique Silva', 'Juliana Martins', 'Rafael Oliveira', 'Bruna Costa', 'Diego Ferreira', 'Larissa Rocha',
  'Thiago Almeida', 'Camila Ribeiro', 'Lucas Barbosa', 'Fernanda Lima', 'Matheus Carvalho', 'Aline Souza',
];
const MAPAS = ['laje', 'campinho', 'morro', 'praia', 'tempestade', 'noite'];
// rodadas de ganho alto: [aposta R$, multiplicador, horas atras]
const GANHOS = [[100, 12.4, 3], [50, 18.2, 9], [200, 6.1, 20], [80, 9.7, 30], [150, 5.3, 41], [30, 24.5, 52],
  [120, 4.8, 66], [60, 7.9, 80], [250, 3.6, 95], [40, 11.2, 110], [90, 4.1, 130], [70, 6.6, 150]];
// saques pagos: [R$, horas atras]
const SAQUES = [[1240, 1], [850, 2.5], [3200, 4], [560, 6], [1890, 9], [420, 13], [2750, 18], [990, 26], [1500, 40], [680, 60]];

const cmd = process.argv[2];
await initDb();
try {
  if (cmd === 'limpar') {
    const n = await limpar();
    console.log(`Demo removida: ${n} conta(s) e tudo ligado a elas.`);
  } else if (cmd === 'criar') {
    await limpar();
    await tx(async (t) => {
      const ids = [];
      for (let i = 0; i < NOMES.length; i++) {
        const [u] = await t.query(
          `INSERT INTO users (name, phone, password_hash, referral_code, terms_accepted_at, terms_version, demo)
           VALUES ($1, $2, 'demo-sem-login', $3, now(), 'demo', true) RETURNING id`,
          [NOMES[i], PREFIXO + String(i).padStart(4, '0'), 'DEMO' + randomUUID().slice(0, 4).toUpperCase()],
        );
        ids.push(u.id);
      }
      for (let i = 0; i < GANHOS.length; i++) {
        const [aposta, mult, h] = GANHOS[i];
        const bet = aposta * 100, mx = Math.round(mult * 100), premio = Math.floor((bet * mx) / 100);
        await t.query(
          `INSERT INTO rounds (user_id, bet_cents, map, state, cuts, prize_cents, mult_x100, end_reason, created_at, closed_at)
           VALUES ($1, $2, $3, 'cashed', $4, $5, $6, 'cashed', now() - make_interval(hours => $7) - interval '2 minutes', now() - make_interval(hours => $7))`,
          [ids[i % ids.length], bet, MAPAS[i % MAPAS.length], Math.max(1, Math.round((mult - 1) * 4)), premio, mx, h],
        );
      }
      for (let i = 0; i < SAQUES.length; i++) {
        const [valor, h] = SAQUES[i];
        await t.query(
          `INSERT INTO withdrawals (user_id, amount_cents, status, pix_key_mask, provider, created_at, updated_at)
           VALUES ($1, $2, 'paid', 'de***mo', 'demo', now() - make_interval(mins => $3) - interval '20 minutes', now() - make_interval(mins => $3))`,
          [ids[(i * 5) % ids.length], valor * 100, Math.round(h * 60)],
        );
      }
    });
    console.log(`Demo criada: ${NOMES.length} jogadores, ${GANHOS.length} ganhos altos e ${SAQUES.length} saques pagos. Suba o servidor e abra o lobby.`);
    console.log('Para apagar: npm run demo -- limpar');
  } else {
    console.log('Uso: npm run demo -- criar | limpar');
    process.exitCode = 1;
  }
} finally {
  await closeDb();
}

async function limpar() {
  return tx(async (t) => {
    const ids = (await t.query('SELECT id FROM users WHERE demo')).map((r) => r.id);
    if (!ids.length) return 0;
    for (const tabela of ['rounds', 'withdrawals', 'ledger', 'charges', 'fair_seeds', 'affiliate_ledger', 'audit_log']) {
      await t.query(`DELETE FROM ${tabela} WHERE user_id = ANY($1)`.replace('user_id', tabela === 'affiliate_ledger' ? 'affiliate_id' : 'user_id'), [ids]);
    }
    await t.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
    return ids.length;
  });
}
