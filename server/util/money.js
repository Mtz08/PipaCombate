// Helpers de dinheiro. REGRA: dinheiro e sempre inteiro em centavos.
// Nunca usar float para somar/subtrair saldo (evita erro de arredondamento).

/** Verdadeiro se v e um inteiro de centavos valido (>= 0, sem fracao). */
export function isValidCents(v) {
  return Number.isInteger(v) && v >= 0;
}

/** Garante inteiro de centavos dentro de [min, max]; lanca Error de dominio. */
export function assertCentsInRange(v, min, max, label = 'valor') {
  if (!Number.isInteger(v)) {
    throw domainError('INVALID_AMOUNT', `${label} deve ser inteiro em centavos`);
  }
  if (v < min || v > max) {
    throw domainError('OUT_OF_RANGE', `${label} fora do intervalo permitido`);
  }
  return v;
}

/** Formata centavos como "R$ 0,00" (apenas para log/legibilidade). */
export function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Cria um erro de dominio com codigo e status HTTP sugerido. */
export function domainError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status, domain: true });
}
