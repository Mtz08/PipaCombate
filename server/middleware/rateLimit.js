// Limites de requisicao. Barram forca bruta no login/cadastro e abuso da API.
// Store em memoria: vale por processo. Com mais de uma instancia, trocar por
// store compartilhado (ex.: rate-limit-redis) mantendo estas mesmas regras.
//
// IP real: depende de TRUST_PROXY com o numero EXATO de proxies (ver config.js).
// IPv6 e agrupado por /64: girar enderecos dentro da mesma rede nao burla o limite.

import { isIPv6 } from 'node:net';
import rateLimit from 'express-rate-limit';
import { CONFIG } from '../config.js';

const json = (code, message) => ({ error: { code, message } });
const skip = () => CONFIG.isTest; // testes de API fazem muitas chamadas seguidas

/** Expande um IPv6 (com "::") e devolve os 4 primeiros grupos (/64). */
export function ipv6Prefix64(ip) {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return full.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export function clientKey(req) {
  let ip = req.ip || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4 mapeado em IPv6
  return isIPv6(ip) ? ipv6Prefix64(ip) : ip;
}

const base = { standardHeaders: 'draft-7', legacyHeaders: false, skip, keyGenerator: clientKey };

/** Login/cadastro: 10 tentativas por IP a cada 15 min (o bloqueio por telefone fica no login). */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: json('RATE_LIMITED', 'Muitas tentativas. Aguarde alguns minutos.'),
});

/** API geral: 300 requisicoes por IP por minuto. */
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
  message: json('RATE_LIMITED', 'Muitas requisicoes. Tente de novo em instantes.'),
});

/** Por usuario logado (nao por IP): jogo e carteira. Bot ou script nao martela o banco. */
const perUser = (windowMs, limit, message) => rateLimit({
  ...base, windowMs, limit,
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : clientKey(req)),
  message: json('RATE_LIMITED', message),
});
export const gameLimiter = perUser(10 * 1000, 40, 'Calma! Muitas acoes seguidas.');        // ~4 cortes/s com folga
export const walletLimiter = perUser(60 * 1000, 20, 'Muitas operacoes na carteira. Aguarde um pouco.');
