// Seletor do provider de pagamento (PSP).
//
// Contrato que todo provider implementa:
//   createPixCharge({ chargeId, amountCents, expiresAt }) -> { providerRef, copyPaste, qrCodeBase64, expiresAt }
//   sendPixTransfer({ withdrawalId, amountCents, pixKey, cpf }) -> { providerRef, status: 'paid' | 'processing' }
//   parseWebhook(rawBody, headers) -> { type, providerRef, amountCents } | null (assinatura invalida)

import { CONFIG } from '../config.js';
import * as mock from './mock.js';

// Objetos simples (copia do modulo) para os testes poderem substituir metodos.
export const providers = { mock: { ...mock } };

export function getProvider() {
  const p = providers[CONFIG.payments.provider];
  if (!p) throw new Error(`Provider de pagamento desconhecido: ${CONFIG.payments.provider}`);
  return p;
}
