// Corpo de requisição da API: JSON que não é um objeto vira 400 "pedido inválido"; erro de verdade do servidor continua 500.
export class BadRequest extends Error {
  constructor() {
    super('pedido inválido');
    this.badRequest = true;
  }
}

/** Texto do corpo → objeto. Vazio vira {}; JSON quebrado, null, lista ou número lançam BadRequest. */
export function parseBody(text) {
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new BadRequest(); }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest();
  return body;
}

export const statusOf = (e) => (e?.badRequest ? 400 : 500);

/** Lê o corpo como UTF-8. `setEncoding` junta bytes de um mesmo caractere que chegaram em pedaços diferentes (sem isso "ã" vira "�"). */
export function readBodyText(req, max = 2e6) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { s += c; if (s.length > max) req.destroy(); });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}
