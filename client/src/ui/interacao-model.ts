// Modelo puro do menu de interação do boneco (sem DOM): quais ações existem para um agente ou para o elevador, quais
// estão apagadas e por quê. Quem decide de verdade é o servidor (papel, 409); aqui só se explica ao jogador.
import type { AppearanceParts } from '../../../shared/appearance';
import { tr } from '../../../shared/i18n';
import { ESCADAS_AURA } from '../world/render/aura';

/** A menor aposta do jogo (o servidor aceita 5, 10 e 25). */
const APOSTA_MINIMA = 5;

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
  /** A lista de quem pode receber obrigado ainda não chegou. */
  carregando?: boolean;
  /** Agente de terminal (andar 2): o jogo é só dos agentes do Escritório. */
  terminal?: boolean;
  /** Saldo da pessoa (GET /api/carteira); null ou ausente = ainda não se sabe. */
  saldoPessoa?: number | null;
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
  const semMoedas = typeof a.saldoPessoa === 'number' && a.saldoPessoa < APOSTA_MINIMA;
  const motivoDesafio = a.terminal ? tr('agente de terminal não joga') : !a.ocioso ? tr('só agente ocioso') : semMoedas ? tr('sem moedas') : undefined;
  const desafio: ItemMenu = { acao: 'desafiar', rotulo: tr('Desafiar para um jogo'), atalho: '2', habilitado: !motivoDesafio, ...(motivoDesafio ? { motivo: motivoDesafio } : {}) };
  return [
    { acao: 'conversar', rotulo: 'Conversar / dar tarefa', atalho: '1', habilitado: true },
    desafio,
    { acao: 'btw', rotulo: 'Perguntar /btw', atalho: '3', habilitado: true },
    a.obrigadoPossivel
      ? { acao: 'agradecer', rotulo: 'Agradecer pelo trabalho', atalho: '4', habilitado: true }
      : { acao: 'agradecer', rotulo: 'Agradecer pelo trabalho', atalho: '4', habilitado: false, motivo: a.carregando ? 'carregando…' : 'sem resultado novo' },
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
      rotulo: a.nome ? `Andar ${a.andar} — ${a.nome}` : `Andar ${a.andar}`,
      atalho: String(i + 1),
      habilitado: a.andar !== atual,
      ...(a.andar === atual ? { motivo: 'você está aqui' } : {}),
      andar: a.andar,
    }));
}

/** O texto que o jogador lê quando uma ação volta com erro; o servidor decide e explica (403, 409...), aqui só se acolhe. */
export function mensagemDaFalha(acao: Acao, status: number, erro: string): string {
  if (status === 409 && (acao === 'subir' || acao === 'descer')) return 'O modelo já mudou. Atualizei o estado; escolha de novo.';
  if (status === 0) return 'Sem conexão com o servidor.';
  return erro || 'Não deu certo.';
}

/**
 * Guarda de execução única: enquanto uma chamada está em voo, novos disparos são ignorados (devolvem `rodou: false`).
 * Evita duplo envio por Enter repetido, clique duplo ou Espaço (no Firefox o click vem no keyup).
 */
export function criarGuarda() {
  let ativo = false;
  return {
    get ativo() {
      return ativo;
    },
    async rodar<T>(fn: () => Promise<T>): Promise<{ rodou: true; valor: T } | { rodou: false }> {
      if (ativo) return { rodou: false };
      ativo = true;
      try {
        return { rodou: true, valor: await fn() };
      } finally {
        ativo = false;
      }
    },
  };
}

/**
 * A aparência do boneco: a do World quando existe; senão o padrão (sem `parts`, o desenho usa o visual de sempre pela
 * semente do nome). `look` fixo e estável por nome; sem nome, "Você".
 */
export function aparenciaDoJogador(
  me?: { name: string; look: 'f' | 'm'; parts?: AppearanceParts },
  nome?: string,
  eu?: { rotulo: string; look: 'f' | 'm'; parts?: AppearanceParts; custom: boolean },
): { name: string; look: 'f' | 'm'; parts?: AppearanceParts } {
  // O personagem que a pessoa editou na barra da equipe vale mais que o do World e que o padrão.
  if (eu?.custom && eu.parts) return { name: eu.rotulo, look: eu.look, parts: eu.parts };
  if (me) return { name: me.name, look: me.look, ...(me.parts ? { parts: me.parts } : {}) };
  const n = nome?.trim() || 'Você';
  const soma = [...n].reduce((t, c) => t + c.charCodeAt(0), 0);
  return { name: n, look: soma % 2 === 0 ? 'f' : 'm' };
}
