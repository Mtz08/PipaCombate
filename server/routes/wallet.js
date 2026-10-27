import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { requireAuth } from '../middleware/session.js';
import { snapshot } from '../domain/wallet.js';
import { createDeposit, getDeposit, requestWithdrawal } from '../domain/payments.js';
import { CONFIG } from '../config.js';
import { getSetting } from '../domain/settings.js';
import * as Responsible from '../domain/responsible.js';
import { audit, ipOf } from '../domain/audit.js';
import { db } from '../db/index.js';
import { Users } from '../db/repos.js';

const balanceOf = async (userId) => (await Users.getById(db, userId)).balanceCents;

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/', wrap(async (req, res) => res.json(await snapshot(req.user.id))));

walletRouter.get('/deposit-info', wrap(async (_req, res) => {
  const [lim, pub] = await Promise.all([getSetting('limites'), getSetting('publico')]);
  res.json({
    minCents: lim.depositMinCents, maxCents: lim.depositMaxCents, metodo: 'PIX', provider: CONFIG.payments.provider,
    chipsCents: pub.depositoRapidoCents, rotulos: pub.depositoRotulos, cores: pub.depositoCores,
  });
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

walletRouter.get('/withdraw-info', wrap(async (_req, res) => {
  const lim = await getSetting('limites');
  res.json({ minCents: lim.withdrawMinCents, maxCents: lim.withdrawMaxCents, autoMaxCents: lim.withdrawAutoMaxCents });
}));

// jogo responsavel: limite de deposito e pausa (autoexclusao)
walletRouter.get('/responsavel', wrap(async (req, res) => res.json(await Responsible.status(req.user.id))));
walletRouter.post('/responsavel/limite', wrap(async (req, res) => {
  const r = await Responsible.setDepositLimit(req.user.id, { cents: req.body?.cents ?? null, period: req.body?.period });
  await audit(null, { userId: req.user.id, action: 'rg_deposit_limit', meta: { cents: req.body?.cents ?? null, period: req.body?.period, ...r }, ip: ipOf(req) });
  res.json(r);
}));
walletRouter.post('/responsavel/pausa', wrap(async (req, res) => {
  const r = await Responsible.selfExclude(req.user.id, { dias: req.body?.dias });
  await audit(null, { userId: req.user.id, action: 'rg_self_exclusion', meta: { dias: req.body?.dias, ate: r.pausadoAte }, ip: ipOf(req) });
  res.json(r);
}));

// saque do saldo de comissao (indique e ganhe); mesmo fluxo de aprovacao
walletRouter.post('/withdraw-affiliate', wrap(async (req, res) => {
  const { amountCents, pixKey, cpf } = req.body ?? {};
  const r = await requestWithdrawal(req.user.id, { amountCents: Number(amountCents), pixKey, cpf, source: 'affiliate' });
  await audit(null, { userId: req.user.id, action: 'withdraw_affiliate', meta: { withdrawalId: r.withdrawal.id, amountCents: r.withdrawal.amountCents, pixKeyMask: r.withdrawal.pixKeyMask }, ip: ipOf(req) });
  res.status(201).json(r);
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
