// Escada de modelos dos agentes: do mais fraco ao mais forte. Funções puras, sem I/O.
// Os ids do Codex são os aceitos hoje pelo `-m` do Codex CLI; confira a lista ao subir de versão.
export const ESCADAS = {
  claude: ['haiku', 'sonnet', 'opus', 'fable'],
  codex: ['gpt-5.1-codex-mini', 'gpt-5.2-codex', 'gpt-5.3-codex'],
};

// O runner escolhe o runner pela conta (account.provider); contas do Codex têm id `codex` ou `codex-*`.
// Aqui, sem ler contas do disco, usamos agent.provider quando existe e, senão, o id da conta.
export function providerDe(agent) {
  if (agent?.provider === 'codex' || agent?.provider === 'claude') return agent.provider;
  return /^codex(-|$)/.test(agent?.account ?? '') ? 'codex' : 'claude';
}

export function degrau(agent) {
  const escada = ESCADAS[providerDe(agent)];
  const indice = escada.indexOf(agent?.model);
  if (indice < 0) return null;
  return { escada, indice, topo: indice === escada.length - 1, base: indice === 0 };
}

export function proximo(agent, direcao) {
  const d = degrau(agent);
  if (!d) return { ok: false, status: 409, error: `o modelo "${agent?.model ?? ''}" está fora da escada` };
  const alvo = d.indice + (direcao === 'subir' ? 1 : -1);
  if (alvo < 0 || alvo >= d.escada.length) {
    return { ok: false, status: 409, error: `o modelo "${agent.model}" já está no ${direcao === 'subir' ? 'topo' : 'início'} da escada` };
  }
  return { ok: true, de: agent.model, para: d.escada[alvo] };
}
