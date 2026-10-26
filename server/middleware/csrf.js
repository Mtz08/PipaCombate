// Defesa CSRF simples, igual ao padrao do site: exige o header
// X-Requested-With: XMLHttpRequest em requisicoes que alteram estado.
// Como um formulario cross-site nao consegue enviar esse header customizado
// sem passar pelo preflight CORS (que o servidor nao autoriza), isso barra
// o CSRF classico. Combinado com SameSite=Lax no cookie, cobre o caso comum.

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function requireXhr(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: { code: 'CSRF', message: 'Requisicao nao permitida' } });
  }
  next();
}
