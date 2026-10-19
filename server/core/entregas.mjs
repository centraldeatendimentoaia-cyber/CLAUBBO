// Arquivos que os agentes entregam (imagem, PDF, planilha, vídeo...). Ficam FORA do repositório, em
// data/entregas/<tarefa>/<arquivo>. O cliente só conhece um id opaco ("<tarefa>/<arquivo>" em base64url): nunca um caminho.
// Todo caminho é resolvido e conferido contra a pasta de entregas antes de ler ou gravar (sem "..", sem barras, sem links).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

export const MAX_FILE = 50 * 1024 * 1024;
const MAX_PER_TASK = 40;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const NAME = /^[^\\/:*?"<>|\x00-\x1f]{1,120}$/;

const KINDS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
  pdf: ['pdf'],
  video: ['mp4', 'webm', 'mov', 'm4v'],
  text: ['txt', 'md', 'csv', 'json', 'log'],
};
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  svg: 'application/octet-stream', // svg pode levar script: baixa em vez de abrir
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
  txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', csv: 'text/plain; charset=utf-8', json: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip: 'application/zip',
};

const root = () => path.join(config.data, 'entregas');
const ext = (name) => path.extname(name).slice(1).toLowerCase();

export function kindOf(name) {
  const e = ext(name);
  if (e === 'svg') return 'file';
  return Object.keys(KINDS).find((k) => KINDS[k].includes(e)) ?? 'file';
}
export const mimeOf = (name) => MIME[ext(name)] ?? 'application/octet-stream';

/** Id opaco e fixo (40 hex) de um arquivo: o cliente nunca vê nem manda um caminho. */
export const encodeId = (task, name) => crypto.createHash('sha1').update(`${task}/${name}`).digest('hex');

/** Caminho absoluto do arquivo, ou null se o id/nome não for válido ou sair da pasta de entregas. */
export function resolveFile(task, name) {
  if (!ID.test(String(task)) || !NAME.test(String(name)) || name === '.' || name === '..') return null;
  const base = path.resolve(root());
  const full = path.resolve(base, task, name);
  return full.startsWith(base + path.sep) && path.dirname(path.dirname(full)) === base ? full : null;
}

/** Grava um arquivo da tarefa. Devolve { ok, id } ou { ok:false, status, error }. */
export function saveFile(task, name, buf) {
  const full = resolveFile(task, name);
  if (!full) return { ok: false, status: 400, error: 'nome de tarefa ou de arquivo inválido' };
  if (!Buffer.isBuffer(buf) || !buf.length) return { ok: false, status: 400, error: 'arquivo vazio' };
  if (buf.length > MAX_FILE) return { ok: false, status: 413, error: 'arquivo grande demais (máximo 50 MB)' };
  const dir = path.dirname(full);
  if (!fs.existsSync(full) && fs.existsSync(dir) && fs.readdirSync(dir).length >= MAX_PER_TASK) return { ok: false, status: 409, error: 'arquivos demais nesta tarefa' };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, buf);
  return { ok: true, id: encodeId(task, name), kind: kindOf(name) };
}

/** Arquivo pelo id opaco: acha entre os arquivos de data/entregas/. { path, name, mime, size, kind } ou null. Só arquivo comum. */
export function openById(id) {
  if (!/^[a-f0-9]{40}$/.test(String(id))) return null;
  let tasks;
  try { tasks = fs.readdirSync(root()); } catch { return null; }
  for (const task of tasks) {
    for (const f of attachmentsOf(task)) {
      if (f.id !== id) continue;
      const full = resolveFile(task, f.name);
      try {
        const st = full && fs.lstatSync(full);
        if (st?.isFile()) return { path: full, name: f.name, mime: mimeOf(f.name), size: st.size, kind: f.kind };
      } catch { /* sumiu entre a listagem e a leitura */ }
    }
  }
  return null;
}

/** Anexos de uma tarefa no formato DeliveryAttachment (shared/types.ts), do mais novo para o mais antigo. */
export function attachmentsOf(task) {
  if (!ID.test(String(task))) return [];
  const dir = path.join(root(), String(task));
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => NAME.test(n) && fs.lstatSync(path.join(dir, n)).isFile())
    .map((n) => ({ n, at: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_PER_TASK)
    .map(({ n }) => ({ id: encodeId(task, n), name: n, kind: kindOf(n) }));
}
