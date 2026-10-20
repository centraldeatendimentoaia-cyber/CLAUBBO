// Sistema associado a um agente (cadastrado só pelo João, pela página do Escritório). Três tipos:
//   local   -> pasta do projeto + comando de subir + porta (o escritório liga, desliga, monitora e reergue)
//   url     -> aplicação que já está na internet (só monitora e avisa; não dá para reerguer o que não é nosso)
//   visual  -> sem sistema: o agente só representa uma função
// O comando de subir NUNCA vem de texto de agente, de chat ou de proposta: ver `stripSystem` e a checagem de origem no bridge.
import fs from 'node:fs';
import path from 'node:path';

import os from 'node:os';

export const SYSTEM_TYPES = ['local', 'url', 'visual'];

// Caracteres que o shell interpreta (o comando sobe com shell: true). Ficam fora do comando e de qualquer pasta de projeto.
const SHELL_CHARS = /[&|;<>`$^%!"'*?(){}\r\n\0]/;
const SHELL_LIST = '& | ; < > ` $ ^ % ! " \' * ? ( ) { }';
// Só estes programas sobem um sistema. Quem precisa de outro o acrescenta em V2_COMANDOS_PERMITIDOS (lista separada por vírgula).
const ALLOWED_EXE = ['npm', 'pnpm', 'yarn', 'bun', 'node', 'deno', 'python', 'python3', 'py', 'php', 'ruby', 'bundle', 'dotnet', 'java', 'go', 'cargo', 'uvicorn', 'gunicorn', 'flask'];
const EVAL_FLAGS = new Set(['-e', '--eval', '-p', '--print', '-c', '--command']); // rodam código passado na própria linha
const FETCH_AND_RUN = new Set(['exec', 'x', 'dlx', 'create', 'init']); // npm exec, pnpm dlx...: baixam e rodam pacote qualquer

const allowedExe = () => new Set([...ALLOWED_EXE, ...String(process.env.V2_COMANDOS_PERMITIDOS || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9._-]+$/.test(s))]);

/**
 * Comando de subir: uma linha, sem caracteres de shell, começando por um programa da lista permitida (nome simples, sem caminho),
 * sem os parâmetros que rodam código solto. Limite: `npm run x` ainda roda o que o package.json do projeto diz em `x`.
 */
export function cleanCommand(raw) {
  const command = String(raw ?? '').trim();
  if (!command || command.length > 300) return { ok: false, error: 'sistema: o comando de subir é obrigatório (uma linha, até 300 caracteres)' };
  if (SHELL_CHARS.test(command)) return { ok: false, error: `sistema: o comando tem caractere de shell não permitido (${SHELL_LIST}); use um comando simples, como "npm run dev"` };
  const [first, second, ...rest] = command.split(/\s+/);
  if (/[\\/]/.test(first)) return { ok: false, error: 'sistema: o comando deve começar pelo nome do programa, sem caminho (ex.: "node server.js")' };
  const exe = first.toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
  if (!allowedExe().has(exe)) return { ok: false, error: `sistema: programa "${first.slice(0, 30)}" fora da lista permitida (${[...allowedExe()].join(', ')})` };
  if ([second, ...rest].some((t) => EVAL_FLAGS.has(String(t).toLowerCase()))) return { ok: false, error: 'sistema: o comando não pode rodar código passado na própria linha (-e, -c, -p, --eval...)' };
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(exe) && FETCH_AND_RUN.has(String(second).toLowerCase())) return { ok: false, error: `sistema: "${exe} ${second}" baixa e roda pacote qualquer; use um script do projeto (${exe} run ...)` };
  return { ok: true, command };
}

