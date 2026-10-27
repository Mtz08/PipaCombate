// Monta o app Express (sem abrir porta). Separado do index.js para os testes
// subirem a aplicacao numa porta efemera.

import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CONFIG } from './config.js';
import { db } from './db/index.js';
import { attachUser } from './middleware/session.js';
import { requireXhr } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { gameRouter } from './routes/game.js';
import { walletRouter } from './routes/wallet.js';
import { publicRouter } from './routes/public.js';
import { webhooksRouter } from './routes/webhooks.js';
import { fairRouter } from './routes/fair.js';
import { adminRouter } from './routes/admin.js';
import { indicacaoRouter } from './routes/indicacao.js';
import { requestLog } from './util/log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', CONFIG.trustProxy);

  // Headers de seguranca (CSP, HSTS, nosniff, frame-ancestors...).
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'], // imagem do popup (https) e pixels de imagem
        scriptSrc: ["'self'", 'https://connect.facebook.net', 'https://analytics.tiktok.com', 'https://cdn.utmify.com.br'],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        styleSrcAttr: ["'none'"], // cores dinamicas vao por JS (style.setProperty), nunca style="" no HTML
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        // hosts exatos dos pixels (so carregam com consentimento); nada de curinga
        connectSrc: ["'self'", 'https://www.facebook.com', 'https://connect.facebook.net', 'https://analytics.tiktok.com', 'https://cdn.utmify.com.br', 'https://api.utmify.com.br'],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        workerSrc: ["'self'"],
        upgradeInsecureRequests: CONFIG.isProd ? [] : null,
      },
    },
    hsts: CONFIG.isProd ? { maxAge: 63072000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  }));
  // recursos do navegador que o jogo nao usa ficam desligados
  app.use((_req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'); next(); });

  // corpo pequeno: so dados de formulario. rawBody guardado para validar webhooks.
  app.use(express.json({ limit: '32kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(cookieParser());
  app.use(requestLog);

  // health check do load balancer: inclui o banco
  app.get('/healthz', async (_req, res) => {
    try { await db.query('SELECT 1'); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  const api = express.Router();
  api.use(apiLimiter);
  api.use('/webhooks', webhooksRouter); // antes do CSRF: autenticado por assinatura
  api.use(attachUser);
  api.use(requireXhr);                  // CSRF em rotas mutaveis
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use('/public', publicRouter);
  api.use('/auth', authRouter);
  api.use('/game', gameRouter);
  api.use('/wallet', walletRouter);
  api.use('/fair', fairRouter);
  api.use('/admin', adminRouter);
  api.use('/indicacao', indicacaoRouter);
  api.use(notFound);
  app.use('/api', api);

  // Frontend estatico. Assets com cache; HTML sempre revalidado.
  app.use(express.static(PUBLIC_DIR, {
    maxAge: CONFIG.isProd ? '1h' : 0,
    setHeaders: (res, path) => { if (path.endsWith('.html')) res.set('Cache-Control', 'no-cache'); },
  }));
  app.get('*', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'index.html')));

  app.use(errorHandler);
  return app;
}
