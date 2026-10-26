// Log estruturado (uma linha JSON por evento) para agregadores (Loki, CloudWatch...).
// REGRA: nunca registrar corpo de requisicao, senha, CPF, chave PIX ou cookie.

import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config.js';

export function log(level, msg, fields = {}) {
  if (CONFIG.isTest && level !== 'error') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  (level === 'error' ? console.error : console.log)(line);
}

/** Middleware: id por requisicao + linha de acesso ao terminar. */
export function requestLog(req, res, next) {
  req.id = req.get('X-Request-Id')?.slice(0, 64) || randomUUID();
  res.set('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/healthz') return;
    log('info', 'http', {
      rid: req.id, method: req.method, path: req.baseUrl + req.path, status: res.statusCode,
      ms: Number((process.hrtime.bigint() - start) / 1000000n), user: req.user?.id ?? null,
    });
  });
  next();
}
