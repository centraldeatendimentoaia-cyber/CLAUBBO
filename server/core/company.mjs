// Ficha da empresa: marca, tom de voz, clientes, preços e regras. Todo agente a lê no começo de cada resposta
// (brain.systemFor). Fica em data/company.json; o dono edita pela página. Nunca guarde senhas ou chaves aqui.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const FIELDS = { name: 120, about: 1500, brand: 800, tone: 600, audience: 800, offers: 1200, rules: 1200 };
export const FIELD_LABELS = { name: 'Nome da empresa', about: 'O que a empresa faz', brand: 'Marca (cores, estilo)', tone: 'Tom de voz', audience: 'Clientes e público', offers: 'Produtos, serviços e preços', rules: 'Regras da casa (o que nunca fazer)' };
const file = () => path.join(config.data, 'company.json');

export const getCompany = () => {
  const saved = readJson(file(), {});
  return Object.fromEntries(Object.keys(FIELDS).map((k) => [k, typeof saved[k] === 'string' ? saved[k] : '']));
};

export function setCompany(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, status: 400, error: 'a ficha deve ser um objeto' };
  const next = { ...getCompany() };
  for (const [k, max] of Object.entries(FIELDS)) if (input[k] !== undefined) next[k] = String(input[k]).replace(/\r\n/g, '\n').trim().slice(0, max);
  writeJson(file(), next);
  return { ok: true, company: next };
}

/** Bloco de texto para o contexto dos agentes; '' se a ficha está vazia. */
export function companyContext(company = getCompany()) {
  const lines = Object.entries(FIELD_LABELS).filter(([k]) => company[k]).map(([k, label]) => `- ${label}: ${company[k]}`);
  return lines.length ? `# A empresa (ficha do dono)\n${lines.join('\n')}` : '';
}
