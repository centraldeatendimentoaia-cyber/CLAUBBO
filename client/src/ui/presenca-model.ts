// Modelo puro (sem DOM) da presença ao vivo: o que a página manda sobre o próprio boneco e como a lista que vem do
// servidor vira os bonecos das outras pessoas no mapa.
import type { AppearanceParts } from '../../../shared/appearance';
import type { Dir } from '../art/api';
import type { Convidado } from '../world/api';

/** Uma pessoa no mapa, como o servidor manda (x e y em tiles). */
export interface PresencaPessoa {
  nome: string;
  papel: string;
  andar: number;
  x: number;
  y: number;
  dir: Dir;
}

export interface Posicao {
  andar: number;
  x: number;
  y: number;
  dir: Dir;
}

/** Quem da equipe tem personagem editado (de `/api/equipe`). */
export interface PersonagemEquipe {
  nome: string;
  look: 'f' | 'm';
  parts?: AppearanceParts;
  custom: boolean;
}

/** Intervalo mínimo entre avisos de posição (o servidor recusa menos de 80 ms; aqui são 5 por segundo no máximo). */
export const INTERVALO_AVISO_MS = 200;
/** Com o boneco parado, repete o aviso a cada tanto para o servidor não achar que a página saiu (o prazo dele é 8 s). */
export const BATIMENTO_MS = 4000;
/** Menos que isso (em tiles) com a mesma direção e o mesmo andar não vale um aviso novo. */
const PASSO_MINIMO = 0.05;

/** Vale avisar agora? Sim se mexeu (andar, direção ou mais que um fio) e passou o intervalo, ou se faz tempo que não avisa. */
export function devoAvisar(atual: Posicao, ultima: Posicao | null, desdeUltimoMs: number): boolean {
  if (!ultima) return true;
  if (desdeUltimoMs >= BATIMENTO_MS) return true;
  if (desdeUltimoMs < INTERVALO_AVISO_MS) return false;
  return atual.andar !== ultima.andar || atual.dir !== ultima.dir || Math.hypot(atual.x - ultima.x, atual.y - ultima.y) > PASSO_MINIMO;
}

const chave = (n: string): string => n.trim().toLowerCase();

/**
 * A lista do servidor vira os bonecos do mapa: tira a própria pessoa (`eu`, já que o meu boneco é o que eu controlo) e dá
 * a cada um o personagem editado na equipe (ou o padrão). Sem saber quem eu sou ainda (`eu` vazio), ninguém aparece: é
 * melhor demorar um instante do que mostrar um fantasma de mim mesmo.
 */
export function convidadosDe(lista: readonly PresencaPessoa[], eu: string, equipe: readonly PersonagemEquipe[]): Convidado[] {
  if (!eu) return [];
  const quem = chave(eu);
  const out: Convidado[] = [];
  for (const p of lista) {
    if (chave(p.nome) === quem) continue;
    const e = equipe.find((x) => chave(x.nome) === chave(p.nome));
    out.push({
      id: `convidado:${chave(p.nome)}`,
      nome: p.nome,
      look: e?.look ?? 'm',
      ...(e?.custom && e.parts ? { parts: e.parts } : {}),
      andar: p.andar,
      x: p.x,
      y: p.y,
      dir: p.dir,
    });
  }
  return out;
}

/** Algum nome da lista ainda não está na equipe que a página conhece? Então vale reler `/api/equipe` (cadastro novo). */
export const temDesconhecido = (lista: readonly PresencaPessoa[], eu: string, equipe: readonly PersonagemEquipe[]): boolean =>
  lista.some((p) => chave(p.nome) !== chave(eu) && !equipe.some((x) => chave(x.nome) === chave(p.nome)));

/** Valida o que veio do servidor (stream não é de confiança cega): só entra quem tem a forma esperada. */
export function lerLista(v: unknown): PresencaPessoa[] {
  if (!Array.isArray(v)) return [];
  const dirs = ['up', 'down', 'left', 'right'];
  return v.filter((p): p is PresencaPessoa => !!p && typeof p.nome === 'string' && Number.isInteger(p.andar) && Number.isFinite(p.x) && Number.isFinite(p.y) && dirs.includes(p.dir));
}
