// Webhooks do PSP. Montado FORA da protecao CSRF (o PSP nao envia
// X-Requested-With); a autenticidade vem da assinatura HMAC do corpo bruto.

import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { getProvider } from '../payments/index.js';
import { confirmDeposit } from '../domain/payments.js';

export const webhooksRouter = Router();

webhooksRouter.post('/payments', wrap(async (req, res) => {
  const event = req.rawBody ? getProvider().parseWebhook(req.rawBody, req.headers) : null;
  if (!event) return res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'Assinatura invalida' } });

  if (event.type === 'charge.paid') {
    await confirmDeposit({ providerRef: event.providerRef, amountCents: event.amountCents });
  }
  // 200 mesmo para evento repetido/ignorado: evita reenvio infinito pelo PSP.
  res.json({ ok: true });
}));
