// Cifra de dados sensiveis em repouso (AES-256-GCM) e hash de documento.
// A chave vem de CONFIG.dataKey (DATA_KEY), nunca do banco.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { CONFIG } from '../config.js';

const key = () => createHash('sha256').update(CONFIG.dataKey).digest();

/** "iv.tag.dados" em base64url. */
export function seal(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function open(sealed) {
  const [iv, tag, data] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

/** Hash com chave do CPF: permite comparar titulares sem guardar o CPF. */
export const cpfHash = (cpf) => createHmac('sha256', CONFIG.dataKey).update(`cpf:${cpf}`).digest('hex');
