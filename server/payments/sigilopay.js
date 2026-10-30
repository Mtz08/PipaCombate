// SigiloPay (API v1). Cobranca: POST /gateway/pix/receive. Saque: POST /gateway/transfers.
// O webhook chega em POST com `token` no JSON (o mesmo webhookToken da criacao), nao HMAC.
// Uma URL fixa para todas as transacoes: URL diferente por cobranca estoura o limite de 20.
// Valores na API sao em reais. 504 e erro de rede no saque NAO sao recusa: o PIX pode ter saido.

import { timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { CONFIG } from '../config.js';
import { db } from '../db/index.js';

const base = () => CONFIG.payments.sigilopay.baseUrl.replace(/\/$/, '');

/** Nome do titular no saque: so letras, sem acento, ate 100. */
export function nomeTitular(name) {
  const limpo = String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return limpo || 'Jogador';
}

/** Tipo da chave no formato da SigiloPay. */
export function pixTipo(key, cpf) {
  if (String(key).includes('@')) return 'email';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return 'random';
  const digits = String(key).replace(/\D/g, '');
  if (digits.length === 14) return 'cnpj';
  if (String(key).startsWith('+') || (digits.length >= 12 && digits.startsWith('55'))) return 'phone';
  if (digits.length === 11 && digits === String(cpf || '').replace(/\D/g, '')) return 'cpf';
  if (digits.length === 11) return 'phone';
  return 'cpf';
}

function reais(cents) {
  return Math.round(Number(cents)) / 100;
}

function centsOf(reaisValor) {
  const n = Number(reaisValor);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function ipv4(ip) {
  const s = String(ip || '').trim().replace(/^::ffff:/i, '');
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(s)) return s;
  const err = new Error('IP do jogador nao e IPv4');
  err.definitive = true;
  throw err;
}

function callbackUrl() {
  const pub = CONFIG.payments.sigilopay.publicBaseUrl.replace(/\/$/, '');
  if (!pub) {
    const err = new Error('PUBLIC_BASE_URL ausente');
    err.definitive = true;
    throw err;
  }
  return `${pub}/api/webhooks/payments`;
}

function emailDoJogador(phone) {
  const digits = String(phone || '').replace(/\D/g, '') || 'jogador';
  return `${digits}@cliente.pipacombate.online`;
}

async function qrDoCodigo(code) {
  try {
    const dataUrl = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
    return dataUrl.replace(/^data:image\/png;base64,/, '');
  } catch {
    return null;
  }
}

async function call(method, path, body) {
  const { publicKey, secretKey } = CONFIG.payments.sigilopay;
  if (!publicKey || !secretKey) {
    const err = new Error('Chaves da SigiloPay ausentes');
    err.definitive = true;
    throw err;
  }
  let res;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-public-key': publicKey,
        'x-secret-key': secretKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    const e = new Error(`SigiloPay indisponivel: ${err.message}`);
    e.definitive = false;
    throw e;
  }
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text.slice(0, 180) }; }
  if (!res.ok) {
    const e = new Error(json.message || `SigiloPay HTTP ${res.status}`);
    // 504 e 5xx: a operacao pode ter seguido no servidor deles.
    e.definitive = res.status !== 504 && res.status < 500;
    e.status = res.status;
    throw e;
  }
  return json;
}

