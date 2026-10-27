import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { requireAdmin } from '../middleware/session.js';
import * as Admin from '../domain/admin.js';
import { ipOf } from '../domain/audit.js';
import { reviewQueue, approveWithdrawal, rejectWithdrawal } from '../domain/payments.js';
import { getSetting, setSetting, SCHEMAS } from '../domain/settings.js';
import { adminStats as affiliateStats } from '../domain/affiliates.js';
import * as TwoFa from '../domain/twofactor.js';
import { audit } from '../domain/audit.js';
import { domainError } from '../util/money.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// Acoes que mexem em dinheiro ou nas regras exigem 2FA confirmado ha pouco.
const critical = TwoFa.requireRecent2fa;
const settingKey = (key) => {
  if (!Object.hasOwn(SCHEMAS, key)) throw domainError('NOT_FOUND', 'Configuracao inexistente', 404);
  return key;
};

// 2FA do admin
adminRouter.get('/2fa', (req, res) => res.json(TwoFa.status(req.user)));
adminRouter.post('/2fa/setup', wrap(async (req, res) => res.json(await TwoFa.setup(req.user.id))));
adminRouter.post('/2fa/enable', wrap(async (req, res) => {
  const r = await TwoFa.enable(req.user.id, req.body?.code);
  await audit(null, { userId: req.user.id, actorId: req.user.id, action: 'admin_2fa_enabled', ip: ipOf(req) });
  res.json(r);
}));
adminRouter.post('/2fa/confirm', wrap(async (req, res) => {
  const r = await TwoFa.confirm(req.user.id, req.body?.code).catch(async (err) => {
    if (err.code === 'TOTP_INVALID') await audit(null, { userId: req.user.id, actorId: req.user.id, action: 'admin_2fa_failed', ip: ipOf(req) });
    throw err;
  });
  res.json(r);
}));

adminRouter.get('/stats', wrap(async (_req, res) => res.json(await Admin.stats())));
adminRouter.get('/users', wrap(async (req, res) => res.json({ users: await Admin.searchUsers(req.query.q) })));
adminRouter.get('/users/:id', wrap(async (req, res) => res.json(await Admin.userDetail(req.params.id))));
adminRouter.post('/users/:id/adjust', critical, wrap(async (req, res) => {
  res.json(await Admin.adjustBalance(req.user, req.params.id, req.body ?? {}, ipOf(req)));
}));
adminRouter.post('/users/:id/unblock', critical, wrap(async (req, res) => res.json(await Admin.unblock(req.user, req.params.id, req.body ?? {}, ipOf(req)))));
adminRouter.get('/audit', wrap(async (req, res) => res.json({ entries: await Admin.auditList({ action: req.query.action, limit: req.query.limit }) })));
// fila de saques aguardando aprovacao
adminRouter.get('/withdrawals', wrap(async (_req, res) => res.json({ withdrawals: await reviewQueue() })));
adminRouter.post('/withdrawals/:id/approve', critical, wrap(async (req, res) => res.json(await approveWithdrawal(req.user, req.params.id, ipOf(req)))));
adminRouter.post('/withdrawals/:id/reject', critical, wrap(async (req, res) => res.json(await rejectWithdrawal(req.user, req.params.id, req.body ?? {}, ipOf(req)))));
// configuracoes editaveis
adminRouter.get('/settings/:key', wrap(async (req, res) => res.json({ value: await getSetting(settingKey(req.params.key)) })));
adminRouter.post('/settings/:key', critical, wrap(async (req, res) => {
  const value = await setSetting(settingKey(req.params.key), req.body?.value, req.user.id);
  await audit(null, { actorId: req.user.id, action: 'settings_update', meta: { key: req.params.key, value }, ip: ipOf(req) });
  res.json({ value });
}));
adminRouter.get('/suspects', wrap(async (_req, res) => res.json({ suspects: await Admin.suspects() })));
adminRouter.get('/affiliates', wrap(async (_req, res) => res.json(await affiliateStats())));
adminRouter.post('/expire-rounds', critical, wrap(async (_req, res) => res.json({ expired: await Admin.expireRounds() })));
