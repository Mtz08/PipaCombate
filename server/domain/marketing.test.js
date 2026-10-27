// Testes de marketing: UTMs no cadastro, IDs de pixel e popup validados.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Users } from '../db/repos.js';
import { register } from './accounts.js';
import { setSetting } from './settings.js';

after(async () => { await setSetting('marketing', null, null); await setSetting('publico', null, null); });

test('cadastro guarda so as UTMs conhecidas, curtas e sem caractere de controle', async () => {
  const u = await register({
    name: 'Via Anuncio', phone: '11944440001', password: 'senha-forte-1', terms: true,
    utm: { utm_source: 'tiktok', utm_campaign: 'x'.repeat(500), outra: 'ignorada', utm_medium: 'pago\u0000' },
  });
  const row = await Users.getById(db, u.id);
  assert.deepEqual(Object.keys(row.utm).sort(), ['utm_campaign', 'utm_medium', 'utm_source']);
  assert.equal(row.utm.utm_campaign.length, 200);
  assert.equal(row.utm.utm_medium, 'pago');

  const v = await register({ name: 'Sem Utm', phone: '11944440002', password: 'senha-forte-1', terms: true, utm: 'lixo' });
  assert.equal((await Users.getById(db, v.id)).utm, null);
});

test('IDs de pixel e popup sao validados', async () => {
  await assert.rejects(() => setSetting('marketing', { metaPixelId: '<script>' }, null), (e) => e.code === 'INVALID_SETTING');
  const ok = await setSetting('marketing', { metaPixelId: '123456789012345', tiktokPixelId: 'C1ABCDEF2GHIJ3' }, null);
  assert.equal(ok.metaPixelId, '123456789012345');

  await assert.rejects(() => setSetting('publico', { popup: { ativo: true } }, null), (e) => e.code === 'INVALID_SETTING');
  await assert.rejects(() => setSetting('publico', { popup: { ativo: true, titulo: 'Oi', imagemUrl: 'javascript:alert(1)' } }, null), (e) => e.code === 'INVALID_SETTING');
  await assert.rejects(() => setSetting('publico', { popup: { ativo: true, titulo: 'Oi', botaoAcao: 'link' } }, null), (e) => e.code === 'INVALID_SETTING');
  const p = await setSetting('publico', { popup: { ativo: true, titulo: 'Bônus de fim de semana', botaoAcao: 'depositar', frequencia: 'diaria' } }, null);
  assert.equal(p.popup.botaoAcao, 'depositar');
});
