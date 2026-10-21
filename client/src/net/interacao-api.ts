// Chamadas do menu de interação às rotas dos agentes (modelo, obrigado, btw) e à lista de quem pode receber um obrigado.
// O servidor decide (papel, 409); aqui só se devolve o resultado.
export type Resposta = { ok: true; corpo: Record<string, unknown> } | { ok: false; status: number; erro: string };

async function chamar(url: string, body: unknown): Promise<Resposta> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, corpo };
    return { ok: false, status: res.status, erro: typeof corpo.error === 'string' ? corpo.error : '' };
  } catch {
    return { ok: false, status: 0, erro: '' };
  }
}

const rota = (id: string, nome: string) => `/api/agentes/${encodeURIComponent(id)}/${nome}`;

export const trocarModelo = (id: string, direcao: 'subir' | 'descer', de: string) => chamar(rota(id, 'modelo'), { direcao, de });
export const agradecer = (id: string) => chamar(rota(id, 'obrigado'), {});
/** A rota lê `pergunta` (não `texto`). */
export const perguntarBtw = (id: string, pergunta: string) => chamar(rota(id, 'btw'), { pergunta });

/** Ids dos agentes com resultado ainda sem agradecimento (GET /api/xp). Em caso de erro, ninguém. */
export async function obrigadosPossiveis(): Promise<Set<string>> {
  try {
    const res = await fetch('/api/xp');
    if (!res.ok) return new Set();
    const body = (await res.json()) as { elenco?: { agent?: unknown; obrigadoPossivel?: unknown }[] };
    return new Set((body.elenco ?? []).filter((e) => e.obrigadoPossivel === true && typeof e.agent === 'string').map((e) => e.agent as string));
  } catch {
    return new Set();
  }
}

/** GET com a mesma forma de resposta de `chamar`. */
async function ler(url: string): Promise<Resposta> {
  try {
    const res = await fetch(url);
    const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, corpo };
    return { ok: false, status: res.status, erro: typeof corpo.error === 'string' ? corpo.error : '' };
  } catch {
    return { ok: false, status: 0, erro: '' };
  }
}

/** Saldo da pessoa no servidor (GET /api/carteira); null quando a chamada falha. */
export async function saldoDaCarteira(): Promise<number | null> {
  const r = await ler('/api/carteira');
  return r.ok && typeof r.corpo.saldo === 'number' ? r.corpo.saldo : null;
}

// Jogo de pedra, papel e tesoura (rotas de server/bridge.mjs); o servidor decide tudo, inclusive a jogada do agente.
export const desafiarAgente = (agente: string, aposta: number) => chamar('/api/jogos/desafio', { agente, aposta });
export const jogarGesto = (id: string, gesto: string, rodada: number) => chamar(`/api/jogos/${encodeURIComponent(id)}/jogada`, { gesto, rodada });
export const lerPartida = (id: string) => ler(`/api/jogos/${encodeURIComponent(id)}`);
