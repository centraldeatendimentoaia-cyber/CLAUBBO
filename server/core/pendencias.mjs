// Lista unificada do que espera o dono e classificação de risco de cada item.
const URGENTE_MS = 4 * 3600e3;
const MAX_DECISOES = 200;

// Tabela de risco por tipo (e etapa, para tarefa). Tipo desconhecido cai em DESCONHECIDO: nunca seguro.
const BASE = { cost: false, reversible: true, sendsMessage: false, ownerOnly: false, needsDialog: false };
const RISCO = {
  'tarefa:plan': { ...BASE },
  'tarefa:implement': { ...BASE, reversible: false, ownerOnly: true, needsDialog: true },
  'tarefa:test': { ...BASE, reversible: false, ownerOnly: true, needsDialog: true },
  terminal: { ...BASE, reversible: false, sendsMessage: true, ownerOnly: true, needsDialog: true },
  proposta: { ...BASE, ownerOnly: true, needsDialog: true },
  'proposta:criar': { ...BASE, ownerOnly: true, needsDialog: true },
  'proposta:excluir': { ...BASE, reversible: false, ownerOnly: true, needsDialog: true }, // excluir agente é permanente
  chamada: { ...BASE, cost: true },
};
const DESCONHECIDO = { ...BASE, reversible: false, ownerOnly: true, needsDialog: true };

export function classify(kind, stage) {
  const key = kind === 'tarefa' ? `tarefa:${stage}` : kind === 'proposta' && stage ? `proposta:${stage}` : kind;
  const r = Object.hasOwn(RISCO, key) ? RISCO[key] : DESCONHECIDO;
  const safe = !r.cost && r.reversible && !r.sendsMessage && !r.ownerOnly && !r.needsDialog;
  return { ...r, safe };
}

// Texto vindo de agente nunca é confiável: sempre cortado.
const cut = (s, n) => String(s ?? '').slice(0, n);

export function buildPending({ tasks = [], cliRequests = [], proposals = [], calls = [] }, now = Date.now()) {
  const out = [];
  const add = (kind, ref, stage, agent, title, text, since) =>
    out.push({ id: `${kind}:${ref}`, kind, ref, ...(stage ? { stage } : {}), agent: cut(agent, 80), title: cut(title, 80), text: cut(text, 300), since, urgent: now - since > URGENTE_MS, ...classify(kind, stage) });
  for (const t of tasks) {
    if (t.state === 'waiting' && t.dev?.awaiting) add('tarefa', t.id, t.dev.stage, t.agent, t.title || t.text, t.text, t.updatedAt ?? t.addedAt ?? now);
  }
  for (const r of cliRequests) {
    if (r.state === 'pending') add('terminal', r.id, undefined, `${r.from ?? '?'} (relatado pelo agente)`, `Terminal ${r.agentName ?? ''}: pedido de ${r.from ?? '?'}`, r.text, r.at ?? now);
  }
  for (const p of proposals) {
    if (p.state !== 'pending') continue;
    const nome = p.delete ? p.name : p.agent?.name;
    add('proposta', p.id, p.delete ? 'excluir' : 'criar', `${p.from ?? '?'} (relatado pelo agente)`, p.delete ? `Excluir agente ${nome ?? ''}` : `Criar agente ${nome ?? ''}`, (p.delete ? p.role : p.agent?.does) ?? '', p.at ?? now);
  }
  for (const c of calls) {
    if (c.state === 'pending') add('chamada', c.id, undefined, c.fromName, `${c.fromName ?? ''} → ${c.toName ?? ''}`, c.text, c.at ?? now);
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.since - b.since);
}

const decisoes = new Map();
export function rememberDecision(pid, nome, now = Date.now()) {
  decisoes.delete(pid);
  decisoes.set(pid, { nome, at: now });
  if (decisoes.size > MAX_DECISOES) decisoes.delete(decisoes.keys().next().value);
}
export const decisionOf = (pid) => decisoes.get(pid);
