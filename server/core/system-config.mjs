// Sistema associado a um agente (cadastrado só pelo João, pela página do Escritório). Três tipos:
//   local   -> pasta do projeto + comando de subir + porta (o escritório liga, desliga, monitora e reergue)
//   url     -> aplicação que já está na internet (só monitora e avisa; não dá para reerguer o que não é nosso)
//   visual  -> sem sistema: o agente só representa uma função
// O comando de subir NUNCA vem de texto de agente, de chat ou de proposta: ver `stripSystem` e a checagem de origem no bridge.
import fs from 'node:fs';
import path from 'node:path';

export const SYSTEM_TYPES = ['local', 'url', 'visual'];

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
  const folder = String(input.folder ?? '').trim();
  if (!folder || !path.isAbsolute(folder)) return { ok: false, error: 'sistema: a pasta do projeto deve ser um caminho absoluto' };
  let isDir = !checkFolder;
  try { if (checkFolder) isDir = fs.statSync(folder).isDirectory(); } catch { /* pasta inexistente */ }
  if (!isDir) return { ok: false, error: `sistema: a pasta não existe: ${folder}` };
  const command = String(input.command ?? '').trim();
  if (!command || command.length > 300 || /[\r\n]/.test(command)) return { ok: false, error: 'sistema: o comando de subir é obrigatório (uma linha, até 300 caracteres)' };
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
