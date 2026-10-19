// Lista editável de escritórios (data/offices.json): nome + endereço de cada Escritório para onde o João pode levar
// agentes e pedidos. Só endereços desta máquina (127.0.0.1 / localhost): nada aqui manda dado para fora do computador.
// Cada item diz se o destino tem o bloqueio de envio novo (`blockSend`); o Escritório antigo (porta 4520) não tem.
import path from 'node:path';
import { config } from './config.mjs';
import { newId, readJson, writeJson } from './store.mjs';

export const OLD_OFFICE_PORT = 4520;
export const MAX_OFFICES = 20;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const file = () => path.join(config.data, 'offices.json');

/** Escritório "padrão" mostrado enquanto o João ainda não salvou a lista. */
const defaults = (selfPort) => [
  { id: 'v2', name: 'Escritório v2 (este)', url: `http://127.0.0.1:${selfPort}`, blockSend: true },
  { id: 'antigo', name: 'Escritório antigo', url: `http://127.0.0.1:${OLD_OFFICE_PORT}`, blockSend: false },
];

/** Aceita "4520", "localhost:4520" ou "http://127.0.0.1:4520/" e devolve { url } normalizada ou { error }. */
export function normalizeAddress(input) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 100) return { error: 'endereço: informe a porta (ex.: 4520) ou http://127.0.0.1:4520' };
  const withScheme = /^\d{1,5}$/.test(raw) ? `http://127.0.0.1:${raw}` : /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  let u;
  try { u = new URL(withScheme); } catch { return { error: 'endereço inválido' }; }
  if (u.protocol !== 'http:') return { error: 'endereço: use http (é o seu computador, sem https)' };
  if (!LOCAL_HOSTS.has(u.hostname)) return { error: 'endereço: só 127.0.0.1 ou localhost (escritórios desta máquina)' };
  if (u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return { error: 'endereço: use só host e porta, sem caminho nem senha' };
  const port = Number(u.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'endereço: porta de 1 a 65535' };
  return { url: `http://${u.hostname === 'localhost' ? 'localhost' : '127.0.0.1'}:${port}`, port };
}

/** Valida e normaliza um item vindo da rede. `base` = item atual (atualização parcial). */
export function cleanOffice(input, base = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['o escritório deve ser um objeto'] };
  const src = { ...(base || {}), ...input };
  const errors = [];
  const name = String(src.name ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!name) errors.push('nome: obrigatório');
  if (name.length > 40) errors.push('nome: no máximo 40 caracteres');
  const addr = normalizeAddress(src.url ?? src.address ?? src.port);
  if (addr.error) errors.push(addr.error);
  if (src.blockSend !== undefined && typeof src.blockSend !== 'boolean') errors.push('blockSend: verdadeiro ou falso');
  if (errors.length) return { ok: false, errors };
  const blockSend = typeof src.blockSend === 'boolean' ? src.blockSend : addr.port !== OLD_OFFICE_PORT;
  return { ok: true, office: { id: base?.id || '', name, url: addr.url, blockSend } };
}

/** Acrescenta o aviso que a tela mostra antes de levar algo para um destino sem o bloqueio de envio novo. */
const withWarning = (o, selfPort) => ({
  ...o,
  self: Number(new URL(o.url).port) === selfPort,
  ...(o.blockSend ? {} : { aviso: `${o.name} (${new URL(o.url).host}) não tem o bloqueio de envio novo: lá, agentes podem pedir envios pelo CRM sem a liberação por tarefa. Leve só o que você aceita rodar sem essa proteção.` }),
});

const stored = (selfPort) => {
  const d = readJson(file(), null);
  return d && Array.isArray(d.offices) ? d.offices : defaults(selfPort);
};
const save = (offices) => writeJson(file(), { version: 1, offices });

export const listOffices = (selfPort) => stored(selfPort).map((o) => withWarning(o, selfPort));

export function addOffice(input, selfPort) {
  const c = cleanOffice(input);
  if (!c.ok) return { ...c, status: 400 };
  const all = stored(selfPort);
  if (all.length >= MAX_OFFICES) return { ok: false, status: 400, errors: [`no máximo ${MAX_OFFICES} escritórios`] };
  if (all.some((o) => o.url === c.office.url)) return { ok: false, status: 409, errors: ['já existe um escritório com esse endereço'] };
  const office = { ...c.office, id: newId() };
  save([...all, office]);
  return { ok: true, office: withWarning(office, selfPort) };
}

export function updateOffice(id, patch, selfPort) {
  const all = stored(selfPort);
  const i = all.findIndex((o) => o.id === id);
  if (i < 0) return { ok: false, status: 404, errors: ['escritório não encontrado'] };
  const c = cleanOffice({ ...patch, id }, all[i]);
  if (!c.ok) return { ...c, status: 400 };
  if (all.some((o, j) => j !== i && o.url === c.office.url)) return { ok: false, status: 409, errors: ['já existe um escritório com esse endereço'] };
  all[i] = { ...c.office, id };
  save(all);
  return { ok: true, office: withWarning(all[i], selfPort) };
}

export function removeOffice(id, selfPort) {
  const all = stored(selfPort);
  const o = all.find((x) => x.id === id);
  if (!o) return { ok: false, status: 404, errors: ['escritório não encontrado'] };
  if (Number(new URL(o.url).port) === selfPort) return { ok: false, status: 409, errors: ['este é o escritório em que você está: não dá para tirar da lista'] };
  save(all.filter((x) => x.id !== id));
  return { ok: true };
}
