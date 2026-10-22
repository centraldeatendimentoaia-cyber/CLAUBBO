// Modelo puro do painel de jogo (sem DOM): rótulos, textos do resultado, apostas possíveis e mensagens de falha.
// Quem decide de verdade é o servidor (regras, saldo, humor); aqui só se explica ao jogador.
import { tr } from '../../../shared/i18n';

export const GESTOS = ['pedra', 'papel', 'tesoura'] as const;
export type Gesto = (typeof GESTOS)[number];
export const APOSTAS = [5, 10, 25] as const;
export type Humor = 'animado' | 'neutro' | 'chateado';

export interface RodadaJogo {
  numero: number;
  gestoPessoa: string;
  gestoAgente: string;
  vencedor: string;
}

const rotulos = (): Record<Gesto, string> => ({ pedra: tr('Pedra'), papel: tr('Papel'), tesoura: tr('Tesoura') });
export const ICONES_GESTO: Record<Gesto, string> = { pedra: '✊', papel: '✋', tesoura: '✌️' };

export const rotuloGesto = (g: string): string => (GESTOS as readonly string[]).includes(g) ? rotulos()[g as Gesto] : '?';

export function resumoRodada(r: RodadaJogo): string {
  const fim = r.vencedor === 'pessoa' ? tr('Você venceu a rodada.') : r.vencedor === 'agente' ? tr('O agente venceu a rodada.') : tr('Empate: a rodada se repete.');
  return tr('Rodada {0}: {1} contra {2}. {3}', [r.numero, rotuloGesto(r.gestoPessoa), rotuloGesto(r.gestoAgente), fim]);
}

const moedas = (n: number): string => (n === 1 ? tr('{0} moeda', [n]) : tr('{0} moedas', [n]));

/** `delta`: quanto o saldo da pessoa mudou por causa da partida (aposta paga ou perdida). */
export function textoResultado(fim: boolean, resultado: string | undefined, delta: number): string {
  if (!fim) return '';
  if (resultado === 'pessoa') return tr('Você venceu! +{0}.', [moedas(Math.abs(delta))]);
  if (resultado === 'agente') return tr('Você perdeu. −{0}.', [moedas(Math.abs(delta))]);
  return tr('Empate. As apostas voltaram: {0}.', [moedas(0)]);
}

/** Só as apostas que as duas partes pagam; saldo desconhecido (null) não restringe. */
export function apostasPossiveis(saldoPessoa: number | null | undefined, saldoAgente: number | null | undefined): number[] {
  const menor = Math.min(saldoPessoa ?? Infinity, saldoAgente ?? Infinity);
  return APOSTAS.filter((a) => a <= menor);
}

export function mensagemDaFalha(status: number, erro: string): string {
  switch (status) {
    case 0: return tr('Sem conexão com o servidor.');
    case 403: return tr('Só dono ou equipe com nome pode jogar.');
    case 404: return tr('Partida não encontrada. Desafie de novo.');
    case 409: return erro || tr('A partida mudou. Atualizei o estado; jogue de novo.');
    case 410: return tr('A partida expirou e as apostas voltaram.');
    case 422: return erro || tr('Sem moedas suficientes para essa aposta.');
    case 429: return erro || tr('Espere alguns segundos para jogar de novo com este agente.');
    default: return erro || tr('Não deu certo.');
  }
}

const HUMORES: Record<Humor, { icone: string; palavra: Humor }> = {
  animado: { icone: '😄', palavra: 'animado' },
  neutro: { icone: '😐', palavra: 'neutro' },
  chateado: { icone: '😞', palavra: 'chateado' },
};

/** Ícone E palavra: o humor nunca depende só de cor. Valor ausente ou desconhecido = neutro. */
export const humorRotulo = (h: string | undefined): { icone: string; palavra: Humor } => (h !== undefined && Object.hasOwn(HUMORES, h) ? HUMORES[h as Humor] : HUMORES.neutro);

/** Etiqueta ao lado do nome do agente: só quando o humor foge do neutro (discreta, sempre com ícone e palavra). */
export const humorEtiqueta = (h: string | undefined): { icone: string; palavra: Humor } | null => {
  const r = humorRotulo(h);
  return r.palavra === 'neutro' ? null : r;
};

/** Palavra do humor na língua da interface (`palavra` continua sendo o identificador estável). */
export const textoHumor = (h: Humor): string => (h === 'animado' ? tr('animado') : h === 'chateado' ? tr('chateado') : tr('neutro'));
