// Arquivos JSON do Escritório v2: leitura que preserva arquivo ilegível e escrita atômica (arquivo temporário + rename).
import fs from 'node:fs';
import path from 'node:path';

/**
 * Arquivo ausente devolve `fallback`. Arquivo que existe mas não é JSON válido (queda de energia, edição externa) é renomeado para
 * `<nome>.corrompido-<data>` e o erro é registrado; assim o próximo `writeJson` não grava por cima dos dados ilegíveis.
 * Se nem o rename funcionar, lança: é melhor falhar do que sobrescrever.
 */
export function readJson(file, fallback) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return fallback;
    throw e;
  }
  try { return JSON.parse(text); } catch (e) {
    const aside = `${file}.corrompido-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(file, aside);
    console.error(`[store] JSON ilegível em ${file} (${e.message}); guardado como ${aside}`);
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

/** Identificador curto e único o bastante para tarefas, reuniões e pedidos. */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
