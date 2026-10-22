// Personagens da equipe na barra do escritório: aparência (seed, look e peças) de cada pessoa em `data/personagens.json`.
// A lista é o dono (identidade local `dono`) mais as pessoas de `data/equipe.json`, sem hash nem token. A fantasia JMAL
// vem do papel `dono`, decidida aqui, nunca do corpo do pedido.
import path from 'node:path';
import { chavePessoa } from './carteiras.mjs';
import { config } from './config.mjs';
import { loadTeam } from './equipe.mjs';
import { readJson, writeJson } from './store.mjs';

// Mesmas listas de shared/appearance.ts (o teste confere); o servidor .mjs não importa TypeScript.
export const ESTILOS = {
  hairStyle: ['short', 'buzz', 'spiky', 'side_part', 'curly', 'afro', 'bob', 'long', 'ponytail', 'bun', 'pigtails', 'mohawk', 'bald', 'wavy'],
  topStyle: ['tshirt', 'hoodie', 'shirt_tie', 'sweater', 'jacket', 'blouse', 'polo'],
  bottomStyle: ['pants', 'shorts', 'skirt'],
  accessory: ['none', 'glasses', 'sunglasses', 'headphones', 'cap', 'beanie', 'earrings', 'bow'],
  facialHair: ['none', 'stubble', 'beard', 'mustache', 'goatee'],
};
export const PECAS = ['skin', 'hair', 'hairStyle', 'eyes', 'top', 'topAccent', 'topStyle', 'bottom', 'bottomStyle', 'shoes', 'accessory', 'accessoryColor', 'facialHair'];
const COR = /^#[0-9a-f]{6}$/i;
const file = () => path.join(config.data, 'personagens.json');
// Objetos sem protótipo: uma pessoa chamada "constructor" ou "__proto__" é só uma chave comum.
const limpo = (o) => Object.assign(Object.create(null), o && typeof o === 'object' ? o : {});
const hash32 = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Peças válidas na ordem fixa, ou null se algo estiver fora do formato (nada de valor parcial). */
export function validarPecas(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const k of Object.keys(raw)) if (!PECAS.includes(k)) return null;
  const out = {};
  for (const k of PECAS) {
    const v = raw[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || (ESTILOS[k] ? !ESTILOS[k].includes(v) : !COR.test(v))) return null;
    out[k] = ESTILOS[k] ? v : v.toLowerCase();
  }
  return out;
}

const guardados = () => limpo(readJson(file(), null)?.pessoas);
const montar = (nome, papel, g) => {
  const seed = Number.isInteger(g?.seed) && g.seed >= 0 && g.seed <= 0xffffffff ? g.seed : hash32(nome.trim().toLowerCase());
  const look = g?.look === 'm' || g?.look === 'f' ? g.look : seed % 2 ? 'm' : 'f';
  const parts = g?.parts ? validarPecas(g.parts) : null;
  return { nome, papel, rotulo: papel === 'dono' ? 'JMAL' : nome, seed, look, ...(parts && Object.keys(parts).length ? { parts } : {}), ...(papel === 'dono' ? { costume: 'jmal' } : {}), custom: !!g };
};

/** Dono e equipe, nesta ordem, sem hash. */
export function listarEquipe() {
  const g = guardados();
  const lista = [{ nome: 'dono', papel: 'dono' }, ...loadTeam(config.data).pessoas.map(({ nome, papel }) => ({ nome, papel }))];
  const vistos = new Set();
  return lista.filter((p) => { const k = chavePessoa(p.nome); return !vistos.has(k) && vistos.add(k); }).map((p) => montar(p.nome, p.papel, g[chavePessoa(p.nome)]));
}

/** A pessoa `quem` (req.pessoa) pode mudar o personagem de `alvo`? O dono muda qualquer um; os demais, só o próprio. */
export const podeEditar = (quem, alvo) => !!quem?.nome && (quem.papel === 'dono' || (quem.papel === 'equipe' && chavePessoa(quem.nome) === chavePessoa(alvo)));

/** Grava (ou, com `reset`, apaga) o personagem de uma pessoa que existe na lista. Síncrono: nada de await entre ler e gravar. */
export function salvarPersonagem({ quem, alvo, corpo }) {
  if (!podeEditar(quem, alvo)) return { ok: false, status: 403, error: 'só o dono ou a própria pessoa muda este personagem' };
  const existe = listarEquipe().find((p) => chavePessoa(p.nome) === chavePessoa(alvo));
  if (!existe) return { ok: false, status: 404, error: 'pessoa não encontrada' };
  const todos = guardados();
  const k = chavePessoa(existe.nome);
  if (corpo?.reset === true) delete todos[k];
  else {
    const parts = corpo?.parts === undefined ? {} : validarPecas(corpo.parts);
    const seed = corpo?.seed;
    if (!parts || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || (corpo.look !== 'f' && corpo.look !== 'm')) return { ok: false, status: 400, error: 'personagem inválido' };
    todos[k] = { seed, look: corpo.look, parts };
  }
  writeJson(file(), { pessoas: todos });
  return { ok: true, status: 200, pessoa: listarEquipe().find((p) => chavePessoa(p.nome) === k) };
}
