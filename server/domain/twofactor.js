// 2FA do admin (TOTP, app autenticador). Acoes que mexem em dinheiro ou nas
// regras do jogo exigem um codigo confirmado nos ultimos minutos.
//
// Fluxo: setup (gera segredo, ainda inativo) -> enable (confirma 1o codigo) ->
// verify (antes das acoes criticas; abre janela de CONFIG.adminReauthMs).

import { withUserLock } from '../db/index.js';
import { domainError } from '../util/money.js';
import { seal, open } from '../util/crypto.js';
import { newSecret, verify as verifyCode, otpauthUri } from '../util/totp.js';
import { CONFIG } from '../config.js';

export function status(user) {
  return {
    ativo: user.totpEnabled,
    confirmadoAte: user.adminReauthUntil && user.adminReauthUntil > Date.now() ? user.adminReauthUntil : null,
  };
}

/** Gera um segredo novo (so enquanto o 2FA nao esta ativo). */
export async function setup(userId) {
  return withUserLock(userId, async (t, user) => {
    if (user.totpEnabled) throw domainError('TOTP_ACTIVE', '2FA ja esta ativo. Para trocar, peca o reset no servidor (npm run admin -- zerar-2fa).', 409);
    const secret = newSecret();
    await t.query('UPDATE users SET totp_secret_enc = $2, totp_last_step = NULL WHERE id = $1', [userId, seal(secret)]);
    return { secret, uri: otpauthUri(secret, user.phone) };
  });
}

/** Confere o codigo (sem reuso). Ao ativar ou confirmar, abre a janela de acoes criticas. */
async function check(userId, code, { enabling }) {
  return withUserLock(userId, async (t, user) => {
    if (!user.totpSecretEnc) throw domainError('TOTP_NOT_SETUP', 'Configure o 2FA primeiro', 409);
    if (!enabling && !user.totpEnabled) throw domainError('TOTP_NOT_ACTIVE', 'Ative o 2FA primeiro', 409);
    const step = verifyCode(open(user.totpSecretEnc), code, user.totpLastStep);
    if (step == null) throw domainError('TOTP_INVALID', 'Codigo invalido ou ja usado', 403);
    const ate = Date.now() + CONFIG.adminReauthMs;
    await t.query('UPDATE users SET totp_enabled = true, totp_last_step = $2, admin_reauth_until = $3 WHERE id = $1', [userId, step, new Date(ate)]);
    return { ativo: true, confirmadoAte: ate };
  });
}

export const enable = (userId, code) => check(userId, code, { enabling: true });
export const confirm = (userId, code) => check(userId, code, { enabling: false });

/** Middleware: acao critica so com 2FA ativo e confirmado ha pouco. */
export function requireRecent2fa(req, res, next) {
  const u = req.user;
  if (!u?.totpEnabled) return res.status(403).json({ error: { code: 'ADMIN_2FA_REQUIRED', message: 'Ative o 2FA do admin para fazer isso' } });
  if (!u.adminReauthUntil || u.adminReauthUntil < Date.now()) {
    return res.status(403).json({ error: { code: 'ADMIN_REAUTH_REQUIRED', message: 'Confirme o codigo do autenticador' } });
  }
  next();
}
