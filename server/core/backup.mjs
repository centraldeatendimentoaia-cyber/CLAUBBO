// Backup e restauração de data/ pela tela. Cada backup é uma cópia de data/ em data/backups/AAAA-MM-DD_HHMMSS (fora dela
// ficam backups/, run/ e timeline/ e entregas/, que são grandes ou regeneráveis). Nada é apagado: restaurar sobrescreve só os arquivos
// que existem no backup e antes faz um backup automático do estado atual ("antes-de-restaurar"), então dá para desfazer.
// Tudo fica na máquina; nenhum arquivo de credencial do Claude/Codex mora em data/ (as contas guardam só nome e pasta).
import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['backups', 'run', 'timeline', 'entregas', 'acesso.json']); // acesso.json = tokens da instalação: nunca vão para cópia
const NAME = /^\d{4}-\d{2}-\d{2}_\d{6}(-antes-de-restaurar)?$/;
const pad = (n) => String(n).padStart(2, '0');

export const stamp = (at) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const root = (dataDir) => path.join(dataDir, 'backups');
/** Copia a árvore sem o cpSync (ele recusa copiar uma pasta para dentro dela mesma); `skipTop` = pastas da raiz que ficam de fora. */
function copyTree(src, dest, skipTop = new Set()) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipTop.has(e.name)) continue;
    const from = path.join(src, e.name), to = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(from, to);
    else if (e.isFile()) fs.copyFileSync(from, to);
  }
}

function sizeOf(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? sizeOf(p) : fs.statSync(p).size;
  }
  return total;
}

/** Copia data/ para data/backups/<carimbo>[sufixo]. Devolve { name, bytes }. */
export function createBackup(dataDir, now = Date.now(), suffix = '') {
  let name = `${stamp(now)}${suffix}`;
  for (let i = 2; fs.existsSync(path.join(root(dataDir), name)); i++) name = `${stamp(now + i * 1000)}${suffix}`;
  const dest = path.join(root(dataDir), name);
  fs.mkdirSync(dest, { recursive: true });
  copyTree(dataDir, dest, SKIP);
  return { name, bytes: sizeOf(dest) };
}

/** Backups existentes, do mais novo para o mais antigo. */
export function listBackups(dataDir) {
  let names = [];
  try { names = fs.readdirSync(root(dataDir)); } catch { /* nenhum ainda */ }
  return names
    .filter((n) => NAME.test(n) && fs.statSync(path.join(root(dataDir), n)).isDirectory())
    .sort().reverse()
    .map((name) => ({ name, bytes: sizeOf(path.join(root(dataDir), name)), auto: name.endsWith('-antes-de-restaurar') }));
}

/** Restaura o backup `name` sobre data/ (depois de guardar o estado atual). Quem chama avisa para reiniciar o servidor. */
export function restoreBackup(dataDir, name, now = Date.now()) {
  if (!NAME.test(String(name))) return { ok: false, status: 400, error: 'nome de backup inválido' };
  const src = path.join(root(dataDir), name);
  if (!fs.existsSync(src)) return { ok: false, status: 404, error: 'backup não encontrado' };
  const before = createBackup(dataDir, now, '-antes-de-restaurar');
  copyTree(src, dataDir);
  return { ok: true, restored: name, savedBefore: before.name };
}
