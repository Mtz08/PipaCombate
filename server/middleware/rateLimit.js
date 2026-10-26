// Limites de requisicao. Barram forca bruta no login/cadastro e abuso da API.
// Store em memoria: vale por processo. Com mais de uma instancia, trocar por
// store compartilhado (ex.: rate-limit-redis) mantendo estas mesmas regras.

import rateLimit from 'express-rate-limit';
import { CONFIG } from '../config.js';

const json = (code, message) => ({ error: { code, message } });
const skip = () => CONFIG.isTest; // testes de API fazem muitas chamadas seguidas

/** Login/cadastro: 10 tentativas por IP a cada 15 min. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: json('RATE_LIMITED', 'Muitas tentativas. Aguarde alguns minutos.'),
});

/** API geral: 300 requisicoes por IP por minuto. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: json('RATE_LIMITED', 'Muitas requisicoes. Tente de novo em instantes.'),
});
