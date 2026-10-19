// Mudar a sala de casa de um agente do Escritório arrastando a linha dele na barra lateral até outra sala.
// Usa PUT /api/build/agents/<id>/room (grava `room` em data/agents.json). Nenhuma pasta é movida e nenhuma tarefa é interrompida:
// a sala de casa só vale quando o agente está livre; durante uma tarefa ou reunião ele continua onde está até acabar.
import type { AgentInfo, Notice, RoomInfo } from '../../../shared/types';
import type { Fetcher, MoveResult } from './accountdrop';
import type { UiContext } from './context';

const OFFICE_PREFIX = 'escritorio:';

export type RoomVerdict = { kind: 'move' } | { kind: 'same' } | { kind: 'blocked'; reason: string };

/** Decide o que fazer ao soltar `agent` sobre a sala `target` (undefined = a sala não existe mais). */
export function judgeRoomDrop(agent: Pick<AgentInfo, 'id' | 'roomId'> | undefined, target: Pick<RoomInfo, 'id' | 'name' | 'floor'> | undefined): RoomVerdict {
  if (!agent) return { kind: 'blocked', reason: 'Agente não encontrado.' };
  if (!agent.id.startsWith(OFFICE_PREFIX)) return { kind: 'blocked', reason: blockedCliReason };
  if (!target) return { kind: 'blocked', reason: 'A sala de destino não existe mais.' };
  if (target.floor === 2) return { kind: 'blocked', reason: 'Salas [CLI] são as pastas dos terminais: só agentes do escritório mudam entre as salas do escritório.' };
  if (agent.roomId === target.id) return { kind: 'same' };
  return { kind: 'move' };
}

export const blockedCliReason = 'Agentes [CLI] ficam na sala da pasta do terminal deles: não dá para mudar a sala por aqui.';

export async function saveRoom(agentId: string, roomId: string, fetcher: Fetcher = fetch): Promise<MoveResult> {
  try {
    const res = await fetcher(`/api/build/agents/${encodeURIComponent(agentId.slice(OFFICE_PREFIX.length))}/room`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomId }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? `erro ${res.status}` };
  } catch {
    return { ok: false, error: 'Não consegui falar com o servidor do escritório.' };
  }
}

export interface RoomOutcome {
  level: Notice['level'];
  text: string;
}

/** Fluxo da soltura sem DOM: confere, grava e devolve o aviso (null = nada a fazer, sem requisição). */
export async function dropAgentOnRoom(
  agent: Pick<AgentInfo, 'id' | 'roomId' | 'name'> | undefined,
  target: Pick<RoomInfo, 'id' | 'name' | 'floor'> | undefined,
  fetcher: Fetcher = fetch,
): Promise<RoomOutcome | null> {
  const verdict = judgeRoomDrop(agent, target);
  if (verdict.kind === 'same') return null;
  if (verdict.kind === 'blocked') return { level: 'warn', text: verdict.reason };
  const saved = await saveRoom(agent!.id, target!.id, fetcher);
  if (!saved.ok) return { level: 'warn', text: `Não consegui mover o agente: ${saved.error}. Ele continua na sala de antes.` };
  return { level: 'success', text: `${agent!.name} movido para ${target!.name}` };
}

/**
 * Liga o arrastar-e-soltar: origem `.ui-node__head[data-id]`, destino qualquer parte de uma `.ui-room[data-key]`.
 * Soltar na própria sala não é tratado aqui (fica com o reordenar de agentes) e arrastar sala ou conta não passa por aqui.
 */
export function attachRoomDrop(root: HTMLElement, ctx: UiContext, notify: (n: Notice) => void): void {
  let dragId: string | null = null;
  /** Motivo da última sala recusada sob o ponteiro (mostrado se o arrasto terminar ali). */
  let lastBlocked = '';
  const sectionOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('.ui-room[data-key]') : null);
  const clear = () => {
    root.classList.remove('is-room-dragging');
    for (const el of root.querySelectorAll('.ui-room.is-room-target, .ui-room.is-room-blocked')) el.classList.remove('is-room-target', 'is-room-blocked');
  };
  const warn = (text: string) => notify({ id: `room-drop-${Date.now()}`, level: 'warn', text, at: ctx.now() });
  /** A sala (do snapshot) sob o ponteiro, se for diferente da casa do agente arrastado. */
  const targetOf = (e: Event) => {
    const sec = sectionOf(e.target);
    const agent = dragId ? ctx.agent(dragId) : undefined;
    if (!sec || !agent || sec.dataset.key === agent.roomId) return null;
    return { sec, agent, room: ctx.store.snapshot?.rooms.find((r) => r.id === sec.dataset.key) };
  };

  root.addEventListener('dragstart', (e) => {
    const head = e.target instanceof Element ? e.target.closest<HTMLElement>('.ui-node__head[data-id]') : null;
    dragId = head?.dataset.id ?? null;
    lastBlocked = '';
    if (dragId) root.classList.add('is-room-dragging');
  });
  root.addEventListener('dragend', (e) => {
    const id = dragId;
    dragId = null;
    clear();
    // dropEffect 'none': soltou onde nada aceita (fora de sala e de conta, ou cancelou). Nada mudou: o agente fica onde estava.
    if (id && e.dataTransfer?.dropEffect === 'none') {
      warn(lastBlocked || (id.startsWith(OFFICE_PREFIX) ? 'Nada mudou: solte o agente sobre uma sala (muda a sala) ou sobre uma conta (muda a conta).' : blockedCliReason));
    }
  });
  root.addEventListener('dragover', (e) => {
    const t = targetOf(e);
    if (!t) return;
    e.preventDefault();
    const verdict = judgeRoomDrop(t.agent, t.room);
    const ok = verdict.kind === 'move';
    lastBlocked = verdict.kind === 'blocked' ? verdict.reason : '';
    if (e.dataTransfer) e.dataTransfer.dropEffect = ok ? 'move' : 'none';
    for (const el of root.querySelectorAll('.ui-room.is-room-target, .ui-room.is-room-blocked')) if (el !== t.sec) el.classList.remove('is-room-target', 'is-room-blocked');
    t.sec.classList.toggle('is-room-target', ok);
    t.sec.classList.toggle('is-room-blocked', !ok);
  });
  root.addEventListener('drop', (e) => {
    const t = targetOf(e);
    clear();
    if (!t) return;
    e.preventDefault();
    const { agent, room } = t;
    void dropAgentOnRoom(agent, room).then((out) => {
      if (!out) return;
      notify({ id: `room-drop-${Date.now()}`, level: out.level, text: out.text, at: ctx.now() });
    });
  });
}
