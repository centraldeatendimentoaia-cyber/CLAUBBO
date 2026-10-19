// Atividade do escritório: o que cada agente fez (tarefa, chat, reunião, sistema). Anel de 200 itens em disco.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const file = () => path.join(config.data, 'activity.json');
let items = null;
const load = () => (items ??= readJson(file(), []));

export function addActivity({ kind, agent = '', agentName = '', room = '', task = '', text }) {
  const list = load();
  const item = { id: (list.at(-1)?.id ?? 0) + 1, at: Date.now(), kind, agent, agentName, room, task, text: String(text).slice(0, 300) };
  list.push(item);
  if (list.length > 200) list.splice(0, list.length - 200);
  writeJson(file(), list);
  return item;
}

export const recentActivity = (limit = 30) => load().slice(-limit);
