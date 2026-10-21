import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { buildPending, classify, decisionOf, rememberDecision } from './pendencias.mjs';

describe('classify', () => {
  it('plano de tarefa é seguro', () => {
    expect(classify('tarefa', 'plan')).toMatchObject({ safe: true, ownerOnly: false, cost: false, reversible: true, sendsMessage: false, needsDialog: false });
  });
  it.each(['implement', 'test'])('tarefa %s roda código: só o dono', (s) => {
    expect(classify('tarefa', s)).toMatchObject({ safe: false, ownerOnly: true, needsDialog: true });
  });
  it('terminal envia mensagem', () => {
    expect(classify('terminal')).toMatchObject({ sendsMessage: true, ownerOnly: true, safe: false, needsDialog: true });
  });
  it('proposta só do dono', () => {
    expect(classify('proposta')).toMatchObject({ ownerOnly: true, safe: false, needsDialog: true });
  });
  it('chamada custa mas não é só do dono', () => {
    expect(classify('chamada')).toMatchObject({ cost: true, ownerOnly: false, safe: false, needsDialog: false });
  });
  it('tipo desconhecido não é seguro', () => {
    expect(classify('qualquer-outra-coisa')).toMatchObject({ safe: false, ownerOnly: true, needsDialog: true });
  });
  it('todo item seguro dispensa diálogo', () => {
    for (const [k, s] of [['tarefa', 'plan'], ['tarefa', 'implement'], ['tarefa', 'test'], ['terminal'], ['proposta'], ['chamada'], ['x']] as const) {
      const c = classify(k, s);
      if (c.safe) expect(c.needsDialog).toBe(false);
    }
  });
});

describe('buildPending', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const src = (over = {}) => ({
    tasks: [{ id: 't1', agent: 'marina', title: 'Plano', state: 'waiting', dev: { awaiting: true, stage: 'plan' }, updatedAt: now - 40 * 60e3 }, { id: 't2', agent: 'a', state: 'running', dev: { awaiting: true } }],
    cliRequests: [{ id: 'r1', state: 'pending', agentName: 'Priscila', text: 'oi', at: now - 60e3 }, { id: 'r2', state: 'done', agentName: 'X', text: 'x' }],
    proposals: [{ id: 'p1', state: 'pending', agent: { name: 'Novo' }, at: now - 60e3 }],
    calls: [{ id: 'c1', state: 'pending', fromName: 'A', toName: 'B', text: 'fala', at: now - 60e3 }],
    ...over,
  });
  it('lista só o que espera o dono', () => {
    const l = buildPending(src(), now);
    expect(l.map((p: any) => p.id).sort()).toEqual(['chamada:c1', 'proposta:p1', 'tarefa:t1', 'terminal:r1']);
    expect(l.find((p: any) => p.id === 'tarefa:t1')).toMatchObject({ stage: 'plan', safe: true, agent: 'marina', ref: 't1' });
  });
  it('urgentes primeiro, depois o mais antigo', () => {
    const l = buildPending(src({ proposals: [{ id: 'p1', state: 'pending', agent: { name: 'Novo' }, at: now - 5 * 3600e3 }] }), now);
    expect(l[0].id).toBe('proposta:p1');
    expect(l.filter((p: any) => p.urgent)).toHaveLength(1);
    expect(l[1].id).toBe('tarefa:t1');
  });
  it('exclusão de agente é irreversível, nomeada e nunca segura; criação segue reversível', () => {
    const l = buildPending(src({ proposals: [{ id: 'p2', state: 'pending', delete: 'ze', name: 'Zé', role: 'Financeiro', from: 'ana' }] }), now);
    const x = l.find((p: any) => p.id === 'proposta:p2');
    expect(x).toMatchObject({ stage: 'excluir', reversible: false, safe: false, ownerOnly: true, needsDialog: true, text: 'Financeiro' });
    expect(x.agent).toContain('relatado pelo agente');
    expect(buildPending(src(), now).find((p: any) => p.id === 'proposta:p1')).toMatchObject({ stage: 'criar', reversible: true, safe: false });
    expect(classify('proposta', 'excluir').safe).toBe(false);
  });
  it('terminal nomeia quem pediu, marcado como dado do agente', () => {
    const x = buildPending(src({ cliRequests: [{ id: 'r9', state: 'pending', from: 'ana', agentName: 'Priscila', text: 'oi' }] }), now).find((p: any) => p.id === 'terminal:r9');
    expect(x.title).toContain('ana');
    expect(x.agent).toBe('ana (relatado pelo agente)');
  });
  it('título de exclusão e truncamento', () => {
    const l = buildPending(src({ proposals: [{ id: 'p2', state: 'pending', delete: 'ze', name: 'Zé', role: 'Financeiro' }], calls: [{ id: 'c2', state: 'pending', text: 'y'.repeat(500), fromName: 'a'.repeat(200), toName: 'b' }] }), now);
    expect(l.find((p: any) => p.id === 'proposta:p2').title).toBe('Excluir agente Zé');
    const c = l.find((p: any) => p.id === 'chamada:c2');
    expect(c.text).toHaveLength(300);
    expect(c.title.length).toBeLessThanOrEqual(80);
  });
});

describe('decisões lembradas', () => {
  it('guarda quem decidiu e descarta a mais antiga após 200', () => {
    rememberDecision('tarefa:t1', 'Ana');
    expect(decisionOf('tarefa:t1')?.nome).toBe('Ana');
    for (let i = 0; i < 200; i++) rememberDecision(`x:${i}`, 'B');
    expect(decisionOf('tarefa:t1')).toBeUndefined();
    expect(decisionOf('x:199')?.nome).toBe('B');
  });
});

describe('classify: chaves herdadas', () => {
  it('trata nome de propriedade de Object como desconhecido, nunca seguro', () => {
    const c = classify('constructor');
    expect(c.safe).toBe(false);
    expect(c.needsDialog).toBe(true);
    expect(c.ownerOnly).toBe(true);
  });
});
