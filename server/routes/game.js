import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { requireAuth } from '../middleware/session.js';
import * as Game from '../domain/game.js';

export const gameRouter = Router();
gameRouter.use(requireAuth); // todo o jogo exige login

gameRouter.get('/lobby', (_req, res) => res.json(Game.lobby()));

// round em andamento (retomar apos recarregar a pagina)
gameRouter.get('/active', wrap(async (req, res) => res.json(await Game.active(req.user.id))));

// rounds encerrados com dados de verificacao (provably fair)
gameRouter.get('/history', wrap(async (req, res) => res.json(await Game.history(req.user.id))));

gameRouter.post('/start', wrap(async (req, res) => {
  const { betCents, map } = req.body ?? {};
  res.status(201).json(await Game.start(req.user.id, { betCents, map }));
}));

gameRouter.post('/:round/cut', wrap(async (req, res) => {
  res.json(await Game.cut(req.user.id, req.params.round, { kind: req.body?.kind }));
}));

gameRouter.post('/:round/cashout', wrap(async (req, res) => {
  res.json(await Game.cashout(req.user.id, req.params.round));
}));

gameRouter.post('/:round/lose', wrap(async (req, res) => {
  res.json(await Game.lose(req.user.id, req.params.round, { reason: req.body?.reason }));
}));
