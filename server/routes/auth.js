import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { issueSession, clearSession, requireAuth } from '../middleware/session.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { register, login, logout, publicUser } from '../domain/accounts.js';
import { audit, ipOf } from '../domain/audit.js';

export const authRouter = Router();

// Formato de sessao entregue ao front: { user, balanceCents }.
function sessionPayload(user) {
  return { user: publicUser(user), balanceCents: user.balanceCents };
}

authRouter.post('/register', authLimiter, wrap(async (req, res) => {
  const { name, phone, password, ref, terms, utm } = req.body ?? {};
  const user = await register({ name, phone, password, ref, terms, utm });
  await audit(null, { userId: user.id, action: 'register', meta: { ref: user.ref, referred: !!user.referredBy, terms: user.termsVersion }, ip: ipOf(req) });
  issueSession(res, user);
  res.status(201).json(sessionPayload(user));
}));

authRouter.post('/login', authLimiter, wrap(async (req, res) => {
  const { phone, password } = req.body ?? {};
  const user = await login({ phone, password }).catch(async (err) => {
    if (err.code === 'BAD_CREDENTIALS') await audit(null, { action: 'login_failed', ip: ipOf(req) });
    throw err;
  });
  await audit(null, { userId: user.id, action: 'login', ip: ipOf(req) });
  issueSession(res, user);
  res.json(sessionPayload(user));
}));

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(sessionPayload(req.user));
});

authRouter.post('/logout', wrap(async (req, res) => {
  if (req.user) { await logout(req.user); await audit(null, { userId: req.user.id, action: 'logout', ip: ipOf(req) }); }
  clearSession(res);
  res.json({ ok: true });
}));
