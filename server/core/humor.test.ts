import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { falaDe, humoresDe, humorDe, registrarPartida } from './humor.mjs';

const oldData = config.data;
let dir = '';
beforeEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'humor-'));
  config.data = dir;
});
afterAll(() => {
  config.data = oldData;
  fs.rmSync(dir, { recursive: true, force: true });
});

const T0 = 1_000_000;
const H = 3600e3;

describe('humorDe', () => {
  it('sem partidas é neutro', () => {
    expect(humorDe('bia', T0)).toBe('neutro');
  });
  it('duas vitórias do agente seguidas = animado', () => {
    registrarPartida('bia', 'agente', T0);
    expect(humorDe('bia', T0)).toBe('neutro');
    registrarPartida('bia', 'agente', T0 + 1);
    expect(humorDe('bia', T0 + 1)).toBe('animado');
  });
  it('duas derrotas = chateado', () => {
    registrarPartida('bia', 'pessoa', T0);
    registrarPartida('bia', 'pessoa', T0 + 1);
    expect(humorDe('bia', T0 + 1)).toBe('chateado');
  });
  it('vitória + derrota + empate = neutro', () => {
    for (const r of ['agente', 'pessoa', 'empate']) registrarPartida('bia', r, T0);
    expect(humorDe('bia', T0)).toBe('neutro');
  });
  it('empate não altera a soma', () => {
    registrarPartida('bia', 'agente', T0);
    registrarPartida('bia', 'empate', T0);
    registrarPartida('bia', 'agente', T0);
    expect(humorDe('bia', T0)).toBe('animado');
  });
  it('só as 5 últimas contam', () => {
    // 2 derrotas, depois 4 vitórias: a primeira derrota cai fora; soma das 5 últimas = -1 + 4 = 3
    registrarPartida('bia', 'pessoa', T0);
    registrarPartida('bia', 'pessoa', T0);
    for (let i = 0; i < 4; i++) registrarPartida('bia', 'agente', T0);
    expect(humorDe('bia', T0)).toBe('animado');
    // seis partidas: a primeira (vitória) cai fora e as cinco seguintes somam -1 -1 -1 -1 +1... confere a janela
    registrarPartida('bia', 'pessoa', T0);
    registrarPartida('bia', 'pessoa', T0);
    registrarPartida('bia', 'pessoa', T0);
    // últimas 5: agente, agente, pessoa, pessoa, pessoa = -1
    expect(humorDe('bia', T0)).toBe('neutro');
  });
  it('a sexta partida empurra a primeira para fora', () => {
    registrarPartida('bia', 'pessoa', T0);
    registrarPartida('bia', 'pessoa', T0);
    for (let i = 0; i < 4; i++) registrarPartida('bia', 'empate', T0);
    // últimas 5: pessoa, empate x4 = -1 -> neutro (com a primeira derrota ainda dentro seria -2)
    expect(humorDe('bia', T0)).toBe('neutro');
  });
  it('passadas 6 h volta a neutro', () => {
    registrarPartida('bia', 'agente', T0);
    registrarPartida('bia', 'agente', T0);
    expect(humorDe('bia', T0 + 6 * H - 1)).toBe('animado');
    expect(humorDe('bia', T0 + 6 * H)).toBe('neutro');
  });
  it('agentes são independentes', () => {
    registrarPartida('bia', 'agente', T0);
    registrarPartida('bia', 'agente', T0);
    expect(humorDe('caio', T0)).toBe('neutro');
  });
  it('id __proto__ é comum', () => {
    registrarPartida('__proto__', 'pessoa', T0);
    registrarPartida('__proto__', 'pessoa', T0);
    expect(humorDe('__proto__', T0)).toBe('chateado');
    expect(humorDe('constructor', T0)).toBe('neutro');
    expect(({} as any).partidas).toBeUndefined();
  });
  it('arquivo corrompido não lança', () => {
    fs.writeFileSync(path.join(dir, 'humor.json'), JSON.stringify({ agentes: { bia: 7, caio: { partidas: 'x', at: 'y' }, dani: { partidas: [1, 'a', null, 9, -1], at: T0 } } }));
    expect(humorDe('bia', T0)).toBe('neutro');
    expect(humorDe('caio', T0)).toBe('neutro');
    expect(humorDe('dani', T0)).toBe('neutro');
    expect(() => registrarPartida('bia', 'agente', T0)).not.toThrow();
    fs.writeFileSync(path.join(dir, 'humor.json'), '{lixo');
    expect(humorDe('bia', T0)).toBe('neutro');
  });
  it('resultado desconhecido é ignorado', () => {
    registrarPartida('bia', 'banana', T0);
    expect(humorDe('bia', T0)).toBe('neutro');
  });
});

describe('falaDe', () => {
  it('nunca devolve vazio e tem ao menos 2 variações por humor', () => {
    for (const h of ['animado', 'neutro', 'chateado', 'qualquer']) {
      for (const r of [undefined, 'agente', 'pessoa', 'empate']) {
        for (let i = 0; i < 20; i++) expect(falaDe(h, r).trim()).not.toBe('');
      }
      const vistas = new Set([0, 1, 2, 3, 4, 5].map((i) => falaDe(h, undefined, () => i)));
      expect(vistas.size).toBeGreaterThanOrEqual(2);
    }
  });
  it('usa o sorteio injetado de forma determinística', () => {
    expect(falaDe('animado', undefined, () => 0)).toBe(falaDe('animado', undefined, () => 0));
    expect(falaDe('animado', undefined, () => 0)).not.toBe(falaDe('animado', undefined, () => 1));
  });
  it('sorteio fora da faixa não quebra', () => {
    expect(falaDe('chateado', 'pessoa', () => 999).length).toBeGreaterThan(0);
    expect(falaDe('chateado', 'pessoa', () => -3).length).toBeGreaterThan(0);
    expect(falaDe('chateado', 'pessoa', () => NaN).length).toBeGreaterThan(0);
  });
});

describe('humoresDe', () => {
  it('lê o arquivo uma vez e dá o mesmo humor que humorDe', () => {
    const t = 1_000_000;
    registrarPartida('a', 'agente', t); registrarPartida('a', 'agente', t);
    registrarPartida('b', 'pessoa', t); registrarPartida('b', 'pessoa', t);
    const de = humoresDe(t + 1);
    expect(['a', 'b', 'c'].map(de)).toEqual(['animado', 'chateado', 'neutro']);
    expect(['a', 'b', 'c'].map((id) => humorDe(id, t + 1))).toEqual(['animado', 'chateado', 'neutro']);
    expect(humoresDe(t + 7 * 3600e3)('a')).toBe('neutro');
  });
});
