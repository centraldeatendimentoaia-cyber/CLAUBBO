// Modelo puro do painel da holding (sem DOM). Todo texto vindo de agente é dado: quem renderiza usa textContent/h(), nunca HTML.
import type { HoldingView, Papel, PendingItem } from '../../../shared/types';

export type Tom = 'risco' | 'neutra' | 'aviso';
export interface Etiqueta { text: string; tone: Tom }

/** Há quanto tempo espera: "40 min", "5 h", "2 d". */
export function ageLabel(since: number, now: number): string {
  const min = Math.max(0, Math.floor((now - since) / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / (24 * 60))} d`;
}

export function tagsOf(p: PendingItem): Etiqueta[] {
  const t: Etiqueta[] = [
    p.cost ? { text: 'custa tokens', tone: 'aviso' } : { text: 'sem custo', tone: 'neutra' },
    p.reversible ? { text: 'reversível', tone: 'neutra' } : { text: 'irreversível', tone: 'risco' },
  ];
  if (p.sendsMessage) t.push({ text: 'envia mensagem', tone: 'risco' });
  return t;
}

/** Espelha podeDecidir do servidor (o servidor continua sendo quem decide de verdade). */
export const canDecide = (p: Pick<PendingItem, 'ownerOnly'>, papel: Papel): boolean => papel === 'dono' || (papel === 'equipe' && !p.ownerOnly);

/** Urgente primeiro, depois o mais antigo. Não muta a entrada. */
export const sortPending = (l: PendingItem[]): PendingItem[] => [...l].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.since - b.since);

export type Acao = 'aprovar' | 'recusar' | 'abrir';
/** Botões do cartão. Item que a pessoa não pode decidir ("aguarda o dono") não tem botão nenhum. */
export function actionsOf(p: PendingItem, papel: Papel): { id: Acao; key: '1' | '2' | '3' }[] {
  if (!canDecide(p, papel)) return [];
  return [{ id: 'aprovar', key: '1' }, { id: 'recusar', key: '2' }, { id: 'abrir', key: '3' }];
}

/** Atalho do cartão na posição `index` (1, 2, 3); do quarto em diante não há. */
export const shortcutFor = (index: number): '1' | '2' | '3' | null => (['1', '2', '3'] as const)[index] ?? null;

/** Lote seguro: só os itens `safe` que esta pessoa pode decidir. O servidor recalcula a lista; isto só habilita o botão. */
export function batchState(v: HoldingView): { enabled: boolean; count: number } {
  const count = v.pendencias.filter((p) => p.safe && canDecide(p, v.papel)).length;
  return { enabled: count > 0, count };
}

/** Tecla pressionada -> o que fazer. Dígito = aprovar o cartão da posição; A = lote seguro. Sem permissão, nada. */
export function keyAction(v: HoldingView, key: string): { kind: 'lote' } | { kind: 'cartao'; id: string; action: 'aprovar' } | null {
  if (key.toLowerCase() === 'a') return batchState(v).enabled ? { kind: 'lote' } : null;
  const i = ['1', '2', '3'].indexOf(key);
  const p = i < 0 ? undefined : v.pendencias[i];
  return p && canDecide(p, v.papel) ? { kind: 'cartao', id: p.id, action: 'aprovar' } : null;
}

/** Qual estado vazio mostrar: nada esperando decisão; ou, havendo pedidos, nenhuma rotina hoje. */
export function emptyKind(v: HoldingView): 'nada-esperando' | 'sem-rotinas' | null {
  if (v.pendencias.length === 0) return 'nada-esperando';
  return v.rotinas.lista.length === 0 ? 'sem-rotinas' : null;
}

export type Outcome =
  | { kind: 'feito' }
  | { kind: 'ja-decidido'; texto: string }
  | { kind: 'negado'; texto: string }
  | { kind: 'erro'; texto: string };

/** Resposta do servidor a uma decisão. 409 com "já decidido por <nome>" mantém o nome; qualquer outro 409 vira "já decidido". */
export function decisionOutcome(status: number, error = ''): Outcome {
  if (status >= 200 && status < 300) return { kind: 'feito' };
  if (status === 409) return { kind: 'ja-decidido', texto: /^já decidido por .+/.test(error) ? error : 'já decidido' };
  if (status === 403) return { kind: 'negado', texto: error || 'sem permissão' };
  return { kind: 'erro', texto: error || 'não deu certo' };
}

/** Aplica o resultado ao painel. Feito ou já decidido tiram o cartão; nunca manda repetir a ação (`repetir` é sempre false). */
export function applyDecision(v: HoldingView, id: string, o: Outcome): { view: HoldingView; nota?: string; repetir: false } {
  if (o.kind === 'feito' || o.kind === 'ja-decidido') {
    return { view: { ...v, pendencias: v.pendencias.filter((p) => p.id !== id) }, ...(o.kind === 'ja-decidido' ? { nota: o.texto } : {}), repetir: false };
  }
  return { view: v, nota: o.texto, repetir: false };
}

export interface Marcador { cor: 'lima' | 'amarelo' | 'turquesa' | 'lilas' | 'rosa'; forma: 'quadrado' | 'losango' | 'circulo' | 'triangulo'; texto: string }
/** Estado do agente: sempre cor + forma + texto. Qualquer estado desconhecido cai em "parado". */
export function agentMarker(status: string): Marcador {
  switch (status) {
    case 'working': return { cor: 'lima', forma: 'quadrado', texto: 'trabalhando' };
    case 'waiting': return { cor: 'amarelo', forma: 'losango', texto: 'esperando você' };
    case 'shell': return { cor: 'turquesa', forma: 'circulo', texto: 'shell' };
    case 'erro': return { cor: 'rosa', forma: 'triangulo', texto: 'erro' };
    default: return { cor: 'lilas', forma: 'quadrado', texto: 'parado' };
  }
}
