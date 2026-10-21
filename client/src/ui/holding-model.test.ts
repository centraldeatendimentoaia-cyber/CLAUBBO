import { describe, expect, it } from 'vitest';
import type { HoldingView, PendingItem } from '../../../shared/types';
import { actionsOf, ageLabel, agentMarker, applyDecision, batchState, canDecide, decisionOutcome, decisionUrl, emptyKind, keyAction, rotinaMarker, shortcutFor, sortPending, tagsOf } from './holding-model';

const item = (o: Partial<PendingItem> = {}): PendingItem => ({
  id: 'tarefa:t1', kind: 'tarefa', ref: 't1', stage: 'plan', agent: 'ana', title: 'Plano', text: '', since: 0, urgent: false,
  cost: false, reversible: true, sendsMessage: false, ownerOnly: false, needsDialog: false, safe: true, ...o,
});
const view = (pendencias: PendingItem[], papel: HoldingView['papel'] = 'dono', lista: HoldingView['rotinas']['lista'] = []): HoldingView => ({
  pendencias, avaliar: [], rotinas: { rodaram: 0, falharam: 0, previstas: 0, lista }, elenco: [], xpHoje: 0, ticker: [], papel,
});

describe('rótulos', () => {
  it('idade do pedido', () => {
    expect(ageLabel(0, 40 * 60_000)).toBe('40 min');
    expect(ageLabel(0, 5 * 3_600_000)).toBe('5 h');
    expect(ageLabel(0, 2 * 86_400_000)).toBe('2 d');
    expect(ageLabel(100, 50)).toBe('0 min');
  });
  it('etiquetas de risco', () => {
    expect(tagsOf(item())).toEqual([{ text: 'sem custo', tone: 'neutra' }, { text: 'reversível', tone: 'neutra' }]);
    const t = tagsOf(item({ cost: true, reversible: false, sendsMessage: true }));
    expect(t).toContainEqual({ text: 'custa tokens', tone: 'aviso' });
    expect(t).toContainEqual({ text: 'irreversível', tone: 'risco' });
    expect(t).toContainEqual({ text: 'envia mensagem', tone: 'risco' });
  });
  it('marcador do agente: cor, forma e texto', () => {
    expect(agentMarker('working')).toEqual({ cor: 'lima', forma: 'quadrado', texto: 'trabalhando' });
    expect(agentMarker('waiting')).toEqual({ cor: 'amarelo', forma: 'losango', texto: 'esperando você' });
    expect(agentMarker('shell')).toEqual({ cor: 'turquesa', forma: 'circulo', texto: 'shell' });
    expect(agentMarker('idle')).toEqual({ cor: 'lilas', forma: 'quadrado', texto: 'parado' });
    expect(agentMarker('erro')).toEqual({ cor: 'rosa', forma: 'triangulo', texto: 'erro' });
    expect(agentMarker('qualquer')).toEqual(agentMarker('idle'));
  });
});

describe('permissão e atalhos', () => {
  it('equipe não decide ownerOnly nem item sem a marca; dono decide tudo', () => {
    expect(canDecide(item({ ownerOnly: true }), 'equipe')).toBe(false);
    expect(canDecide({ ownerOnly: undefined } as never, 'equipe')).toBe(false);
    expect(canDecide(item({ ownerOnly: true }), 'dono')).toBe(true);
    expect(canDecide(item({ ownerOnly: false }), 'equipe')).toBe(true);
  });
  it('ações sem número; ownerOnly para equipe vira "aguarda o dono"; item não seguro exige clique deliberado', () => {
    expect(actionsOf(item(), 'dono')).toEqual([{ id: 'aprovar', deliberada: false }, { id: 'recusar', deliberada: false }, { id: 'abrir', deliberada: false }]);
    expect(actionsOf(item({ ownerOnly: true }), 'equipe')).toEqual([]);
    expect(actionsOf(item({ safe: false, needsDialog: true }), 'dono').every((x) => x.deliberada)).toBe(true);
  });
  it('atalho por posição', () => {
    expect(shortcutFor(0)).toBe('1');
    expect(shortcutFor(2)).toBe('3');
    expect(shortcutFor(3)).toBeNull();
    expect(shortcutFor(-1)).toBeNull();
  });
  it('tecla: dígito = posição do cartão exibido; só item seguro aprova, o resto abre; A aciona o lote', () => {
    const v = view([item({ id: 'a' }), item({ id: 'b', ownerOnly: true, needsDialog: true, safe: false, since: 5 })]);
    expect(keyAction(v, '1')).toEqual({ kind: 'cartao', id: 'a', action: 'aprovar' });
    expect(keyAction(v, '2')).toEqual({ kind: 'cartao', id: 'b', action: 'abrir' });
    expect(keyAction(v, '3')).toBeNull();
    expect(keyAction(v, 'a')).toEqual({ kind: 'lote' });
    expect(keyAction({ ...v, papel: 'equipe' }, '2')).toBeNull();
    expect(keyAction(view([item({ safe: false })]), 'A')).toBeNull();
    expect(keyAction(v, 'x')).toBeNull();
  });
  it('tecla usa a ordem exibida (sortPending), mesmo com lista fora de ordem', () => {
    const v = view([item({ id: 'novo', since: 9 }), item({ id: 'urg', since: 5, urgent: true })]);
    expect(keyAction(v, '1')).toEqual({ kind: 'cartao', id: 'urg', action: 'aprovar' });
  });
  it('tolera pendencias e rotinas ausentes', () => {
    const v = { papel: 'dono' } as unknown as HoldingView;
    expect(batchState(v)).toEqual({ enabled: false, count: 0 });
    expect(keyAction(v, '1')).toBeNull();
    expect(emptyKind(v)).toBe('nada-esperando');
  });
});

