import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { requireAuth } from '../middleware/session.js';
import * as Affiliates from '../domain/affiliates.js';

export const indicacaoRouter = Router();
indicacaoRouter.use(requireAuth);

// painel "Indique e ganhe": codigo, niveis, indicados, ganhos e saldo de comissao
indicacaoRouter.get('/info', wrap(async (req, res) => res.json(await Affiliates.info(req.user))));
