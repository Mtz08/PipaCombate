// Configuracoes editaveis pelo admin, guardadas na tabela settings (chave -> JSON).
// Cada chave tem um padrao e um validador; o valor salvo e sempre normalizado.
// Leitura com cache curto: as rotas leem a cada requisicao sem pesar no banco.

import { db, tx } from '../db/index.js';
import { domainError } from '../util/money.js';

const TTL_MS = 5000;
const cache = new Map();

const int = (v, min, max, campo) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw domainError('INVALID_SETTING', `${campo}: valor fora do permitido (${min} a ${max})`);
  return n;
};

/** Padroes e validacao de cada chave. */
export const SCHEMAS = {
  afiliados: {
    padrao: {
      ativo: true,
      modelo: 'deposito',             // 'cpa' | 'deposito' | 'revshare'
      niveisPct: [10, 5, 3],           // % por nivel (deposito e revshare)
      cpaCents: [1000, 0, 0],          // valor fixo por nivel (cpa), pago no 1o deposito
      cpaDepositoMinCents: 2500,       // deposito minimo para liberar o CPA
      saqueMinCents: 3000,
      saqueMaxCents: 500000,
    },
    validar(v) {
      const modelo = ['cpa', 'deposito', 'revshare'].includes(v.modelo) ? v.modelo : null;
      if (!modelo) throw domainError('INVALID_SETTING', 'modelo: use cpa, deposito ou revshare');
      const tres = (arr, max, campo) => {
        if (!Array.isArray(arr) || arr.length !== 3) throw domainError('INVALID_SETTING', `${campo}: informe 3 niveis`);
        return arr.map((x, i) => int(x, 0, max, `${campo} nivel ${i + 1}`));
      };
      const out = {
        ativo: v.ativo !== false,
        modelo,
        niveisPct: tres(v.niveisPct, 50, 'percentual'),
        cpaCents: tres(v.cpaCents, 100000, 'CPA'),
        cpaDepositoMinCents: int(v.cpaDepositoMinCents, 0, 1000000, 'deposito minimo do CPA'),
        saqueMinCents: int(v.saqueMinCents, 100, 10000000, 'saque minimo'),
        saqueMaxCents: int(v.saqueMaxCents, 100, 10000000, 'saque maximo'),
      };
      if (out.saqueMaxCents < out.saqueMinCents) throw domainError('INVALID_SETTING', 'saque maximo menor que o minimo');
      if (out.niveisPct.reduce((a, b) => a + b, 0) > 60) throw domainError('INVALID_SETTING', 'soma dos percentuais acima de 60%');
      return out;
    },
  },
};

/** Le a configuracao. Dentro de transacao, passe o executor `q` (PGlite tem
 *  uma conexao so: consultar `db` com a transacao aberta trava). */
export async function getSetting(key, q = db) {
  const s = SCHEMAS[key];
  if (!s) throw new Error(`setting desconhecida: ${key}`);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = (await q.query('SELECT value FROM settings WHERE key = $1', [key]))[0];
  const value = { ...s.padrao, ...(row ? row.value : {}) };
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** Salva (validado) e devolve o valor final. Auditoria fica com quem chama. */
export async function setSetting(key, value, actorId) {
  const s = SCHEMAS[key];
  if (!s) throw domainError('NOT_FOUND', 'Configuracao inexistente', 404);
  const clean = s.validar({ ...s.padrao, ...(value || {}) });
  await tx((t) => t.query(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(clean), actorId],
  ));
  cache.delete(key);
  return clean;
}
