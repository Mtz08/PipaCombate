// Helpers SO para testes: cria usuario direto no banco, com saldo opcional.
import { randomUUID } from 'node:crypto';
import { db } from './index.js';
import { Users } from './repos.js';
import { credit } from '../domain/wallet.js';

export async function makeUser(phone, balanceCents = 0) {
  const user = await Users.create(db, {
    name: 'Teste', phone, passwordHash: 'x', ref: null, referralCode: randomUUID().slice(0, 8),
  });
  if (balanceCents > 0) await credit(user.id, balanceCents, 'deposit');
  return user;
}

export const balanceOf = async (userId) => (await Users.getById(db, userId)).balanceCents;

/** CPF valido (digitos verificadores corretos) a partir de um numero: um por conta nos testes. */
export function cpfValido(n) {
  const base = String(100000000 + (Number(n) % 899999999)).slice(0, 9).split('').map(Number);
  const dv = (d) => { const len = d.length; let s = 0; for (let i = 0; i < len; i++) s += d[i] * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  base.push(dv(base)); base.push(dv(base));
  return base.join('');
}
