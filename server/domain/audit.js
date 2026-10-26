// Trilha de auditoria: acoes sensiveis ficam registradas no banco (append-only).
// Gravar DENTRO da transacao da acao quando houver uma (t), para nunca existir
// acao sem registro nem registro de acao desfeita.

import { db } from '../db/index.js';
import { log } from '../util/log.js';

export async function audit(q, { userId = null, actorId = null, action, meta = {}, ip = null }) {
  try {
    await (q || db).query(
      'INSERT INTO audit_log (user_id, actor_id, action, meta, ip) VALUES ($1, $2, $3, $4, $5)',
      [userId, actorId, action, JSON.stringify(meta), ip],
    );
  } catch (err) {
    // dentro de transacao o erro sobe (desfaz a acao); fora dela, so loga
    if (q) throw err;
    log('error', 'audit-falhou', { action, err: err.message });
  }
}

export const ipOf = (req) => req.ip || null;
