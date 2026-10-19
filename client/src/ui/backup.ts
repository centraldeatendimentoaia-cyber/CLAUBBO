// Backup e restauração de data/ pela tela (GET/POST /api/backups, POST /api/backups/:nome/restore). Textos do servidor
// entram só como textContent. Restaurar pede um segundo clique e o servidor guarda antes o estado atual.
import { h } from './dom';

interface BackupInfo {
  name: string;
  bytes: number;
  auto: boolean;
}

/** "2026-10-18_153012" -> "18/10/2026 15:30:12". */
export function backupLabel(name: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(name);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : name;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export class BackupList {
  readonly el: HTMLElement;
  private open = false;
  private note = '';
  private confirming: string | null = null;

  constructor() {
    this.el = h('div', { class: 'cr-off cr-backup', hidden: true });
  }

  toggle(): void {
    this.open = !this.open;
    this.el.hidden = !this.open;
    this.confirming = null;
    if (this.open) void this.render();
  }

  private async call(path: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    try {
      const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
    } catch {
      return { ok: false, data: { error: 'não consegui falar com o servidor do escritório' } };
    }
  }

  private async render(): Promise<void> {
    const { data } = await this.call('/api/backups');
    const list = (Array.isArray(data.backups) ? data.backups : []) as BackupInfo[];
    this.el.replaceChildren(
      h('strong', { class: 'cr__title', text: 'Backup dos dados do escritório' }),
      h('p', { class: 'cr__text', text: 'Copia chats, agentes, tarefas e configurações para data/backups (nesta máquina). Restaurar guarda antes o estado atual e pede para reiniciar o servidor.' }),
      ...(this.note ? [h('p', { class: 'cr-log__stage', text: this.note })] : []),
      h('div', { class: 'cr__btns' }, h('button', { class: 'cr__ok', type: 'button', text: 'Fazer backup agora', on: { click: () => void this.make() } })),
      ...list.slice(0, 10).map((b) =>
        h('div', { class: 'cr__item' },
          h('p', { class: 'cr__head', text: `${backupLabel(b.name)}${b.auto ? ' (automático, antes de restaurar)' : ''} · ${formatBytes(b.bytes)}` }),
          h('div', { class: 'cr__btns' }, h('button', { class: 'cr__no', type: 'button', text: this.confirming === b.name ? 'Confirmar: restaurar este backup' : 'Restaurar', on: { click: () => void this.restore(b.name) } })),
        ),
      ),
    );
  }

  private async make(): Promise<void> {
    const r = await this.call('/api/backups', {});
    this.note = r.ok ? `Backup feito: ${backupLabel(String(r.data.name))}` : `Falhou: ${String(r.data.error ?? 'erro')}`;
    await this.render();
  }

  private async restore(name: string): Promise<void> {
    if (this.confirming !== name) {
      this.confirming = name;
      window.setTimeout(() => { if (this.confirming === name) { this.confirming = null; void this.render(); } }, 10_000);
      await this.render();
      return;
    }
    this.confirming = null;
    const r = await this.call(`/api/backups/${encodeURIComponent(name)}/restore`, { confirm: true });
    this.note = r.ok ? String(r.data.aviso ?? 'Restaurado.') : `Falhou: ${String(r.data.error ?? 'erro')}`;
    await this.render();
  }
}
