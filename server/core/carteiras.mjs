// Carteiras de moeda de pessoas e agentes. Cada conta nasce com SALDO_INICIAL uma única vez; contas de outro tipo (ex.: a partida
// que guarda as apostas) nascem vazias. Moeda só muda de mãos em `mover`, nunca é criada nem destruída.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

export const SALDO_INICIAL = 100;
const MAX_EXTRATO = 20;
const MAX_MOVIMENTOS = 500;
const file = () => path.join(config.data, 'carteiras.json');
// Objetos sem protótipo: uma pessoa chamada "constructor" ou "__proto__" é só uma chave comum.
const limpo = (o) => Object.assign(Object.create(null), o);
const load = () => {
  const d = readJson(file(), null);
  const contas = limpo(d?.contas);
  // Dado corrompido vira zero em vez de espalhar NaN pelas somas.
  for (const k of Object.keys(contas)) {
    const c = contas[k];
    contas[k] = { saldo: Number(c?.saldo) || 0, ganhou: Number(c?.ganhou) || 0, perdeu: Number(c?.perdeu) || 0, extrato: Array.isArray(c?.extrato) ? c.extrato : [] };
  }
  return { contas, movimentos: Array.isArray(d?.movimentos) ? d.movimentos : [] };
};
// Abre a conta se ainda não existe (só pessoa e agente recebem o saldo inicial).
const conta = (d, chave) => (d.contas[chave] ??= { saldo: /^(pessoa|agente):/.test(chave) ? SALDO_INICIAL : 0, ganhou: 0, perdeu: 0, extrato: [] });

export function chavePessoa(nome) {
  const n = typeof nome === 'string' ? nome.trim().toLowerCase() : '';
  if (!n) throw new Error('nome da pessoa vazio');
  return `pessoa:${n}`;
}
export const chaveAgente = (id) => `agente:${id}`;

export function saldoDe(chave) {
  const d = load();
  const novo = !d.contas[chave];
  const saldo = conta(d, chave).saldo;
  if (novo) writeJson(file(), d);
  return saldo;
}

/** Cópia da conta: saldo e contadores `ganhou`/`perdeu` (sem criar a conta). */
export function contaDe(chave) {
  const c = load().contas[chave];
  return c ? { saldo: c.saldo, ganhou: c.ganhou, perdeu: c.perdeu } : { saldo: 0, ganhou: 0, perdeu: 0 };
}

export function extratoDe(chave) {
  return [...(load().contas[chave]?.extrato ?? [])].reverse();
}

/** Soma de todas as contas: nas partidas ela só muda quando uma conta nova de pessoa/agente nasce. */
export const totalGeral = () => Object.values(load().contas).reduce((s, c) => s + c.saldo, 0);

/**
 * Move `valor` de `de` para `para` uma única vez por `id`. Síncrono de ponta a ponta: não há await entre conferir e gravar.
 * `contar` ({ ganhou, perdeu, valor }) soma os contadores das duas contas na mesma gravação, também uma única vez por `id`.
 */
export function mover({ id, de, para, valor, texto, contar }, now = Date.now()) {
  const txt = (s) => typeof s === 'string' && s !== '';
  if (!txt(id) || !txt(de) || !txt(para)) return { ok: false, status: 422, error: 'dados inválidos' };
  const d = load();
  if (d.movimentos.includes(id)) return { ok: true, duplicado: true };
  if (!Number.isInteger(valor) || valor <= 0) return { ok: false, status: 422, error: 'valor inválido' };
  if (de === para) return { ok: false, status: 422, error: 'origem e destino iguais' };
  const origem = conta(d, de), destino = conta(d, para);
  if (origem.saldo < valor) return { ok: false, status: 422, error: 'saldo insuficiente' };
  origem.saldo -= valor;
  destino.saldo += valor;
  origem.extrato = [...origem.extrato, { at: now, delta: -valor, texto }].slice(-MAX_EXTRATO);
  destino.extrato = [...destino.extrato, { at: now, delta: valor, texto }].slice(-MAX_EXTRATO);
  if (contar && Number.isInteger(contar.valor) && contar.valor > 0) {
    if (txt(contar.ganhou)) conta(d, contar.ganhou).ganhou += contar.valor;
    if (txt(contar.perdeu)) conta(d, contar.perdeu).perdeu += contar.valor;
  }
  d.movimentos = [...d.movimentos, id].slice(-MAX_MOVIMENTOS);
  writeJson(file(), d);
  return { ok: true, duplicado: false };
}