export async function createPixCharge({ chargeId, amountCents, expiresAt, payer }) {
  const json = await call('POST', '/gateway/pix/receive', {
    identifier: chargeId,
    amount: reais(amountCents),
    client: {
      name: nomeTitular(payer?.name),
      email: emailDoJogador(payer?.phone),
      phone: String(payer?.phone || '').replace(/\D/g, ''),
      // O adquirente desta conta recusa a cobranca sem o CPF do pagador.
      ...(payer?.document ? { document: String(payer.document).replace(/\D/g, '') } : {}),
    },
    callbackUrl: callbackUrl(),
  });
  if (json.status === 'FAILED' || json.status === 'REJECTED' || json.status === 'CANCELED' || !json?.pix?.code || !json.transactionId) {
    const err = new Error(json.errorDescription || json.details || 'Cobranca PIX recusada');
    err.definitive = true;
    throw err;
  }
  const deles = json.pix.expiresAt ? new Date(json.pix.expiresAt).getTime() : null;
  return {
    providerRef: json.transactionId,
    copyPaste: json.pix.code,
    qrCodeBase64: await qrDoCodigo(json.pix.code),
    expiresAt: Number.isFinite(deles) ? deles : expiresAt,
    webhookToken: json.webhookToken || null,
  };
}

export async function sendPixTransfer({ withdrawalId, amountCents, pixKey, cpf, ownerName, clientIp }) {
  const json = await call('POST', '/gateway/transfers', {
    identifier: withdrawalId,
    amount: reais(amountCents),
    discountFeeOfReceiver: false,
    pix: { type: pixTipo(pixKey, cpf), key: pixKey },
    owner: {
      ip: ipv4(clientIp),
      name: nomeTitular(ownerName),
      document: { type: 'cpf', number: String(cpf || '').replace(/\D/g, '') },
    },
    callbackUrl: callbackUrl(),
  });
  const status = json?.withdraw?.status;
  if (status === 'CANCELED') {
    const err = new Error(json.withdraw.rejectedReason || 'Saque recusado');
    err.definitive = true;
    throw err;
  }
  if (!json?.withdraw?.id) {
    const err = new Error('Resposta de saque sem id');
    err.definitive = false;
    throw err;
  }
  return {
    providerRef: json.withdraw.id,
    status: status === 'COMPLETED' ? 'paid' : 'processing',
    webhookToken: json.webhookToken || null,
  };
}

const EVENTOS = {
  TRANSACTION_PAID: 'charge.paid',
  TRANSACTION_REFUNDED: 'charge.refunded',
  TRANSACTION_CHARGED_BACK: 'charge.refunded',
  TRANSFER_COMPLETED: 'transfer.paid',
  TRANSFER_FAILED: 'transfer.failed',
};

function tokensIguais(stored, received) {
  const a = Buffer.from(String(stored || ''));
  const b = Buffer.from(String(received || ''));
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function tokenConfere(token, nossoId, refDeles) {
  const rows = await db.query(
    `SELECT webhook_token FROM charges WHERE webhook_token IS NOT NULL AND (id::text = $1 OR provider_ref = $2)
     UNION ALL
     SELECT webhook_token FROM withdrawals WHERE webhook_token IS NOT NULL AND (id::text = $1 OR provider_ref = $2)`,
    [String(nossoId || ''), String(refDeles || '')],
  );
  return rows.some((r) => tokensIguais(r.webhook_token, token));
}

/**
 * Valida o token e devolve o evento no formato do jogo.
 * Retorna null se o token nao bater. Evento desconhecido com token valido vira 'ignored' (200).
 */
export async function parseWebhook(rawBody) {
  let body;
  try { body = JSON.parse(rawBody.toString('utf8')); } catch { return null; }
  const token = body?.token;
  if (!token || typeof token !== 'string') return null;

  const tx = body.transaction;
  const wd = body.withdraw;
  const nossoId = tx?.identifier || wd?.clientIdentifier || null;
  const refDeles = tx?.id || wd?.id || null;
  if (!(await tokenConfere(token, nossoId, refDeles))) return null;

  const type = EVENTOS[body.event];
  if (!type) return { type: 'ignored', providerRef: refDeles, amountCents: 0, withdrawalId: nossoId };
  const amountCents = centsOf(tx ? (tx.originalAmount ?? tx.amount) : wd?.amount) ?? 0;
  return { type, providerRef: refDeles, amountCents, withdrawalId: nossoId };
}
