import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { XP_OBRIGADO, agradecer, avaliada, award, elenco, ficouBom, lerXp, levelOf, resultadoPendente, xpHoje, xpOf } from './xp.mjs';
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

describe('lerXp e poda (M3)', () => {
  it('lê o arquivo uma vez: o retrato não muda com concessões posteriores', () => {
    award('bom:t1', 'ana', 30, Date.now());
    const x = lerXp();
    award('bom:t2', 'ana', 30, Date.now());
    expect(x.avaliada('t1')).toBe(true);
    expect(x.avaliada('t2')).toBe(false);
    expect(x.elenco()[0].xp).toBe(30);
    expect(x.xpHoje()).toBe(30);
  });
  it('poda eventos com mais de 30 dias, mantém os bom: e o total dos agentes', () => {
    const DIA = 86400e3, agora = Date.now();
    award('rotina:velha', 'ana', 5, agora - 40 * DIA);
    award('bom:velha', 'ana', 30, agora - 40 * DIA);
    award('rotina:nova', 'ana', 5, agora);
    expect(xpOf('ana')).toBe(40);
    expect(avaliada('velha')).toBe(true);
    expect(lerXp().xpHoje(agora)).toBe(5);
    const eventos = JSON.parse(fs.readFileSync(path.join(dir, 'xp.json'), 'utf8')).eventos;
    expect(Object.keys(eventos).sort()).toEqual(['bom:velha', 'rotina:nova']);
  });
});

describe('agradecer', () => {
  const equipe = { papel: 'equipe', nome: 'Bia' };
  const dono = { papel: 'dono', nome: 'João' };
  const args = (over: Record<string, unknown> = {}) => ({ pessoa: equipe, agentId: 'ana', tasks: [tarefa()], rotinas: [], getAgent: agentes, ...over });

  it('sem tarefa concluída: 409', () => {
    expect(agradecer(args({ tasks: [] }))).toMatchObject({ ok: false, status: 409, error: 'sem resultado novo para agradecer' });
  });
  it('tarefa done sem erro: 200 e XP sobe XP_OBRIGADO; segunda chamada dá 409', () => {
    expect(agradecer(args())).toMatchObject({ ok: true, status: 200, id: 't1', xp: XP_OBRIGADO });
    expect(xpOf('ana')).toBe(XP_OBRIGADO);
    expect(agradecer(args())).toMatchObject({ ok: false, status: 409, error: 'sem resultado novo para agradecer' });
    expect(xpOf('ana')).toBe(XP_OBRIGADO);
  });
  it('tarefa com bom: ou com erro não conta e o XP não muda', () => {
    award('bom:t1', 'ana', 30);
    expect(agradecer(args())).toMatchObject({ ok: false, status: 409 });
    expect(agradecer(args({ tasks: [tarefa({ id: 't2', error: 'x' })] }))).toMatchObject({ ok: false, status: 409 });
    expect(xpOf('ana')).toBe(30);
  });
  it('outra pessoa depois da primeira: 409 citando o nome', () => {
    agradecer(args());
    expect(agradecer(args({ pessoa: dono }))).toMatchObject({ ok: false, status: 409, error: 'já agradecido por Bia' });
    expect(xpOf('ana')).toBe(XP_OBRIGADO);
  });
  it('execução de rotina concluída conta', () => {
    expect(agradecer(args({ tasks: [], rotinas: [tarefa({ id: 'r1', routine: 'rot' })] }))).toMatchObject({ ok: true, id: 'r1' });
    expect(resultadoPendente('ana', { tasks: [], rotinas: [tarefa({ id: 'r1' })] })).toBeNull();
  });
  it('escolhe o resultado mais recente ainda sem reconhecimento', () => {
    const tasks = [tarefa({ id: 'velha', doneAt: 1 }), tarefa({ id: 'nova', doneAt: 9 })];
    expect(resultadoPendente('ana', { tasks, rotinas: [] })).toEqual({ id: 'nova', tipo: 'tarefa' });
  });
  it('403 sem nome ou sem papel; 404 agente inexistente', () => {
    for (const pessoa of [{ papel: 'equipe' }, { papel: 'agente', nome: 'x' }, undefined]) {
      expect(agradecer(args({ pessoa }))).toMatchObject({ ok: false, status: 403 });
    }
    expect(agradecer(args({ agentId: 'zz' }))).toMatchObject({ ok: false, status: 404 });
    expect(xpOf('ana')).toBe(0);
  });
});
