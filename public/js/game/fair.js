// Verificador provably fair que roda NO NAVEGADOR (WebCrypto), sem depender
// do servidor. Mesmo algoritmo de server/domain/fairness.js:
//   u = HMAC_SHA256(server_seed, "client_seed:nonce")[0..6] / 2^48
//   vento = floor(100 * RTP / (1 - u)) / 100, limitado a 50x
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** Ponto em que o vento vira (mesmo algoritmo de server/domain/fairness.js). */
export async function windPoint({ serverSeed, clientSeed, nonce, rtpBps = 9600, maxMultX100 = 5000 }) {
  const key = await crypto.subtle.importKey('raw', enc.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const b = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}`)));
  let x = 0; for (let i = 0; i < 6; i++) x = x * 256 + b[i];
  const u = x / 2 ** 48;
  return { serverSeedHash: await sha256Hex(serverSeed), windX100: Math.min(Math.floor((rtpBps / (1 - u)) / 100), maxMultX100) };
}