const SYSTEM_DIRS = (process.platform === 'win32'
  ? [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData, 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData']
  : ['/bin', '/boot', '/dev', '/etc', '/lib', '/proc', '/root', '/sbin', '/sys', '/usr', '/var']).filter(Boolean).map((d) => path.resolve(d).toLowerCase());

/**
 * Pasta de projeto: caminho absoluto de uma pasta que existe, sem caractere de shell, nem a raiz do disco, nem pasta do sistema,
 * nem a pasta pessoal inteira (um projeto fica dentro dela). Devolve { ok, folder } ou { ok: false, error }.
 */
export function cleanFolder(raw, { mustExist = true, label = 'pasta' } = {}) {
  const input = String(raw ?? '').trim();
  if (!input || !path.isAbsolute(input)) return { ok: false, error: `${label}: deve ser um caminho absoluto (ex.: D:/Projetos/loja)` };
  if (SHELL_CHARS.test(input)) return { ok: false, error: `${label}: o caminho tem caractere não permitido (${SHELL_LIST}); renomeie a pasta` };
  const folder = path.normalize(input);
  const low = folder.replace(/[\\/]+$/, '').toLowerCase();
  if (path.parse(folder).root.toLowerCase().replace(/[\\/]+$/, '') === low || !low) return { ok: false, error: `${label}: a raiz do disco não é uma pasta de projeto` };
  if (SYSTEM_DIRS.some((d) => low === d || low.startsWith(d + path.sep))) return { ok: false, error: `${label}: pasta do sistema não pode ser pasta de projeto` };
  const home = path.resolve(os.homedir()).toLowerCase();
  if (low === home || low === path.dirname(home)) return { ok: false, error: `${label}: escolha uma pasta de projeto dentro da pasta pessoal, não ela inteira` };
  if (mustExist) {
    let isDir = false;
    try { isDir = fs.statSync(folder).isDirectory(); } catch { /* inexistente */ }
    if (!isDir) return { ok: false, error: `${label}: a pasta não existe: ${folder}` };
  }
  return { ok: true, folder };
}

/** Valida e normaliza o sistema vindo da rede. Devolve { ok, system } (system null = nenhum) ou { ok:false, error }. */
export function cleanSystem(input, { checkFolder = true } = {}) {
  if (input === null || input === undefined || input === '' || input === false) return { ok: true, system: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'sistema: formato inválido' };
  const type = String(input.type ?? '');
  if (!SYSTEM_TYPES.includes(type)) return { ok: false, error: 'sistema: tipo deve ser local, url ou visual' };
  const name = String(input.name ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60);
  if (type === 'visual') return { ok: true, system: { type, name } };
  if (type === 'url') {
    let u;
    try { u = new URL(String(input.url ?? '').trim()); } catch { return { ok: false, error: 'sistema: endereço inválido' }; }
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, error: 'sistema: o endereço deve começar com http:// ou https://' };
    return { ok: true, system: { type, name, url: u.toString() } };
  }
  // checkFolder falso = releitura do que já está salvo (agents.json): não derruba um agente antigo; o comando é conferido de novo ao subir
  let folder = String(input.folder ?? '').trim();
  if (checkFolder) { const f = cleanFolder(folder, { label: 'sistema: a pasta do projeto' }); if (!f.ok) return f; folder = f.folder; }
  else if (!folder || !path.isAbsolute(folder)) return { ok: false, error: 'sistema: a pasta do projeto deve ser um caminho absoluto' };
  let command = String(input.command ?? '').trim();
  if (checkFolder) { const c = cleanCommand(command); if (!c.ok) return c; command = c.command; }
  else if (!command || command.length > 300 || /[\r\n]/.test(command)) return { ok: false, error: 'sistema: o comando de subir é obrigatório (uma linha, até 300 caracteres)' };
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'sistema: porta de 1 a 65535' };
  return { ok: true, system: { type, name, folder: path.normalize(folder), command, port, autoRestart: input.autoRestart !== false } };
}

/** Tira o sistema de um agente vindo de proposta (texto de agente): o comando só entra pelas mãos do João. */
export function stripSystem(agent) {
  if (!agent || typeof agent !== 'object') return agent;
  const { system, ...rest } = agent;
  void system;
  return rest;
}

/** Texto curto do sistema para a interface. */
export function systemLabel(system) {
  if (!system) return '';
  return system.name || (system.type === 'url' ? system.url : system.type === 'local' ? path.basename(system.folder) : '');
}
