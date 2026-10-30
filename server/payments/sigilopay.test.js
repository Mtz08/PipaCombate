import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.js';
import { Charges, Withdrawals } from '../db/repos.js';
import { makeUser } from '../db/testing.js';
import { CONFIG } from '../config.js';
import { createPixCharge, sendPixTransfer, parseWebhook, nomeTitular, pixTipo } from './sigilopay.js';
import { firstPublicIpv4 } from '../util/validate.js';

test('saque usa o IPv4 publico e ignora IPv6 e rede interna', () => {
  assert.equal(firstPublicIpv4(['2804:14d::1', '10.0.0.8', '177.10.20.30']), '177.10.20.30');
  assert.equal(firstPublicIpv4('::ffff:8.8.8.8'), '8.8.8.8');
  assert.equal(firstPublicIpv4('2804:14d::1'), null);
});

test('nome do titular perde acento e a chave ganha o tipo certo', () => {
  assert.equal(nomeTitular('José da Silva!'), 'Jose da Silva');
  assert.equal(pixTipo('ana@exemplo.com', '52998224725'), 'email');
  assert.equal(pixTipo('52998224725', '52998224725'), 'cpf');
  assert.equal(pixTipo('+5528999119982', '52998224725'), 'phone');
  assert.equal(pixTipo('6f1e1b3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b', '52998224725'), 'random');
});

test('cobranca chama receber pix, devolve o copia-e-cola e o QR', async () => {
  const antes = { ...CONFIG.payments.sigilopay };
  Object.assign(CONFIG.payments.sigilopay, {
    publicKey: 'pub', secretKey: 'sec', publicBaseUrl: 'https://pipacombate.test',
  });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, 'https://app.sigilopay.com.br/api/v1/gateway/pix/receive');
    const body = JSON.parse(opts.body);
    assert.equal(body.amount, 50);
    assert.equal(body.callbackUrl, 'https://pipacombate.test/api/webhooks/payments');
    assert.equal(body.client.email, '28999119982@cliente.pipacombate.online');
    assert.equal(body.client.document, '52998224725');
    assert.equal(opts.headers['x-secret-key'], 'sec');
    return new Response(JSON.stringify({
      transactionId: 'tx1', status: 'OK', webhookToken: 'tok-cobranca',
      pix: { code: '00020126PIX', expiresAt: '2026-10-30T12:00:00.000Z' },
    }), { status: 200 });
  };
  try {
    const pix = await createPixCharge({
      chargeId: '11111111-1111-4111-8111-111111111111', amountCents: 5000, expiresAt: Date.now(),
      payer: { name: 'José', phone: '28999119982', document: '529.982.247-25' },
    });
    assert.equal(pix.providerRef, 'tx1');
    assert.equal(pix.copyPaste, '00020126PIX');
    assert.equal(pix.webhookToken, 'tok-cobranca');
    assert.ok(pix.qrCodeBase64?.length > 40);
  } finally {
    globalThis.fetch = original;
    Object.assign(CONFIG.payments.sigilopay, antes);
  }
});

test('webhook so credita com o token gravado; o valor usado e o que o jogador pagou', async () => {
  const u = await makeUser('11900001111');
  const c = await Charges.create(db, { userId: u.id, amountCents: 1000, provider: 'sigilopay', expiresAt: Date.now() + 60_000 });
  await Charges.attachPix(db, c.id, { providerRef: 'tx-pago', copyPaste: 'x', qrCodeBase64: null, webhookToken: 'segredo' });
  const pago = {
    event: 'TRANSACTION_PAID', token: 'segredo',
    transaction: { id: 'tx-pago', identifier: c.id, originalAmount: 10, amount: 9.5, status: 'COMPLETED' },
  };
  const ok = await parseWebhook(Buffer.from(JSON.stringify(pago)));
  assert.equal(ok.type, 'charge.paid');
  assert.equal(ok.providerRef, 'tx-pago');
  assert.equal(ok.amountCents, 1000);
  assert.equal(await parseWebhook(Buffer.from(JSON.stringify({ ...pago, token: 'outro' }))), null);
});

test('saque recusado e definitivo; timeout 504 nao e', async () => {
  const antes = { ...CONFIG.payments.sigilopay };
  Object.assign(CONFIG.payments.sigilopay, { publicKey: 'pub', secretKey: 'sec', publicBaseUrl: 'https://pipacombate.test' });
  const original = globalThis.fetch;
  const pedido = { withdrawalId: '22222222-2222-4222-8222-222222222222', amountCents: 3000, pixKey: 'ana@exemplo.com', cpf: '52998224725', ownerName: 'Ana', clientIp: '177.0.0.1' };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ statusCode: 400, message: 'O documento do proprietário não corresponde à chave Pix.' }), { status: 400 });
    await assert.rejects(sendPixTransfer(pedido), (err) => err.definitive === true);
    globalThis.fetch = async () => new Response('timeout', { status: 504 });
    await assert.rejects(sendPixTransfer(pedido), (err) => err.definitive === false);
  } finally {
    globalThis.fetch = original;
    Object.assign(CONFIG.payments.sigilopay, antes);
  }
});

test('webhook de saque que falhou aponta o pedido pelo nosso id', async () => {
  const u = await makeUser('11900002222');
  const w = await Withdrawals.create(db, {
    userId: u.id, amountCents: 3000, pixKey: 'ana@exemplo.com', pixKeyMask: 'an***om', provider: 'sigilopay', clientIp: '177.0.0.1',
  });
  await Withdrawals.finish(db, w.id, { status: 'processing', providerRef: 'wd1', webhookToken: 'tok-saque', from: ['processing'] });
  const ev = await parseWebhook(Buffer.from(JSON.stringify({
    event: 'TRANSFER_FAILED', token: 'tok-saque',
    withdraw: { id: 'wd1', clientIdentifier: w.id, amount: 30, status: 'CANCELED', message: 'Chave PIX invalida' },
  })));
  assert.equal(ev.type, 'transfer.failed');
  assert.equal(ev.withdrawalId, w.id);
  assert.equal(ev.providerRef, 'wd1');
});
