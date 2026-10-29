// Webhooks do PSP. Montado FORA da protecao CSRF (o PSP nao envia
// X-Requested-With); a autenticidade vem da assinatura HMAC do corpo bruto.

import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { getProvider } from '../payments/index.js';
import { confirmDeposit, refundDeposit, confirmTransfer } from '../domain/payments.js';
import { audit } from '../domain/audit.js';
import { log } from '../util/log.js';

export const webhooksRouter = Router();

webhooksRouter.post('/payments', wrap(async (req, res) => {
  const event = req.rawBody ? await getProvider().parseWebhook(req.rawBody, req.headers) : null;
  if (!event) return res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'Assinatura invalida' } });

  let r = { ignored: true };
  if (event.type === 'charge.paid') {
    r = await confirmDeposit({ providerRef: event.providerRef, amountCents: event.amountCents });
    if (r.charge && !r.duplicate) {
      await audit(null, { userId: r.charge.userId, action: r.review ? 'deposit_review' : 'deposit_paid', meta: { chargeId: r.charge.id, amountCents: event.amountCents } });
    }
  } else if (event.type === 'charge.refunded') {
    r = await refundDeposit({ providerRef: event.providerRef, amountCents: event.amountCents });
  } else if (event.type === 'transfer.paid' || event.type === 'transfer.failed') {
    r = await confirmTransfer({ withdrawalId: event.withdrawalId, providerRef: event.providerRef, status: event.type.split('.')[1] });
  }
  if (r.ignored) log('warn', 'webhook_ignorado', { type: event.type, providerRef: String(event.providerRef || '').slice(0, 80) });
  // 200 mesmo para evento repetido/ignorado: evita reenvio infinito pelo PSP.
  res.json({ ok: true });
}));
