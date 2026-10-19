// Cota da conta de cada agente: quanto da janela de 5 horas e da semana já foi usado (AccountInfo.usage, dados que o
// servidor já manda). Aqui fica a lógica pura (níveis, texto, aviso único acima de 90%) e os dois pedaços de tela que a
// usam: a linha do agente (rows.ts) e a gaveta (drawer.ts).
import type { AccountInfo } from '../../../shared/types';
import { h, setAttr, setHidden, setText, setTitle } from './dom';
import { tr } from '../../../shared/i18n';

/** Acima disso a cor de alerta liga; acima de QUOTA_ALERT sai um aviso (uma vez por janela). */
export const QUOTA_WARN = 80;
export const QUOTA_ALERT = 90;

export type QuotaLevel = 'ok' | 'warn' | 'high';

export interface QuotaWindow {
  key: 'five' | 'week';
  /** Rótulo curto: "5h" ou "semana". */
  label: string;
  percent: number;
  level: QuotaLevel;
  resetsAt?: number;
}

export interface QuotaSummary {
  windows: QuotaWindow[];
  /** O pior nível entre as janelas. */
  level: QuotaLevel;
  /** "5h 37% · semana 12%". */
  text: string;
}

export function quotaLevel(percent: number): QuotaLevel {
  return percent > QUOTA_ALERT ? 'high' : percent > QUOTA_WARN ? 'warn' : 'ok';
}

const RANK: Record<QuotaLevel, number> = { ok: 0, warn: 1, high: 2 };

/** Janelas conhecidas da conta; sem números (conta sem uso lido, sem cota) ou janela já vencida ficam de fora. */
export function quotaOf(account: Pick<AccountInfo, 'usage' | 'usageStatus'> | undefined, now: number): QuotaSummary | null {
  const u = account?.usage;
  if (!u || account.usageStatus === 'disabled' || u.noQuota) return null;
  const windows: QuotaWindow[] = [];
  for (const [key, label, w] of [['five', tr('5h'), u.fiveHour], ['week', tr('semana'), u.sevenDay]] as const) {
    if (!w || typeof w.utilization !== 'number' || (w.resetsAt && w.resetsAt <= now)) continue;
    const percent = Math.round(Math.min(100, Math.max(0, w.utilization)));
    windows.push({ key, label, percent, level: quotaLevel(percent), resetsAt: w.resetsAt });
  }
  if (!windows.length) return null;
  const level = windows.reduce<QuotaLevel>((worst, w) => (RANK[w.level] > RANK[worst] ? w.level : worst), 'ok');
  return { windows, level, text: windows.map((w) => `${w.label} ${w.percent}%`).join(' · ') };
}

export interface QuotaAlert {
  accountId: string;
  text: string;
}

/**
 * Avisa uma vez quando uma janela da conta passa de 90%. A chave inclui o fim da janela: quando ela renova, volta a avisar.
 * A primeira consulta só memoriza o que já estava acima (abrir a página não dispara aviso velho).
 */
export class QuotaAlerts {
  private seen = new Set<string>();
  private primed = false;

  check(accounts: readonly AccountInfo[], now: number): QuotaAlert[] {
    const out: QuotaAlert[] = [];
    for (const a of accounts) {
      for (const w of quotaOf(a, now)?.windows ?? []) {
        if (w.level !== 'high') continue;
        const key = `${a.id}|${w.key}|${w.resetsAt ?? ''}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        if (this.primed) out.push({ accountId: a.id, text: tr('{0}: {1}% da cota de {2} usada', [a.name, w.percent, w.label]) });
      }
    }
    this.primed = true;
    return out;
  }
}

// ---------------------------------------------------------------- tela

/** Linha pequena "5h 37% · semana 12%" (escondida quando a conta não tem números). */
export function createQuota(cls: string): HTMLElement {
  return h('span', { class: `ui-quota ${cls}`, hidden: true });
}

export function updateQuota(el: HTMLElement, account: AccountInfo | undefined, now: number): void {
  const q = quotaOf(account, now);
  setHidden(el, !q);
  setText(el, q?.text ?? '');
  setAttr(el, 'data-level', q && q.level !== 'ok' ? q.level : null);
  setTitle(el, q ? q.windows.map((w) => tr('{0}: {1}% usado{2}', [w.label, w.percent, w.resetsAt ? tr(', renova {0}', [new Date(w.resetsAt).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })]) : ''])).join('\n') : '');
}
