// O que cada agente está fazendo agora (em memória): o mapa usa isto para sentar, andar e falar.
const now = new Map(); // agentId -> { kind: 'chat' | 'task' | 'meeting', text, room?, since, speaking? }

export const begin = (agentId, info) => now.set(agentId, { ...info, since: Date.now() });
export const end = (agentId) => now.delete(agentId);
export const patch = (agentId, extra) => {
  const c = now.get(agentId);
  if (c) now.set(agentId, { ...c, ...extra });
};
export const current = (agentId) => now.get(agentId);
export const all = () => new Map(now);
