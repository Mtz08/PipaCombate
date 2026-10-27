import { Router } from 'express';
import { CONFIG } from '../config.js';
import { wrap } from '../middleware/error.js';
import { getSetting } from '../domain/settings.js';

export const publicRouter = Router();

// Config publica, sem autenticacao e sem dado sensivel. Espelha o
// /api/public/config do site original, mas marcado como ambiente DEV/MOCK.
publicRouter.get('/config', wrap(async (_req, res) => {
  const [pub, lim, jogo, mkt] = await Promise.all([getSetting('publico'), getSetting('limites'), getSetting('jogo'), getSetting('marketing')]);
  res.set('Cache-Control', 'no-store');
  res.json({
    ...CONFIG.public,
    site_nome: pub.siteNome,
    deposito_valores_rapidos: pub.depositoRapidoCents.map((c) => c / 100),
    deposito_botoes_labels: Object.fromEntries(Object.entries(pub.depositoRotulos).map(([c, v]) => [c / 100, v])),
    deposito_botoes_cores: Object.fromEntries(Object.entries(pub.depositoCores).map(([c, v]) => [c / 100, v])),
    suporte_links: pub.suporte,
    fin: { deposito_minimo: lim.depositMinCents / 100, deposito_maximo: lim.depositMaxCents / 100, saque_minimo: lim.withdrawMinCents / 100, saque_maximo: lim.withdrawMaxCents / 100 },
    jogo: { rtp: jogo.rtpBps / 100, ganho_maximo: jogo.maxMultX100 / 100 },
    popup: pub.popup,
    pixel_meta_id: mkt.metaPixelId, pixel_tiktok_id: mkt.tiktokPixelId,
    utmify_pixel_id: mkt.utmifyPixelId, utmify_utms: mkt.utmifyUtms,
  });
}));
