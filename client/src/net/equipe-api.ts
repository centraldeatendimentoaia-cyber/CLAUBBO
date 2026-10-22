// Chamadas da barra da equipe às rotas /api/equipe. O servidor decide quem pode editar quem; aqui só se devolve o resultado.
import type { Pessoa } from '../ui/equipe-model';

export interface Equipe { equipe: Pessoa[]; eu: string; euPapel: string }
export type Resultado = { ok: true; corpo: Record<string, unknown> } | { ok: false; status: number; erro: string };

/** Dono e equipe com o personagem de cada um; null se a chamada falha (sem nome, agente, rede). */
export async function lerEquipe(): Promise<Equipe | null> {
  try {
    const res = await fetch('/api/equipe');
    if (!res.ok) return null;
    const c = (await res.json()) as Partial<Equipe>;
    return Array.isArray(c.equipe) && typeof c.eu === 'string' ? { equipe: c.equipe, eu: c.eu, euPapel: typeof c.euPapel === 'string' ? c.euPapel : '' } : null;
  } catch {
    return null;
  }
}

/** Grava o personagem (`{seed, look, parts}`) ou volta ao sorteio (`{reset: true}`). */
export async function salvarPersonagemEquipe(nome: string, corpo: Record<string, unknown>): Promise<Resultado> {
  try {
    const res = await fetch(`/api/equipe/${encodeURIComponent(nome)}/personagem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const c = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return res.ok ? { ok: true, corpo: c } : { ok: false, status: res.status, erro: typeof c.error === 'string' ? c.error : '' };
  } catch {
    return { ok: false, status: 0, erro: '' };
  }
}
