import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { requireAuth } from '../middleware/session.js';
import * as Fair from '../domain/fairness.js';
import { audit, ipOf } from '../domain/audit.js';

export const fairRouter = Router();

// Verificador publico: qualquer pessoa recalcula um round com as seeds.
fairRouter.get('/verify', (req, res) => {
  const { serverSeed, clientSeed, nonce, rtpBps, maxMultX100 } = req.query;
  res.json(Fair.verify({ serverSeed, clientSeed, nonce, rtpBps, maxMultX100 }));
});

fairRouter.use(requireAuth);

fairRouter.get('/', wrap(async (req, res) => res.json(await Fair.status(req.user.id))));

fairRouter.post('/client-seed', wrap(async (req, res) => {
  res.json(await Fair.setClientSeed(req.user.id, req.body?.clientSeed));
}));

fairRouter.post('/rotate', wrap(async (req, res) => {
  const r = await Fair.rotate(req.user.id);
  await audit(null, { userId: req.user.id, action: 'seed_rotate', meta: { serverSeedHash: r.revealed.serverSeedHash }, ip: ipOf(req) });
  res.json(r);
}));
