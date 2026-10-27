import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { requireAdmin } from '../middleware/session.js';
import * as Admin from '../domain/admin.js';
import { ipOf } from '../domain/audit.js';
import { reviewQueue, approveWithdrawal, rejectWithdrawal } from '../domain/payments.js';
import { getSetting, setSetting, SCHEMAS } from '../domain/settings.js';
import { adminStats as affiliateStats } from '../domain/affiliates.js';
import { audit } from '../domain/audit.js';
import { domainError } from '../util/money.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/stats', wrap(async (_req, res) => res.json(await Admin.stats())));
adminRouter.get('/users', wrap(async (req, res) => res.json({ users: await Admin.searchUsers(req.query.q) })));
adminRouter.get('/users/:id', wrap(async (req, res) => res.json(await Admin.userDetail(req.params.id))));
adminRouter.post('/users/:id/adjust', wrap(async (req, res) => {
  res.json(await Admin.adjustBalance(req.user, req.params.id, req.body ?? {}, ipOf(req)));
}));
adminRouter.get('/audit', wrap(async (req, res) => res.json({ entries: await Admin.auditList({ action: req.query.action, limit: req.query.limit }) })));
// fila de saques aguardando aprovacao
adminRouter.get('/withdrawals', wrap(async (_req, res) => res.json({ withdrawals: await reviewQueue() })));
adminRouter.post('/withdrawals/:id/approve', wrap(async (req, res) => res.json(await approveWithdrawal(req.user, req.params.id, ipOf(req)))));
adminRouter.post('/withdrawals/:id/reject', wrap(async (req, res) => res.json(await rejectWithdrawal(req.user, req.params.id, req.body ?? {}, ipOf(req)))));
// configuracoes editaveis (hoje: afiliados)
adminRouter.get('/settings/:key', wrap(async (req, res) => {
  if (!SCHEMAS[req.params.key]) throw domainError('NOT_FOUND', 'Configuracao inexistente', 404);
  res.json({ value: await getSetting(req.params.key) });
}));
adminRouter.post('/settings/:key', wrap(async (req, res) => {
  const value = await setSetting(req.params.key, req.body?.value, req.user.id);
  await audit(null, { actorId: req.user.id, action: 'settings_update', meta: { key: req.params.key, value }, ip: ipOf(req) });
  res.json({ value });
}));
adminRouter.get('/affiliates', wrap(async (_req, res) => res.json(await affiliateStats())));
adminRouter.post('/expire-rounds', wrap(async (_req, res) => res.json({ expired: await Admin.expireRounds() })));
