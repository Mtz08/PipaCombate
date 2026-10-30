import { domainError } from './money.js';

// Validacoes de entrada. Pequenas, puras, uma responsabilidade cada.

const PHONE_RE = /^\d{10,13}$/;      // somente digitos (DDD + numero)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza telefone: tira tudo que nao e digito. */
export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!PHONE_RE.test(digits)) {
    throw domainError('INVALID_PHONE', 'Telefone invalido');
  }
  return digits;
}

/** Valida CPF com digitos verificadores. Retorna so os digitos; NAO persistimos (LGPD). */
export function assertCpf(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!isValidCpf(d)) throw domainError('INVALID_CPF', 'CPF invalido');
  return d;
}

export function isValidCpf(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Aceita os 5 tipos de chave PIX: CPF, CNPJ, e-mail, telefone (+55...) e aleatoria (UUID). */
export function normalizePixKey(raw) {
  const k = String(raw ?? '').trim();
  if (!k) throw domainError('INVALID_PIX_KEY', 'Informe a chave PIX');
  if (EMAIL_RE.test(k) && k.length <= 77) return k.toLowerCase();
  if (UUID_RE.test(k)) return k.toLowerCase();
  if (/^\+55\d{10,11}$/.test(k.replace(/[\s()-]/g, ''))) return k.replace(/[\s()-]/g, '');
  const digits = k.replace(/\D/g, '');
  if (digits.length === 11 && isValidCpf(digits)) return digits;
  if (digits.length === 14) return digits; // CNPJ
  throw domainError('INVALID_PIX_KEY', 'Chave PIX invalida');
}

/**
 * Primeiro IPv4 publico numa lista (X-Forwarded-For, req.ips, req.ip).
 * Ignora loopback e rede privada. IPv6 sozinho devolve null: a SigiloPay
 * exige IPv4 no saque e nao ha como inventar o endereco do jogador.
 */
export function firstPublicIpv4(...chunks) {
  const parts = chunks.flat().filter((v) => v != null && v !== '').join(',').split(/[,\s]+/);
  for (const part of parts) {
    const s = String(part).trim().replace(/^::ffff:/i, '').replace(/^\[|\]$/g, '');
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(s)) continue;
    const n = s.split('.').map(Number);
    if (n.some((x) => x > 255)) continue;
    if (n[0] === 10 || n[0] === 127 || n[0] === 0) continue;
    if (n[0] === 192 && n[1] === 168) continue;
    if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) continue;
    if (n[0] === 169 && n[1] === 254) continue;
    return n.join('.');
  }
  return null;
}

/** Mascara a chave PIX para extrato/log (LGPD): mostra so inicio e fim. */
export function maskPixKey(k) {
  if (k.length <= 4) return '***';
  return `${k.slice(0, 2)}***${k.slice(-2)}`;
}

/** Valida nome de exibicao. Remove caracteres de controle. */
export function normalizeName(raw) {
  const name = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  if (name.length < 2) throw domainError('INVALID_NAME', 'Nome muito curto');
  return name;
}

/** Valida senha minima. */
export function assertPassword(raw) {
  const pw = String(raw ?? '');
  if (pw.length < 8) throw domainError('WEAK_PASSWORD', 'Senha deve ter ao menos 8 caracteres');
  if (Buffer.byteLength(pw, 'utf8') > 72) throw domainError('WEAK_PASSWORD', 'Senha muito longa'); // bcrypt usa so 72 bytes
  return pw;
}
