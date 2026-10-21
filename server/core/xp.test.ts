import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { avaliada, award, elenco, ficouBom, levelOf, xpHoje, xpOf } from './xp.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { recordHistory } from './routines.mjs';

const oldData = config.data;
let dir = '';
beforeEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xp-'));
  config.data = dir;
});
afterAll(() => {
  config.data = oldData;
  fs.rmSync(dir, { recursive: true, force: true });
});

const tarefa = (over: Record<string, unknown> = {}) => ({ id: 't1', agent: 'ana', state: 'done', doneAt: 5, ...over });
const agentes = (id: string) => (id === 'ana' ? { id: 'ana', name: 'Ana' } : null);

describe('award', () => {
  it('soma uma vez por chave; repetir a chave não muda o total', () => {
    expect(award('bom:t1', 'ana', 30)).toEqual({ ok: true, duplicado: false });
    expect(xpOf('ana')).toBe(30);
    expect(award('bom:t1', 'ana', 30)).toEqual({ ok: true, duplicado: true });
    expect(xpOf('ana')).toBe(30);
    expect(avaliada('t1')).toBe(true);
    expect(avaliada('t2')).toBe(false);
  });

  it('xpHoje soma só os eventos do dia em São Paulo', () => {
    const agora = Date.UTC(2026, 9, 21, 15); // 12h em SP
    award('a', 'ana', 10, agora);
    award('b', 'ana', 7, agora - 24 * 3600e3);
    expect(xpHoje(agora)).toBe(10);
  });

  it('elenco lista agente com xp e nível', () => {
    award('a', 'ana', 50);
    expect(elenco()).toEqual([expect.objectContaining({ agent: 'ana', xp: 50, nivel: 2 })]);
  });
});

describe('ids perigosos', () => {
  it('agente "constructor" ou "__proto__" vira dado comum, sem corromper o arquivo', () => {
    award('a', 'constructor', 10);
    award('b', '__proto__', 20);
    award('constructor', 'ana', 5);
    expect(xpOf('constructor')).toBe(10);
    expect(xpOf('__proto__')).toBe(20);
    expect(xpOf('toString')).toBe(0);
    expect(avaliada('constructor')).toBe(false);
    expect(elenco().map((e: { agent: string }) => e.agent).sort()).toEqual(['__proto__', 'ana', 'constructor']);
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'xp.json'), 'utf8')).agentes)).toContain('__proto__');
  });
});

describe('levelOf', () => {
  it('xp negativo vale como zero', () => {
    expect(levelOf(-10)).toEqual({ nivel: 1, progresso: 0 });
  });

  it('segue floor(sqrt(xp/50)) + 1 com progresso entre 0 e 1', () => {
    expect(levelOf(0).nivel).toBe(1);
    expect(levelOf(50).nivel).toBe(2);
    expect(levelOf(200).nivel).toBe(3);
    for (const x of [0, 10, 49, 50, 120, 199, 200, 5000]) {
      const { progresso } = levelOf(x);
      expect(progresso).toBeGreaterThanOrEqual(0);
      expect(progresso).toBeLessThan(1);
    }
    expect(levelOf(25).progresso).toBeCloseTo(0.5);
  });
});

describe('rotina concluída (recordHistory)', () => {
  const rot = (over: Record<string, unknown>) => ({ id: 'r1', agent: 'ana', routine: 'rot', state: 'done', addedAt: 1, doneAt: 3, result: 'ok', ...over });
  it('rende 5 XP uma vez só, mesmo chamando duas vezes', () => {
    recordHistory([rot({})]);
    recordHistory([rot({})]);
    expect(xpOf('ana')).toBe(5);
  });
  it('tarefa de rotina com erro não rende nada', () => {
    recordHistory([rot({ id: 'r2', error: 'falhou' })]);
    expect(xpOf('ana')).toBe(0);
  });
});

describe('ficouBom', () => {
  const dono = { papel: 'dono', nome: 'João' };
  const args = (over: Record<string, unknown> = {}) => ({ pessoa: dono, taskId: 't1', tasks: [tarefa()], getAgent: agentes, ...over });

  it('só o dono: equipe, agente e indefinido recebem 403 e o XP não muda', () => {
    for (const pessoa of [{ papel: 'equipe' }, { papel: 'agente' }, undefined, {}]) {
      expect(ficouBom(args({ pessoa })).status).toBe(403);
    }
    expect(xpOf('ana')).toBe(0);
  });
  it('dono concede 30 XP ao agente da tarefa (do servidor, não do cliente)', () => {
    expect(ficouBom(args())).toMatchObject({ ok: true, status: 200, duplicado: false });
    expect(xpOf('ana')).toBe(30);
  });
  it('segunda chamada devolve 200 sem somar de novo', () => {
    ficouBom(args());
    expect(ficouBom(args())).toMatchObject({ ok: true, status: 200, duplicado: true });
    expect(xpOf('ana')).toBe(30);
  });
  it('tarefa com erro ou não concluída dá 409; inexistente ou id inválido dá 404; agente sumido dá 404', () => {
    expect(ficouBom(args({ tasks: [tarefa({ error: 'x' })] })).status).toBe(409);
    expect(ficouBom(args({ tasks: [tarefa({ state: 'doing' })] })).status).toBe(409);
    expect(ficouBom(args({ taskId: 'nao-existe' })).status).toBe(404);
    expect(ficouBom(args({ taskId: { $ne: 1 } })).status).toBe(404);
    expect(ficouBom(args({ tasks: [tarefa({ agent: 'sumiu' })] })).status).toBe(404);
    expect(xpOf('ana')).toBe(0);
  });
});
