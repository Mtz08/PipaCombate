// Senha de acesso ao ambiente de demonstracao (HTTP Basic). Ligada so quando
// DEMO_ACCESS_PASSWORD existe: o navegador pede usuario/senha antes de abrir
// qualquer pagina. Serve para mostrar o site a equipe sem deixa-lo aberto ao
// publico (dados de demonstracao, dinheiro ficticio). O webhook do PSP e o
// health check ficam de fora (nao sao paginas).

import { timingSafeEqual } from 'node:crypto';
import { CONFIG } from '../config.js';

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function demoGate(req, res, next) {
  const { user, password } = CONFIG.demoAccess;
  if (!password || req.path === '/healthz' || req.path.startsWith('/api/webhooks/')) return next();
  const [scheme, b64] = String(req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && b64) {
    const [u, ...rest] = Buffer.from(b64, 'base64').toString().split(':');
    if (same(u, user) && same(rest.join(':'), password)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Pipa Combate - demonstracao", charset="UTF-8"');
  res.status(401).send('Acesso restrito: ambiente de demonstracao.');
}
