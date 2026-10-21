import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { ESCADAS, degrau, proximo, providerDe } from './modelos.mjs';

describe('proximo (Claude)', () => {
  it('haiku sobe para sonnet', () => {
    expect(proximo({ model: 'haiku' }, 'subir')).toEqual({ ok: true, de: 'haiku', para: 'sonnet' });
  });
  it('sonnet desce para haiku', () => {
    expect(proximo({ model: 'sonnet' }, 'descer')).toEqual({ ok: true, de: 'sonnet', para: 'haiku' });
  });
  it('fable não sobe: 409', () => {
    expect(proximo({ model: 'fable' }, 'subir')).toMatchObject({ ok: false, status: 409 });
  });
  it('haiku não desce: 409', () => {
    expect(proximo({ model: 'haiku' }, 'descer')).toMatchObject({ ok: false, status: 409 });
  });
  it('modelo fora da escada: 409 citando "fora da escada"', () => {
    const r = proximo({ model: 'qualquer-coisa' }, 'subir');
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.error).toContain('fora da escada');
  });
});

describe('degrau', () => {
  it('modelo desconhecido dá null', () => {
    expect(degrau({ model: 'qualquer-coisa' })).toBeNull();
  });
  it('descreve a posição na escada', () => {
    expect(degrau({ model: 'haiku' })).toEqual({ escada: ESCADAS.claude, indice: 0, topo: false, base: true });
    expect(degrau({ model: 'fable' })).toMatchObject({ indice: 3, topo: true, base: false });
  });
});

describe('Codex', () => {
  const [fraco, medio] = ESCADAS.codex;
  it('provider vem do agente ou da conta', () => {
    expect(providerDe({ provider: 'codex', model: fraco })).toBe('codex');
    expect(providerDe({ account: 'codex-extra', model: fraco })).toBe('codex');
    expect(providerDe({ account: 'principal', model: 'haiku' })).toBe('claude');
    expect(providerDe({ model: 'haiku' })).toBe('claude');
  });
  it('sobe dentro da escada do Codex, nunca para o Claude', () => {
    const r = proximo({ provider: 'codex', model: fraco }, 'subir');
    expect(r).toEqual({ ok: true, de: fraco, para: medio });
    const topo = ESCADAS.codex[ESCADAS.codex.length - 1];
    expect(proximo({ provider: 'codex', model: topo }, 'subir')).toMatchObject({ ok: false, status: 409 });
    expect(ESCADAS.claude).not.toContain(r.para);
  });
  it('modelo do Claude num agente Codex fica fora da escada', () => {
    expect(degrau({ provider: 'codex', model: 'opus' })).toBeNull();
  });
});
