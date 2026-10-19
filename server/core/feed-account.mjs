// Conta de cada item do feed de atividades: a conta real do agente que gerou o evento (a mesma fonte do snapshot,
// data/agents). Evento sem agente, ou de agente que não existe mais, fica sem conta e a tela mostra "desconhecida":
// nunca "Principal" por padrão.
export function feedAccountOf(agents, agentId) {
  if (!agentId) return undefined;
  return agents.find((a) => a.id === agentId)?.account || undefined;
}
