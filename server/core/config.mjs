// Caminhos e limites do Escritório v2. Tudo pode ser trocado por variável de ambiente (os testes usam pastas temporárias).
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = process.env;

export const config = {
  root: ROOT,
  data: env.V2_DATA || path.join(ROOT, 'data'),
  brain: env.V2_BRAIN || 'D:/escritorio/brain', // barras normais: funcionam no Windows e não dependem de escape
  home: env.V2_HOME || os.homedir(),
  /** Segredos (token do Telegram): pasta FORA do projeto, nunca em data/. */
  secrets: env.V2_SECRETS || path.join(env.APPDATA || os.homedir(), 'escritorio-v2'),
  /** Executáveis (os testes apontam para um Claude e um Codex falsos). */
  claudeBin: env.V2_CLAUDE_BIN || 'claude',
  codexBin: env.V2_CODEX_BIN || env.CLAUBBO_CODEX_BIN || 'codex',
  /** Argumentos antes dos de sempre (JSON): os testes rodam um Claude e um Codex falsos com `node fake.mjs`. */
  claudePre: JSON.parse(env.V2_CLAUDE_PRE || '[]'),
  codexPre: JSON.parse(env.V2_CODEX_PRE || '[]'),
  /** Execuções simultâneas (cada agente roda uma por vez). */
  concurrency: Number(env.V2_CONCURRENCY || 2),
  /** Contexto enviado a cada execução: notas do cérebro, em caracteres. */
  context: { maxNotes: 5, maxChars: 6000 },
  timeoutMs: Number(env.V2_TIMEOUT_MS || 10 * 60_000),
};
