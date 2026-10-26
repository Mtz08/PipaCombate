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
