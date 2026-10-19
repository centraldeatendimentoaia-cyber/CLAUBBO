// Trocar a conta de um agente do Escritório arrastando a linha dele da barra lateral até um chip de conta do topo.
// A troca usa a mesma rota do botão Salvar de Operações > Agentes (PUT /api/ops/agents/<id>), só com o campo `account`.
import type { AgentInfo, Notice } from '../../../shared/types';
import type { UiContext } from './context';

/** Prefixo dos ids dos agentes do Escritório; os outros (terminais do Claubbo) não têm conta editável aqui. */
const OFFICE_PREFIX = 'escritorio:';

/** Conta como a rota GET /api/ops/state devolve (só o que a soltura precisa). */
export interface DropAccount {
  id: string;
  name: string;
  state?: string;
}

export type DropVerdict = { kind: 'move' } | { kind: 'same' } | { kind: 'blocked'; reason: string };

/** Decide o que fazer ao soltar `agent` sobre a conta `target` (undefined = a conta não existe mais). */
export function judgeDrop(agent: Pick<AgentInfo, 'id' | 'account'> | undefined, target: DropAccount | undefined, targetId: string): DropVerdict {
  if (!agent) return { kind: 'blocked', reason: 'Agente não encontrado.' };
  if (!agent.id.startsWith(OFFICE_PREFIX)) return { kind: 'blocked', reason: 'Este agente é de um terminal: a conta dele não muda por aqui.' };
  if (agent.account === targetId) return { kind: 'same' };
  if (!target) return { kind: 'blocked', reason: `A conta "${targetId}" não existe.` };
  if (target.state !== undefined && target.state !== 'connected') return { kind: 'blocked', reason: `A conta ${target.name} está sem login. Faça o login dela em Operações > Contas e tente de novo.` };
  return { kind: 'move' };
}

export type MoveResult = { ok: true } | { ok: false; error: string };
export type Fetcher = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/** Busca as contas com o estado de login atual (nada é guardado: o login pode mudar a qualquer hora). */
export async function loadAccounts(fetcher: Fetcher = fetch): Promise<DropAccount[] | null> {
  try {
    const res = await fetcher('/api/ops/state');
    if (!res.ok) return null;
    const data = (await res.json()) as { accounts?: DropAccount[] };
    return Array.isArray(data.accounts) ? data.accounts : null;
  } catch {
    return null;
  }
}

/** Grava a nova conta do agente (o id do Escritório vem sem o prefixo na rota). */
export async function saveAccount(agentId: string, accountId: string, fetcher: Fetcher = fetch): Promise<MoveResult> {
  try {
    const res = await fetcher(`/api/ops/agents/${encodeURIComponent(agentId.slice(OFFICE_PREFIX.length))}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: accountId }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
    return { ok: false, error: data.error ?? data.errors?.join('; ') ?? `erro ${res.status}` };
  } catch {
    return { ok: false, error: 'Não consegui falar com o servidor do escritório.' };
  }
}

export interface DropOutcome {
  level: Notice['level'];
  text: string;
  /** Houve troca gravada: a linha deve mostrar a conta nova. */
  moved: boolean;
}

/** Fluxo completo da soltura, sem DOM: confere, grava e devolve o aviso a mostrar (null = nada a fazer, sem requisição). */
export async function dropAgentOnAccount(
  agent: Pick<AgentInfo, 'id' | 'account'> | undefined,
  targetId: string,
  fetcher: Fetcher = fetch,
): Promise<DropOutcome | null> {
  if (agent && agent.account === targetId) return null;
  const accounts = await loadAccounts(fetcher);
  if (!accounts) return { level: 'warn', text: 'Não consegui conferir as contas. Nada foi alterado.', moved: false };
  const target = accounts.find((a) => a.id === targetId);
  const verdict = judgeDrop(agent, target, targetId);
  if (verdict.kind === 'same') return null;
  if (verdict.kind === 'blocked') return { level: 'warn', text: verdict.reason, moved: false };
  const saved = await saveAccount(agent!.id, targetId, fetcher);
  if (!saved.ok) return { level: 'warn', text: `Não consegui mover o agente: ${saved.error}`, moved: false };
  return { level: 'success', text: `Agente movido para ${target!.name}`, moved: true };
}

/**
 * Liga o arrastar-e-soltar na barra: linhas `.ui-node__head[data-id]` (origem) e chips `.ui-acc-filter[data-acc]` (destino).
 * Usa delegação no `root`, então não interfere nos arrastos que já existem (reordenar agentes e salas).
 */
export function attachAccountDrop(root: HTMLElement, ctx: UiContext, notify: (n: Notice) => void): void {
  let dragId: string | null = null;
  const chipOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('.ui-acc-filter[data-acc]') : null);
  const clear = () => {
    root.classList.remove('is-acc-dragging');
    for (const el of root.querySelectorAll('.ui-acc-filter.is-drop-target')) el.classList.remove('is-drop-target');
  };

  root.addEventListener('dragstart', (e) => {
    const head = e.target instanceof Element ? e.target.closest<HTMLElement>('.ui-node__head[data-id]') : null;
    dragId = head?.dataset.id ?? null;
    if (dragId) root.classList.add('is-acc-dragging');
  });
  root.addEventListener('dragend', () => {
    dragId = null;
    clear();
  });
  root.addEventListener('dragover', (e) => {
    const chip = chipOf(e.target);
    if (!dragId || !chip) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    for (const el of root.querySelectorAll('.ui-acc-filter.is-drop-target')) if (el !== chip) el.classList.remove('is-drop-target');
    chip.classList.add('is-drop-target');
  });
  root.addEventListener('dragleave', (e) => chipOf(e.target)?.classList.remove('is-drop-target'));
  root.addEventListener('drop', (e) => {
    const chip = chipOf(e.target);
    const id = dragId;
    clear();
    dragId = null;
    if (!id || !chip?.dataset.acc) return;
    e.preventDefault();
    const accountId = chip.dataset.acc;
    const agent = ctx.agent(id);
    void dropAgentOnAccount(agent, accountId).then((out) => {
      if (!out) return;
      if (out.moved && agent) {
        agent.account = accountId; // o snapshot do servidor confirma em seguida
        ctx.invalidate();
      }
      notify({ id: `account-drop-${Date.now()}`, level: out.level, text: out.text, at: ctx.now() });
    });
  });
}
