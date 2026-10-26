import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { requireAuth } from '../middleware/session.js';
import { snapshot } from '../domain/wallet.js';
import { createDeposit, getDeposit, requestWithdrawal } from '../domain/payments.js';
import { CONFIG } from '../config.js';
import { audit, ipOf } from '../domain/audit.js';
import { db } from '../db/index.js';
import { Users } from '../db/repos.js';

const balanceOf = async (userId) => (await Users.getById(db, userId)).balanceCents;

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/', wrap(async (req, res) => res.json(await snapshot(req.user.id))));

walletRouter.get('/deposit-info', (_req, res) => res.json({
  minCents: CONFIG.limits.depositMinCents,
  maxCents: CONFIG.limits.depositMaxCents,
  metodo: 'PIX',
  provider: CONFIG.payments.provider,
}));

// Cria a cobranca PIX. O saldo so sobe quando o PSP confirma (webhook).
walletRouter.post('/deposit', wrap(async (req, res) => {
  const charge = await createDeposit(req.user.id, Number(req.body?.amountCents));
  await audit(null, { userId: req.user.id, action: 'deposit_created', meta: { chargeId: charge.id, amountCents: charge.amountCents, status: charge.status }, ip: ipOf(req) });
  res.status(201).json({ charge, balanceCents: await balanceOf(req.user.id) });
}));

// Status da cobranca (o front consulta ate virar 'paid' ou 'expired').
walletRouter.get('/deposit/:id', wrap(async (req, res) => {
  res.json({ charge: await getDeposit(req.user.id, req.params.id), balanceCents: await balanceOf(req.user.id) });
}));

walletRouter.get('/withdraw-info', (_req, res) => res.json({
  minCents: CONFIG.limits.withdrawMinCents,
  maxCents: CONFIG.limits.withdrawMaxCents,
}));

walletRouter.post('/withdraw', wrap(async (req, res) => {
  const { amountCents, pixKey, cpf } = req.body ?? {};
  const r = await requestWithdrawal(req.user.id, { amountCents: Number(amountCents), pixKey, cpf }).catch(async (err) => {
    if (err.code === 'WITHDRAW_FAILED') await audit(null, { userId: req.user.id, action: 'withdraw_failed', meta: { amountCents: Number(amountCents) }, ip: ipOf(req) });
    throw err;
  });
  await audit(null, { userId: req.user.id, action: 'withdraw', meta: { withdrawalId: r.withdrawal.id, amountCents: r.withdrawal.amountCents, pixKeyMask: r.withdrawal.pixKeyMask }, ip: ipOf(req) });
  res.status(201).json(r);
}));
