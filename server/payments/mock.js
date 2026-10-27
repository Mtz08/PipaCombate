// Provider de pagamento SIMULADO. Nenhum PIX, nenhum dinheiro real.
//
// Implementa o mesmo contrato que um PSP real tera (ver payments/index.js).
// Para integrar o PSP: criar payments/<psp>.js com estas 3 funcoes e trocar
// PAYMENTS_PROVIDER no ambiente. Dominio e rotas nao mudam.

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { CONFIG } from '../config.js';

export const name = 'mock';

/** Cria a cobranca PIX no PSP. Retorna referencia externa e dados do QR. */
export async function createPixCharge({ chargeId, amountCents, expiresAt }) {
  const providerRef = `mock_${randomUUID()}`;
  return {
    providerRef,
    // Num PSP real: payload "copia e cola" (BR Code) e imagem do QR.
    copyPaste: `SIMULADO-PIX-${chargeId}-${amountCents}`,
    qrCodeBase64: null,
    expiresAt,
  };
}

/** Envia a transferencia PIX do saque. No mock, "paga" na hora.
 *  Contrato de erro: recusa DEFINITIVA do PSP lanca erro com definitive = true
 *  (o saque e estornado); qualquer outro erro e tratado como incerto (o PIX
 *  pode ter saido) e o saque fica 'processing' ate o webhook/conciliacao. */
export async function sendPixTransfer({ withdrawalId }) {
  return { providerRef: `mock_tr_${withdrawalId}`, status: 'paid' };
}

/**
 * Valida a assinatura do webhook e devolve o evento normalizado.
 * Formato normalizado: { type: 'charge.paid', providerRef, amountCents }.
 * Retorna null se a assinatura for invalida.
 */
export function parseWebhook(rawBody, headers) {
  const received = String(headers['x-signature'] || '');
  const expected = sign(rawBody);
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const body = JSON.parse(rawBody.toString('utf8'));
  return { type: body.type, providerRef: body.providerRef, amountCents: body.amountCents, withdrawalId: body.withdrawalId };
}

/** Assinatura HMAC usada pelo mock (e pelos testes para simular o PSP). */
export function sign(rawBody) {
  return createHmac('sha256', CONFIG.payments.webhookSecret).update(rawBody).digest('hex');
}
