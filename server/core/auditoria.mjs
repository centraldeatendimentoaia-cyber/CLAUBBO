// Registro de auditoria: toda rota que apaga ou sobrescreve dados deixa uma linha em data/auditoria.jsonl.
// Guarda só quem, o quê e o resultado (método, caminho, papel do token, status). Nunca o corpo do pedido nem tokens.
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024; // shortcut: um único arquivo antigo (.1) fica de reserva; mais histórico exige rotação melhor
export const FILE = 'auditoria.jsonl';

/** PUT e DELETE sempre; entre os POST, os que restauram, apagam por aprovação, renomeiam, gravam arquivo ou aprovam código. */
const AUDITED = /^(DELETE|PUT) |^POST \/api\/(backups\/[^/]+\/restore|agent-proposals\/[^/]+\/approve|ops\/tasks\/[^/]+\/approve|rooms\/rename|deliveries\/upload\/)/;
export const shouldAudit = (method, pathname) => AUDITED.test(`${method} ${pathname}`);

/** Acrescenta uma linha. Falha de gravação nunca derruba o pedido: vai para o console. */
export function record(dir, entry, now = Date.now()) {
  const e = { at: new Date(now).toISOString(), ...entry, path: String(entry.path ?? '').slice(0, 200) };
  const file = path.join(dir, FILE);
  try {
    try { if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`); } catch {}
    fs.appendFileSync(file, JSON.stringify(e) + '\n');
  } catch (err) { console.error('auditoria: não gravou', err?.message); }
  console.log(`auditoria: ${e.who ?? '-'} ${e.method} ${e.path} -> ${e.status ?? '-'}`);
  return e;
}
