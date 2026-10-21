// Modelo puro do painel de jogo (sem DOM): rótulos, textos do resultado, apostas possíveis e mensagens de falha.
// Quem decide de verdade é o servidor (regras, saldo, humor); aqui só se explica ao jogador.
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

const ROTULOS: Record<Gesto, string> = { pedra: 'Pedra', papel: 'Papel', tesoura: 'Tesoura' };
export const ICONES_GESTO: Record<Gesto, string> = { pedra: '✊', papel: '✋', tesoura: '✌️' };

export const rotuloGesto = (g: string): string => (GESTOS as readonly string[]).includes(g) ? ROTULOS[g as Gesto] : '?';

export function resumoRodada(r: RodadaJogo): string {
  const fim = r.vencedor === 'pessoa' ? 'Você venceu a rodada.' : r.vencedor === 'agente' ? 'O agente venceu a rodada.' : 'Empate: a rodada se repete.';
  return `Rodada ${r.numero}: ${rotuloGesto(r.gestoPessoa)} contra ${rotuloGesto(r.gestoAgente)}. ${fim}`;
}

const moedas = (n: number): string => `${n} ${n === 1 ? 'moeda' : 'moedas'}`;

/** `delta`: quanto o saldo da pessoa mudou por causa da partida (aposta paga ou perdida). */
export function textoResultado(fim: boolean, resultado: string | undefined, delta: number): string {
  if (!fim) return '';
  if (resultado === 'pessoa') return `Você venceu! +${moedas(Math.abs(delta))}.`;
  if (resultado === 'agente') return `Você perdeu. −${moedas(Math.abs(delta))}.`;
  return `Empate. As apostas voltaram: ${moedas(0)}.`;
}

/** Só as apostas que as duas partes pagam; saldo desconhecido (null) não restringe. */
export function apostasPossiveis(saldoPessoa: number | null | undefined, saldoAgente: number | null | undefined): number[] {
  const menor = Math.min(saldoPessoa ?? Infinity, saldoAgente ?? Infinity);
  return APOSTAS.filter((a) => a <= menor);
}

export function mensagemDaFalha(status: number, erro: string): string {
  switch (status) {
    case 0: return 'Sem conexão com o servidor.';
    case 403: return 'Só dono ou equipe com nome pode jogar.';
    case 404: return 'Partida não encontrada. Desafie de novo.';
    case 409: return erro || 'A partida mudou. Atualizei o estado; jogue de novo.';
    case 410: return 'A partida expirou e as apostas voltaram.';
    case 422: return erro || 'Sem moedas suficientes para essa aposta.';
    case 429: return erro || 'Espere alguns segundos para jogar de novo com este agente.';
    default: return erro || 'Não deu certo.';
  }
}

const HUMORES: Record<Humor, { icone: string; palavra: Humor }> = {
  animado: { icone: '😄', palavra: 'animado' },
  neutro: { icone: '😐', palavra: 'neutro' },
  chateado: { icone: '😞', palavra: 'chateado' },
};

/** Ícone E palavra: o humor nunca depende só de cor. Valor ausente ou desconhecido = neutro. */
export const humorRotulo = (h: string | undefined): { icone: string; palavra: Humor } => (h !== undefined && Object.hasOwn(HUMORES, h) ? HUMORES[h as Humor] : HUMORES.neutro);
