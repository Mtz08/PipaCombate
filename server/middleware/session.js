// Sessao por cookie httpOnly assinado (HMAC). Sem token no corpo/JS.
// O cookie guarda {userId, v, exp} assinado; o servidor confere a assinatura e
// a versao de sessao do usuario (v) a cada request. Logout incrementa a versao,
// o que revoga qualquer copia do cookie emitida antes.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONFIG } from '../config.js';
import { db, isUuid } from '../db/index.js';
import { Users } from '../db/repos.js';

// Prefixo __Host- em producao: o navegador exige Secure, Path=/ e sem Domain.
export const COOKIE = CONFIG.isProd ? '__Host-pc_session' : 'pc_session';

function sign(payloadB64) {
  return createHmac('sha256', CONFIG.sessionSecret).update(payloadB64).digest('base64url');
}

/** Gera e grava o cookie de sessao para o usuario. */
export function issueSession(res, user) {
  const iat = Date.now(), exp = iat + CONFIG.sessionTtlMs;
  const payloadB64 = Buffer.from(JSON.stringify({ userId: user.id, v: user.sessionVersion, iat, exp })).toString('base64url');
  res.cookie(COOKIE, `${payloadB64}.${sign(payloadB64)}`, {
    httpOnly: true,
    sameSite: 'lax',          // defesa CSRF (ver middleware/csrf.js)
    secure: CONFIG.isProd,
    maxAge: CONFIG.sessionTtlMs,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: CONFIG.isProd });
}

/** Le e valida o cookie; anexa req.user quando valido. Erro de banco vai ao errorHandler. */
export async function attachUser(req, _res, next) {
  req.user = null;
  const raw = req.cookies?.[COOKIE];
  if (raw && raw.includes('.')) {
    const [payloadB64, mac] = raw.split('.');
    const a = Buffer.from(mac || '');
    const b = Buffer.from(sign(payloadB64));
    if (a.length === b.length && timingSafeEqual(a, b)) {
      let payload = null;
      try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()); } catch { /* corrompido */ }
      if (payload && payload.exp > Date.now() && isUuid(payload.userId)) {
        try {
          const user = await Users.getById(db, payload.userId);
          // admin: sessao curta (cookie roubado vale menos tempo)
          const iat = payload.iat ?? payload.exp - CONFIG.sessionTtlMs;
          const adminExpired = user?.role === 'admin' && Date.now() - iat > CONFIG.adminSessionTtlMs;
          if (user && user.sessionVersion === payload.v && !adminExpired) req.user = user;
        } catch (err) { return next(err); }
      }
    }
  }
  next();
}

/** Barreira para rotas de admin. 404 para nao revelar que a rota existe. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota inexistente' } });
  next();
}

/** Barreira para rotas que exigem login. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Faca login' } });
  next();
}
