// Gerencia administradores pela linha de comando (no servidor, com acesso ao banco).
// Admin NAO e mais criado pelo cadastro: ninguem vira admin so por saber um telefone.
//
//   npm run admin -- conceder 11999999999
//   npm run admin -- revogar 11999999999
//   npm run admin -- listar
//   npm run admin -- zerar-2fa 11999999999   (perdeu o celular do autenticador)

import { initDb, db, closeDb } from '../server/db/index.js';
import { normalizePhone } from '../server/util/validate.js';

const [cmd, phoneArg] = process.argv.slice(2);
await initDb();
try {
  if (cmd === 'listar') {
    const rows = await db.query("SELECT name, phone, totp_enabled FROM users WHERE role = 'admin' ORDER BY created_at");
    if (!rows.length) console.log('Nenhum admin.');
    for (const r of rows) console.log(`${r.phone}  ${r.name}  2FA: ${r.totp_enabled ? 'ativo' : 'PENDENTE'}`);
  } else if (['conceder', 'revogar', 'zerar-2fa'].includes(cmd)) {
    const phone = normalizePhone(phoneArg);
    const sql = {
      conceder: "UPDATE users SET role = 'admin', session_version = session_version + 1 WHERE phone = $1 RETURNING name",
      revogar: "UPDATE users SET role = 'player', admin_reauth_until = NULL, session_version = session_version + 1 WHERE phone = $1 RETURNING name",
      'zerar-2fa': 'UPDATE users SET totp_secret_enc = NULL, totp_enabled = false, totp_last_step = NULL, admin_reauth_until = NULL, session_version = session_version + 1 WHERE phone = $1 RETURNING name',
    }[cmd];
    const r = await db.query(sql, [phone]);
    if (!r.length) { console.error('Telefone nao cadastrado. A pessoa precisa criar a conta no site antes.'); process.exitCode = 1; }
    else {
      console.log(`${cmd}: ${r[0].name} (${phone}). A sessao dela foi encerrada; entre de novo.`);
      await db.query("INSERT INTO audit_log (user_id, action, meta) SELECT id, $2, '{}'::jsonb FROM users WHERE phone = $1", [phone, `cli_admin_${cmd}`]);
    }
  } else {
    console.log('Uso: npm run admin -- conceder|revogar|zerar-2fa <telefone>  |  npm run admin -- listar');
    process.exitCode = 1;
  }
} finally {
  await closeDb();
}
