// Pergunta avulsa "/btw": uma pergunta rápida a um agente, sem mexer na tarefa que ele estiver fazendo.
// Não importa o módulo de tarefas: o turno roda numa cópia do agente, sem ferramentas, sem projeto e sem sessão.
import { providerDe } from './modelos.mjs';

const MAX_PERGUNTA = 500;
const MAX_RESPOSTA = 1500;
const INTERVALO_MS = 20_000;
const TIMEOUT_MS = 90_000;

export function criarBtw({ runTurn, getAgent, agora = Date.now, systemFor = () => '', providerReal = () => undefined }) {
  const ultimo = new Map(); // agentId -> instante da última pergunta (em memória, some ao reiniciar)
  const emAndamento = new Set();

  return async function btw({ pessoa, agentId, pergunta }) {
    if (!pessoa?.nome || (pessoa.papel !== 'dono' && pessoa.papel !== 'equipe')) return { ok: false, status: 403, error: 'sem permissão para perguntar' };
    const agent = getAgent(agentId);
    if (!agent) return { ok: false, status: 404, error: 'agente não encontrado' };
    // Codex roda com shell somente leitura, que ainda lê arquivos do servidor: sem ferramentas só é garantido no Claude.
    if (providerDe(providerReal(agent) ? { ...agent, provider: providerReal(agent) } : agent) === 'codex') return { ok: false, status: 409, error: 'o /btw ainda não funciona com agentes Codex' };
    const texto = typeof pergunta === 'string' ? pergunta.trim() : '';
    if (!texto) return { ok: false, status: 400, error: 'pergunta vazia' };
    if (texto.length > MAX_PERGUNTA) return { ok: false, status: 400, error: `pergunta longa demais (máximo ${MAX_PERGUNTA} caracteres)` };
    if (emAndamento.has(agentId)) return { ok: false, status: 409, error: 'este agente já está respondendo uma pergunta avulsa' };
    if (agora() - (ultimo.get(agentId) ?? -Infinity) < INTERVALO_MS) return { ok: false, status: 429, error: 'espere alguns segundos antes de perguntar de novo' };
    ultimo.set(agentId, agora());
    emAndamento.add(agentId);
    try {
      const { dev, sessionId, ...resto } = agent;
      const r = await runTurn({
        agent: { ...resto, tools: [], skills: [] },
        system: `${systemFor(agent, texto)}\n\nPergunta rápida do dono no meio do seu trabalho: responda direto e curto (poucas frases), sem usar ferramentas.`,
        prompt: texto,
        timeoutMs: TIMEOUT_MS,
      });
      return { ok: true, status: 200, resposta: String(r?.text ?? '').slice(0, MAX_RESPOSTA) };
    } catch (e) {
      console.error('[btw]', agentId, e?.message);
      return { ok: false, status: 502, error: 'o agente não respondeu' };
    } finally {
      emAndamento.delete(agentId);
    }
  };
}
