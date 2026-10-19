import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { cleanHours, describeHours, inService } from './hours.mjs';

/** Data local (o horário é o do servidor): 2026-10-19 é segunda-feira. */
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 18 + day, h, m); // day 0 = domingo 18/10

const WORK = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };

describe('horário de trabalho', () => {
  it('sem horário: sempre em serviço', () => {
    expect(inService(null, at(0, 3))).toBe(true);
    expect(cleanHours(undefined)).toEqual({ ok: true, hours: null });
    expect(cleanHours({ start: '', end: '', days: [] })).toEqual({ ok: true, hours: null });
  });
  it('dentro e fora do expediente, nos dias marcados', () => {
    expect(inService(WORK, at(1, 9, 0))).toBe(true);
    expect(inService(WORK, at(1, 17, 59))).toBe(true);
    expect(inService(WORK, at(1, 18, 0))).toBe(false); // o fim não conta
    expect(inService(WORK, at(1, 8, 59))).toBe(false);
  });
  it('dia que não está marcado fica fora o dia todo', () => {
    expect(inService(WORK, at(0, 12))).toBe(false); // domingo
    expect(inService(WORK, at(6, 12))).toBe(false); // sábado
  });
  it('turno da noite passa da meia-noite: o dia marcado é o do início', () => {
    const night = { start: '22:00', end: '06:00', days: [1] }; // segunda à noite
    expect(inService(night, at(1, 23))).toBe(true);
    expect(inService(night, at(2, 2))).toBe(true); // terça de madrugada ainda é o turno de segunda
    expect(inService(night, at(2, 7))).toBe(false);
    expect(inService(night, at(2, 23))).toBe(false); // terça à noite não foi marcada
    expect(inService(night, at(1, 2))).toBe(false); // segunda de madrugada é turno de domingo
  });
  it('valida o formato e normaliza', () => {
    expect(cleanHours({ start: '9:00', end: '18:00' }).ok).toBe(false);
    expect(cleanHours({ start: '09:00', end: '09:00' }).ok).toBe(false);
    expect(cleanHours({ start: '09:00', end: '25:00' }).ok).toBe(false);
    expect(cleanHours({ start: '09:00', end: '18:00', days: [] }).ok).toBe(false);
    expect(cleanHours('x').ok).toBe(false);
    expect(cleanHours({ start: '09:00', end: '18:00', days: [5, 1, 1, 9, 'a'] })).toEqual({ ok: true, hours: { start: '09:00', end: '18:00', days: [1, 5] } });
    expect(cleanHours({ start: '09:00', end: '18:00' })).toEqual({ ok: true, hours: { start: '09:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6] } });
  });
  it('texto da interface', () => {
    expect(describeHours(null)).toContain('sem horário · sempre em serviço');
    expect(describeHours(WORK)).toContain('09:00 às 18:00');
    expect(describeHours(WORK)).toContain('· S T Q Q S ·');
  });
});
