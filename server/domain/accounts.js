// Logica de conta: cadastro, autenticacao, logout. Senha sempre com hash (bcrypt).

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, tx, isUniqueViolation } from '../db/index.js';
import { Users } from '../db/repos.js';
import { domainError } from '../util/money.js';
import { normalizeName, normalizePhone, assertPassword } from '../util/validate.js';
import { CONFIG } from '../config.js';
import { applyCredit } from './wallet.js';

// Custo 12 em producao (padrao atual); baixo em teste so para a suite rodar rapido.
const BCRYPT_COST = CONFIG.isTest ? 4 : 12;
// Hash fixo para comparar quando o telefone nao existe: mesmo tempo de resposta,
// assim o login nao revela quais telefones estao cadastrados.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-nunca-usado', BCRYPT_COST);

// Codigo de indicacao: 8 caracteres sem ambiguos (0/O, 1/I).
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newReferralCode = () => [...randomBytes(8)].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');

/** Cadastro. Rejeita telefone ja usado (409). ref e o codigo de afiliado de origem. */
export async function register({ name, phone, password, ref }) {
  const cleanName = normalizeName(name);
  const cleanPhone = normalizePhone(phone);
  assertPassword(password);

  if (await Users.getByPhone(db, cleanPhone)) {
    throw domainError('PHONE_TAKEN', 'Telefone ja cadastrado', 409);
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const cleanRef = ref ? String(ref).replace(/[^\w-]/g, '').slice(0, 32) || null : null;

  try {
    return await tx(async (t) => {
      const user = await Users.create(t, {
        name: cleanName, phone: cleanPhone, passwordHash, ref: cleanRef, referralCode: newReferralCode(),
      });
      if (CONFIG.signupBonusCents > 0) await applyCredit(t, user, CONFIG.signupBonusCents, 'bonus');
      return user;
    }).then(promoteIfAdmin);
  } catch (err) {
    // cadastro simultaneo com o mesmo telefone: o UNIQUE do banco decide
    if (isUniqueViolation(err, 'phone')) throw domainError('PHONE_TAKEN', 'Telefone ja cadastrado', 409);
    throw err;
  }
}

/** Login por telefone + senha. Mensagem e tempo iguais para telefone inexistente. */
export async function login({ phone, password }) {
  let cleanPhone;
  try { cleanPhone = normalizePhone(phone); } catch { cleanPhone = null; }
  const user = cleanPhone ? await Users.getByPhone(db, cleanPhone) : null;
  const ok = await bcrypt.compare(String(password ?? ''), user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) throw domainError('BAD_CREDENTIALS', 'Telefone ou senha invalidos', 401);
  return promoteIfAdmin(user);
}

/** Telefones em ADMIN_PHONES viram admin ao entrar (bootstrap sem tela de cadastro de admin). */
export async function promoteIfAdmin(user) {
  if (user.role !== 'admin' && CONFIG.adminPhones.includes(user.phone)) {
    await tx((t) => Users.setRole(t, user.id, 'admin'));
    user.role = 'admin';
  }
  return user;
}

/** Logout: invalida TODOS os cookies ja emitidos para o usuario. */
export async function logout(user) {
  await tx((t) => Users.bumpSessionVersion(t, user.id));
}

/** Formato de sessao entregue ao front (sem hash de senha, sem CPF). */
export function publicUser(user) {
  return { id: user.id, username: user.name, phone: user.phone, referralCode: user.referralCode, admin: user.role === 'admin' };
}
