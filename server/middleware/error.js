import { log } from '../util/log.js';

// Tratador central de erros. Erros de dominio viram resposta previsivel;
// erros inesperados viram 500 generico (sem vazar stack ao cliente).

export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota inexistente' } });
}

export function errorHandler(err, req, res, _next) {
  if (err?.domain) {
    const body = { error: { code: err.code, message: err.message } };
    if (Number.isInteger(err.balanceCents)) body.balanceCents = err.balanceCents;
    return res.status(err.status || 400).json(body);
  }
  // JSON malformado ou corpo grande demais vindos do express.json
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Corpo invalido' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Corpo grande demais' } });
  }
  // nao sensivel: so metodo, rota e mensagem — nunca corpo da requisicao
  log('error', 'erro-inesperado', { rid: req.id, method: req.method, path: req.path, err: err?.message });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erro no servidor. Tente de novo.' } });
}

/** Envolve handler async para encaminhar rejeicoes ao errorHandler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
