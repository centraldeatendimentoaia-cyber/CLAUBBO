import { describe, expect, it } from 'vitest';
import { backupLabel, formatBytes } from './backup';

describe('backup: rótulos', () => {
  it('nome de pasta vira data e hora legíveis', () => {
    expect(backupLabel('2026-10-18_153012')).toBe('18/10/2026 15:30:12');
    expect(backupLabel('2026-10-18_153012-antes-de-restaurar')).toBe('18/10/2026 15:30:12');
    expect(backupLabel('qualquer')).toBe('qualquer');
  });
  it('tamanho em B, KB e MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
