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

// UTMs da primeira visita (origem da campanha), guardadas no cadastro.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'src', 'sck', 'xcod'];
/** So as chaves conhecidas, texto curto e sem controle. */
function cleanUtm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of UTM_KEYS) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  }
  return Object.keys(out).length ? out : null;
}

/** Cadastro. Rejeita telefone ja usado (409). ref e o codigo de afiliado de origem.
 *  terms: aceite de "maior de 18 + termos de uso", obrigatorio. utm: origem da campanha. */
export async function register({ name, phone, password, ref, terms, utm }) {
  const cleanName = normalizeName(name);
  const cleanPhone = normalizePhone(phone);
  assertPassword(password);
  if (terms !== true) throw domainError('TERMS_REQUIRED', 'Confirme que tem 18 anos ou mais e aceita os termos');

  if (await Users.getByPhone(db, cleanPhone)) {
    throw domainError('PHONE_TAKEN', 'Telefone ja cadastrado', 409);
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const cleanRef = ref ? String(ref).replace(/[^\w-]/g, '').toUpperCase().slice(0, 32) || null : null;
  // codigo inexistente nao barra o cadastro: so nao vincula a nenhum afiliado
  const referrer = cleanRef ? await Users.getByReferralCode(db, cleanRef) : null;

  try {
    return await tx(async (t) => {
      const user = await Users.create(t, {
        name: cleanName, phone: cleanPhone, passwordHash, ref: cleanRef, referralCode: newReferralCode(),
        referredBy: referrer?.id ?? null, termsVersion: CONFIG.termsVersion, utm: cleanUtm(utm),
      });
      if (CONFIG.signupBonusCents > 0) await applyCredit(t, user, CONFIG.signupBonusCents, 'bonus');
      return user;
    });
  } catch (err) {
    // cadastro simultaneo com o mesmo telefone: o UNIQUE do banco decide
    if (isUniqueViolation(err, 'phone')) throw domainError('PHONE_TAKEN', 'Telefone ja cadastrado', 409);
    throw err;
  }
}

// Bloqueio progressivo por telefone: a partir de 5 erros seguidos, 15 min,
// dobrando a cada erro novo (teto 24h). Vale para telefone cadastrado ou nao:
// a resposta e a mesma, entao nao revela quais numeros tem conta.
const FREE_FAILS = 5;
const LOCK_BASE_MS = 15 * 60 * 1000;
const LOCK_MAX_MS = 24 * 3600 * 1000;

async function assertNotLocked(phone) {
  const row = (await db.query('SELECT locked_until FROM login_throttle WHERE phone = $1', [phone]))[0];
  const until = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
  if (until > Date.now()) {
    const min = Math.ceil((until - Date.now()) / 60000);
    throw domainError('LOGIN_LOCKED', `Muitas tentativas erradas. Tente de novo em ${min} min.`, 429);
  }
}

async function registerFail(phone) {
  const r = (await db.query(
    `INSERT INTO login_throttle (phone, fails, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (phone) DO UPDATE SET fails = login_throttle.fails + 1, updated_at = now()
     RETURNING fails`, [phone],
  ))[0];
  if (r.fails >= FREE_FAILS) {
    const ms = Math.min(LOCK_BASE_MS * 2 ** (r.fails - FREE_FAILS), LOCK_MAX_MS);
    await db.query('UPDATE login_throttle SET locked_until = $2 WHERE phone = $1', [phone, new Date(Date.now() + ms)]);
  }
}

/** Login por telefone + senha. Mensagem e tempo iguais para telefone inexistente. */
export async function login({ phone, password }) {
  let cleanPhone;
  try { cleanPhone = normalizePhone(phone); } catch { cleanPhone = null; }
  if (cleanPhone) await assertNotLocked(cleanPhone);
  const user = cleanPhone ? await Users.getByPhone(db, cleanPhone) : null;
  const ok = await bcrypt.compare(String(password ?? ''), user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) {
    if (cleanPhone) await registerFail(cleanPhone);
    throw domainError('BAD_CREDENTIALS', 'Telefone ou senha invalidos', 401);
  }
  await db.query('DELETE FROM login_throttle WHERE phone = $1', [cleanPhone]);
  return user;
}

/** Confere a senha de quem ja esta logado (reautenticacao antes de sacar). */
export async function assertPasswordOf(user, password) {
  const ok = await bcrypt.compare(String(password ?? ''), user.passwordHash);
  if (!ok) throw domainError('BAD_PASSWORD', 'Senha incorreta', 403);
}

/** Logout: invalida TODOS os cookies ja emitidos para o usuario. */
export async function logout(user) {
  await tx((t) => Users.bumpSessionVersion(t, user.id));
}

/** Formato de sessao entregue ao front (sem hash de senha, sem CPF). */
export function publicUser(user) {
  return { id: user.id, username: user.name, phone: user.phone, referralCode: user.referralCode, admin: user.role === 'admin' };
}
