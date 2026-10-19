// Apelidos de exibição das salas (data/room-aliases.json: { aliases: { [idDaSala]: nome } }). É só o que a tela mostra:
// pastas e projetos nunca são renomeados. Vale para as salas do escritório e para as dos terminais ("[CLI] pasta").
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

export const NAME_MAX = 40;
const file = () => path.join(config.data, 'room-aliases.json');
const key = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function loadAliases() {
  const a = readJson(file(), {}).aliases;
  return a && typeof a === 'object' && !Array.isArray(a) ? a : {};
}

/** Nome a exibir: o apelido, se houver, senão o nome original da sala. */
export const displayName = (id, base) => loadAliases()[id] || base;

/**
 * Define (ou, com nome vazio, tira) o apelido de uma sala. `rooms` = [{ id, base, prefix }]: o nome original e o prefixo
 * fixo de cada sala ("[CLI] " nas dos terminais), para achar a sala e recusar nome repetido (sem ligar para acento ou caixa).
 */
export function renameRoom(id, rawName, rooms) {
  const room = rooms.find((r) => r.id === id);
  if (typeof id !== 'string' || !room) return { ok: false, status: 404, error: 'sala não encontrada' };
  let name = String(rawName ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (room.prefix && name.startsWith(room.prefix)) name = name.slice(room.prefix.length).trim();
  if (name.length > NAME_MAX) return { ok: false, status: 400, error: `nome com no máximo ${NAME_MAX} letras` };
  const aliases = loadAliases();
  if (name) {
    const taken = rooms.some((r) => r.id !== id && key(`${r.prefix}${aliases[r.id] || r.base}`) === key(`${room.prefix}${name}`));
    if (taken) return { ok: false, status: 409, error: 'já existe uma sala com esse nome' };
    aliases[id] = name;
  } else {
    delete aliases[id];
  }
  writeJson(file(), { aliases });
  return { ok: true, name: name || room.base };
}
