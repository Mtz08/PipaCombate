import { Router } from 'express';
import { CONFIG } from '../config.js';

export const publicRouter = Router();

// Config publica, sem autenticacao e sem dado sensivel. Espelha o
// /api/public/config do site original, mas marcado como ambiente DEV/MOCK.
publicRouter.get('/config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(CONFIG.public);
});
