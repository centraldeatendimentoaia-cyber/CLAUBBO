// Arquivos JSON do Escritório v2: leitura tolerante e escrita atômica (arquivo temporário + rename).
import fs from 'node:fs';
import path from 'node:path';

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** Identificador curto e único o bastante para tarefas, reuniões e pedidos. */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
