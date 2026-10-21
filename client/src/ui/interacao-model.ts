// Modelo puro do menu de interação do boneco (sem DOM): quais ações existem para um agente ou para o elevador, quais
// estão apagadas e por quê. Quem decide de verdade é o servidor (papel, 409); aqui só se explica ao jogador.
import { ESCADAS_AURA } from '../world/render/aura';

export type Acao = 'conversar' | 'desafiar' | 'btw' | 'agradecer' | 'subir' | 'descer' | 'andar';

export interface ItemMenu {
  acao: Acao;
  rotulo: string;
  atalho: string;
  habilitado: boolean;
  motivo?: string;
  /** Só no menu do elevador: o andar de destino. */
  andar?: number;
}

export const MENSAGEM_SEM_ELEVADOR = 'Nenhum andar com elevador.';

export interface AgenteMenu {
  model?: string;
  provider?: string;
  status: string;
  ocioso: boolean;
  obrigadoPossivel: boolean;
}

/** A escada do provedor (contas Codex usam a do Codex; qualquer outra, a do Claude). */
export function escadaDe(provider: string | undefined): readonly string[] {
  return provider === 'codex' ? ESCADAS_AURA.codex : ESCADAS_AURA.claude;
}

/** Os dois modelos vizinhos na escada; null quando o modelo está fora dela. */
export function vizinhos(model: string | undefined, provider?: string): { acima: string | null; abaixo: string | null } | null {
  const escada = escadaDe(provider);
  const i = model ? escada.indexOf(model) : -1;
  if (i < 0) return null;
  return { acima: escada[i + 1] ?? null, abaixo: escada[i - 1] ?? null };
}

/** Os seis itens do menu de um agente, na ordem do spec. */
export function menuDoAgente(a: AgenteMenu): ItemMenu[] {
  const v = vizinhos(a.model, a.provider);
  const troca = (acao: 'subir' | 'descer'): ItemMenu => {
    const subir = acao === 'subir';
    const nome = subir ? 'Puxar a orelha' : 'Baixar o modelo';
    const atalho = subir ? '5' : '6';
    if (!v) return { acao, rotulo: nome, atalho, habilitado: false, motivo: 'modelo fora da escada' };
    const destino = subir ? v.acima : v.abaixo;
    if (!destino) return { acao, rotulo: nome, atalho, habilitado: false, motivo: subir ? 'já no topo' : 'já na base' };
    return { acao, rotulo: `${nome} ${subir ? '▲' : '▼'} ${a.model} → ${destino}`, atalho, habilitado: true };
  };
  return [
    { acao: 'conversar', rotulo: 'Conversar / dar tarefa', atalho: '1', habilitado: true },
    a.ocioso
      ? { acao: 'desafiar', rotulo: 'Desafiar para um jogo', atalho: '2', habilitado: true }
      : { acao: 'desafiar', rotulo: 'Desafiar para um jogo', atalho: '2', habilitado: false, motivo: 'só agente ocioso' },
    { acao: 'btw', rotulo: 'Perguntar /btw', atalho: '3', habilitado: true },
    a.obrigadoPossivel
      ? { acao: 'agradecer', rotulo: 'Agradecer pelo trabalho', atalho: '4', habilitado: true }
      : { acao: 'agradecer', rotulo: 'Agradecer pelo trabalho', atalho: '4', habilitado: false, motivo: 'sem resultado novo' },
    troca('subir'),
    troca('descer'),
  ];
}

/** Os andares que o elevador alcança; o andar atual aparece apagado. Lista vazia: mostre MENSAGEM_SEM_ELEVADOR. */
export function menuDoElevador(andares: { andar: number; nome: string; temElevador: boolean }[], atual: number): ItemMenu[] {
  return andares
    .filter((a) => a.temElevador)
    .map((a, i) => ({
      acao: 'andar' as const,
      rotulo: `Andar ${a.andar} — ${a.nome}`,
      atalho: String(i + 1),
      habilitado: a.andar !== atual,
      ...(a.andar === atual ? { motivo: 'você está aqui' } : {}),
      andar: a.andar,
    }));
}

/** O texto que o jogador lê quando uma ação volta com erro; o servidor decide e explica (403, 409...), aqui só se acolhe. */
export function mensagemDaFalha(acao: Acao, status: number, erro: string): string {
  if (status === 409 && acao !== 'agradecer') return 'O modelo já mudou. Atualizei o estado; escolha de novo.';
  if (status === 0) return 'Sem conexão com o servidor.';
  return erro || 'Não deu certo.';
}
