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

/**
 * Troca o modelo de um agente um degrau acima ou abaixo. Toda a lógica fica aqui; a rota só audita.
 * Síncrona de ponta a ponta: conferir `de` e gravar acontecem na mesma passada, então dois cliques com o mesmo `de` não passam os dois.
 * `providerReal(agent)` devolve o provider da conta (account.provider) para contas Codex com id fora da convenção.
 */
export function trocarModelo({ pessoa, id, direcao, de, getAgent, updateAgent, providerReal = () => undefined }) {
  if (!pessoa?.nome || (pessoa.papel !== 'dono' && pessoa.papel !== 'equipe')) return { ok: false, status: 403, error: 'sem permissão para trocar o modelo' };
  if (direcao !== 'subir' && direcao !== 'descer') return { ok: false, status: 400, error: 'direção inválida' };
  const agent = getAgent(id);
  if (!agent) return { ok: false, status: 404, error: 'agente não encontrado' };
  if (agent.model !== de) return { ok: false, status: 409, error: `o modelo atual é "${agent.model ?? ''}", não "${de ?? ''}"` };
  const provider = providerReal(agent);
  const r = proximo(provider ? { ...agent, provider } : agent, direcao);
  if (!r.ok) return r;
  const u = updateAgent(id, { model: r.para });
  if (!u.ok) return { ok: false, status: u.status ?? 400, error: (u.errors ?? ['não foi possível gravar']).join('; ') };
  return { ok: true, status: 200, de: r.de, para: r.para, agent: u.agent };
}
