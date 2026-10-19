import { describe, expect, it } from 'vitest';
import type { AccountInfo } from '../../../shared/types';
import { QuotaAlerts, quotaLevel, quotaOf } from './quota';

const NOW = 1_000_000;
const acc = (id: string, usage: AccountInfo['usage'], over: Partial<AccountInfo> = {}): AccountInfo => ({ id, short: id[0].toUpperCase(), name: `Conta ${id}`, color: '#fff', configDir: '', sessions: 0, usageStatus: 'ok', usage, ...over });
const use = (five?: number, week?: number, resetsAt = NOW + 60_000): AccountInfo['usage'] => ({ source: 'statusline', fetchedAt: 0, ...(five !== undefined ? { fiveHour: { utilization: five, resetsAt } } : {}), ...(week !== undefined ? { sevenDay: { utilization: week, resetsAt } } : {}) });

describe('cota por agente', () => {
  it('níveis: até 80 normal, acima de 80 alerta, acima de 90 alto', () => {
    expect([0, 80, 81, 90, 91, 100].map(quotaLevel)).toEqual(['ok', 'ok', 'warn', 'warn', 'high', 'high']);
  });

  it('resume as duas janelas, o pior nível e o texto', () => {
    const q = quotaOf(acc('a', use(37, 85)), NOW)!;
    expect(q.text).toBe('5h 37% · semana 85%');
    expect(q.level).toBe('warn');
    expect(q.windows.map((w) => w.level)).toEqual(['ok', 'warn']);
  });

  it('sem números: conta sem uso, desativada, sem cota ou janela vencida → null; janela vencida sai, a outra fica', () => {
    expect(quotaOf(undefined, NOW)).toBeNull();
    expect(quotaOf(acc('a', undefined), NOW)).toBeNull();
    expect(quotaOf(acc('a', use(10, 10), { usageStatus: 'disabled' }), NOW)).toBeNull();
    expect(quotaOf(acc('a', { ...use(10, 10)!, noQuota: true }), NOW)).toBeNull();
    expect(quotaOf(acc('a', use(95, 95, NOW - 1)), NOW)).toBeNull();
    const mixed = acc('a', { source: 'statusline', fetchedAt: 0, fiveHour: { utilization: 95, resetsAt: NOW - 1 }, sevenDay: { utilization: 20, resetsAt: NOW + 5 } });
    expect(quotaOf(mixed, NOW)!.text).toBe('semana 20%');
  });

  it('limita 0–100 e arredonda', () => {
    expect(quotaOf(acc('a', use(37.6, 140)), NOW)!.text).toBe('5h 38% · semana 100%');
  });
});

describe('aviso único acima de 90%', () => {
  it('a primeira consulta só memoriza; passar de 90 depois avisa uma vez só', () => {
    const t = new QuotaAlerts();
    expect(t.check([acc('a', use(50)), acc('b', use(95))], NOW)).toEqual([]); // b já estava acima ao abrir
    expect(t.check([acc('a', use(91)), acc('b', use(96))], NOW)).toHaveLength(1);
    expect(t.check([acc('a', use(93)), acc('b', use(97))], NOW)).toEqual([]);
  });

  it('exatamente 90 não avisa; janela que renova volta a avisar', () => {
    const t = new QuotaAlerts();
    t.check([acc('a', use(10, undefined, NOW + 100))], NOW);
    expect(t.check([acc('a', use(90, undefined, NOW + 100))], NOW)).toEqual([]);
    const [first] = t.check([acc('a', use(92, undefined, NOW + 100))], NOW);
    expect(first.accountId).toBe('a');
    expect(first.text).toBe('Conta a: 92% da cota de 5h usada');
    expect(t.check([acc('a', use(91, undefined, NOW + 9_000))], NOW + 200)).toHaveLength(1); // nova janela
  });

  it('semanal e 5h avisam separados', () => {
    const t = new QuotaAlerts();
    t.check([acc('a', use(10, 10))], NOW);
    expect(t.check([acc('a', use(95, 95))], NOW)).toHaveLength(2);
  });
});