describe('lote seguro', () => {
  it('só habilita com itens safe que o papel pode decidir', () => {
    expect(batchState(view([item({ safe: false })]))).toEqual({ enabled: false, count: 0 });
    expect(batchState(view([item(), item({ id: 'x', safe: false })]))).toEqual({ enabled: true, count: 1 });
    expect(batchState(view([item({ ownerOnly: true })], 'equipe')).enabled).toBe(false);
    expect(batchState(view([])).enabled).toBe(false);
  });
});

describe('ordenação e vazio', () => {
  it('urgente primeiro, depois o mais antigo; não muta a entrada', () => {
    const l = [item({ id: 'novo', since: 9 }), item({ id: 'velho', since: 1 }), item({ id: 'urg', since: 5, urgent: true })];
    expect(sortPending(l).map((p) => p.id)).toEqual(['urg', 'velho', 'novo']);
    expect(l[0].id).toBe('novo');
  });
  it('estado vazio', () => {
    expect(emptyKind(view([]))).toBe('nada-esperando');
    expect(emptyKind(view([item()]))).toBe('sem-rotinas');
    expect(emptyKind(view([item()], 'dono', [{ id: 'r', title: 'r', agent: 'a', whenLabel: '', estado: 'ok' }]))).toBeNull();
  });
});

describe('resultado da decisão', () => {
  it('200 feito; 409 já decidido por <nome>; 403 negado; resto erro', () => {
    expect(decisionOutcome(200)).toEqual({ kind: 'feito' });
    expect(decisionOutcome(409, 'já decidido por Bia')).toEqual({ kind: 'ja-decidido', texto: 'já decidido por Bia' });
    expect(decisionOutcome(409, 'o item mudou enquanto a decisão esperava; confira de novo')).toEqual({ kind: 'mudou', texto: 'o item mudou; atualizando' });
    expect(decisionOutcome(403, 'só o dono pode decidir isto')).toEqual({ kind: 'negado', texto: 'só o dono pode decidir isto' });
    expect(decisionOutcome(500, 'x').kind).toBe('erro');
  });
  it('409 tira o cartão e nunca manda repetir a ação', () => {
    const v = view([item({ id: 'a' }), item({ id: 'b' })]);
    const r = applyDecision(v, 'a', decisionOutcome(409, 'já decidido por Bia'));
    expect(r.view.pendencias.map((p) => p.id)).toEqual(['b']);
    expect(r.nota).toBe('já decidido por Bia');
    expect(v.pendencias).toHaveLength(2);
  });
  it('409 "mudou" mantém o cartão e pede recarregar', () => {
    const v = view([item({ id: 'a' })]);
    const r = applyDecision(v, 'a', decisionOutcome(409, 'o item mudou enquanto a decisão esperava'));
    expect(r.view.pendencias).toHaveLength(1);
    expect(r.recarregar).toBe(true);
  });
  it('403 e erro mantêm o cartão', () => {
    const v = view([item({ id: 'a' })]);
    expect(applyDecision(v, 'a', decisionOutcome(403, 'só o dono pode decidir isto')).view.pendencias).toHaveLength(1);
    expect(applyDecision(v, 'a', decisionOutcome(500, 'falhou')).view.pendencias).toHaveLength(1);
  });
});

describe('rotinaMarker e decisionUrl', () => {
  it('falha de rotina é rosa, triângulo e texto; os outros estados também trazem cor, forma e texto', () => {
    expect(rotinaMarker('falhou')).toEqual({ cor: 'rosa', forma: 'triangulo', texto: 'falhou' });
    expect(rotinaMarker('ok').texto).toBe('rodou');
    expect(rotinaMarker('pausada').cor).toBe('lilas');
    expect(rotinaMarker('aguarda').forma).toBe('circulo');
    expect(rotinaMarker('qualquer' as never).texto).toBe('parada');
  });
  it('rota de decisão por tipo de pedido, com a referência codificada', () => {
    expect(decisionUrl(item({ kind: 'tarefa', ref: 't 1' }), 'aprovar')).toBe('/api/ops/tasks/t%201/approve');
    expect(decisionUrl(item({ kind: 'terminal', ref: 'r1' }), 'recusar')).toBe('/api/cli/requests/r1/reject');
    expect(decisionUrl(item({ kind: 'proposta', ref: 'p1' }), 'aprovar')).toBe('/api/agent-proposals/p1/approve');
    expect(decisionUrl(item({ kind: 'chamada', ref: 'c1' }), 'recusar')).toBe('/api/agent-calls/c1/reject');
  });
});
