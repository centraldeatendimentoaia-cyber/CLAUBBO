import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { deliveriesFrom } from './deliveries.mjs';

const agents = [{ id: 'ana', name: 'Ana', account: 'principal', room: 'r1' }];
const rooms = [{ id: 'r1', name: 'Marketing' }];
const task = (over: Record<string, unknown>) => ({ id: 't1', agent: 'ana', title: 'Campanha', text: 'Campanha', state: 'done', addedAt: 1, startedAt: 2, doneAt: 3, result: 'Pronto. A campanha ficou assim.\n\nResumo final em linguagem simples para o dono ler.', ...over });

describe('entregas (botão Entregas)', () => {
  it('só tarefas concluídas, com resultado e sem erro; da mais nova para a mais antiga', () => {
    const list = deliveriesFrom([
      task({ id: 'a', doneAt: Date.parse('2026-10-18T15:00:00Z') }),
      task({ id: 'b', doneAt: Date.parse('2026-10-18T17:00:00Z') }),
      task({ id: 'c', state: 'doing' }),
      task({ id: 'd', error: 'falhou' }),
      task({ id: 'e', result: '  ' }),
    ], agents, rooms, 'America/Sao_Paulo');
    expect(list.map((d: { id: string }) => d.id)).toEqual(['escritorio:ana:b', 'escritorio:ana:a']);
    expect(list[0]).toMatchObject({ agentName: 'Ana', agentId: 'escritorio:ana', project: 'Marketing', request: 'Campanha', headline: 'Pronto. A campanha ficou assim.', attachments: [] });
    expect(list[0].summary).toBe('Resumo final em linguagem simples para o dono ler.');
    expect(list[0].sessionId).toBe('escritorio-ana-2026-10-18');
  });

  it('agente removido ainda aparece, pelo id; texto com acentos e markdown fica inteiro em text', () => {
    const md = '**Título** — ação\n\n- item um\n- item dois';
    const [d] = deliveriesFrom([task({ agent: 'sumiu', result: md })], agents, rooms, 'UTC');
    expect(d).toMatchObject({ agentName: 'sumiu', text: md });
    expect(d.agentId).toBeUndefined();
  });

  it('o dia da sessão usa o fuso local: 23h30 em Brasília ainda é o mesmo dia', () => {
    const [d] = deliveriesFrom([task({ doneAt: Date.parse('2026-10-19T02:30:00Z') })], agents, rooms, 'America/Sao_Paulo');
    expect(d.sessionId).toBe('escritorio-ana-2026-10-18');
  });
});
