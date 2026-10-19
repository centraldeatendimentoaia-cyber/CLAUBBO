// Etapas de um pedido aos terminais, para o card "Pedidos": pedido -> aprovado/enviado -> terminal trabalhando -> devolvido.
// Puro (sem DOM): os campos vêm de GET /api/cli/requests (state, retorno).
export interface RequestLike {
  state: string;
  auto?: boolean;
  retorno?: string;
  error?: string;
}

export type Tone = 'wait' | 'run' | 'ok' | 'bad' | 'off';

export interface Stage {
  label: string;
  tone: Tone;
}

export function requestStage(r: RequestLike): Stage {
  switch (r.state) {
    case 'pending': return { label: 'Esperando você aprovar', tone: 'wait' };
    case 'rejected': return { label: 'Recusado', tone: 'off' };
    case 'cancelled': return { label: 'Cancelado', tone: 'off' };
    case 'failed': return { label: 'Falhou ao enviar', tone: 'bad' };
    case 'sent': break;
    default: return { label: r.state, tone: 'off' };
  }
  const how = r.auto ? 'enviado sem clique' : 'enviado';
  switch (r.retorno) {
    case 'aguardando': return { label: `${how}: terminal trabalhando, aguardando o retorno`, tone: 'run' };
    case 'entregue':
    case 'entregue_sem_acordar': return { label: 'Concluído: resposta devolvida ao agente', tone: 'ok' };
    case 'sem_retorno': return { label: `${how}: sem retorno (passou do prazo)`, tone: 'bad' };
    case 'falhou': return { label: 'Terminal terminou, mas a devolução falhou', tone: 'bad' };
    case 'cancelado': return { label: `${how}: você parou de esperar o retorno`, tone: 'off' };
    default: return { label: how, tone: 'ok' };
  }
}

/** O pedido ainda pode ser cancelado (esperando aprovação ou esperando o retorno)? */
export function canCancel(r: RequestLike): boolean {
  return r.state === 'pending' || (r.state === 'sent' && r.retorno === 'aguardando');
}

/** Título da aba/contador: "(3) ", ou vazio sem nada esperando. */
export function waitingPrefix(n: number): string {
  return n > 0 ? `(${n}) ` : '';
}
