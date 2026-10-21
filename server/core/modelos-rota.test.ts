import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { trocarModelo } from './modelos.mjs';

const dono = { nome: 'João', papel: 'dono' };
const equipe = { nome: 'Ana', papel: 'equipe' };

function fakes(model = 'sonnet', account = 'principal') {
  const a: any = { id: 'x', model, account };
  const getAgent = (id: string) => (id === 'x' ? { ...a } : undefined);
  const updateAgent = vi.fn((_id: string, patch: any) => { Object.assign(a, patch); return { ok: true, agent: { ...a } }; });
  return { getAgent, updateAgent };
}

describe('trocarModelo', () => {
  it('dono e equipe com nome sobem de sonnet para opus', () => {
    for (const pessoa of [dono, equipe]) {
      const f = fakes();
      const r = trocarModelo({ pessoa, id: 'x', direcao: 'subir', de: 'sonnet', ...f });
      expect(r).toMatchObject({ ok: true, status: 200, de: 'sonnet', para: 'opus' });
      expect(f.updateAgent).toHaveBeenCalledWith('x', { model: 'opus' });
    }
  });
  it('sem nome ou papel agente: 403 e nada gravado', () => {
    for (const pessoa of [{ papel: 'equipe' }, { nome: 'Bot', papel: 'agente' }, undefined]) {
      const f = fakes();
      expect(trocarModelo({ pessoa, id: 'x', direcao: 'subir', de: 'sonnet', ...f }).status).toBe(403);
      expect(f.updateAgent).not.toHaveBeenCalled();
    }
  });
  it('de diferente do modelo atual: 409 sem gravar', () => {
    const f = fakes();
    expect(trocarModelo({ pessoa: dono, id: 'x', direcao: 'subir', de: 'haiku', ...f }).status).toBe(409);
    expect(f.updateAgent).not.toHaveBeenCalled();
  });
  it('updateAgent recusando devolve 400', () => {
    const f = fakes();
    f.updateAgent.mockReturnValueOnce({ ok: false, status: 400, errors: ['effort: inválido'] });
    expect(trocarModelo({ pessoa: dono, id: 'x', direcao: 'subir', de: 'sonnet', ...f })).toMatchObject({ ok: false, status: 400, error: 'effort: inválido' });
  });
  it('agente inexistente: 404', () => {
    expect(trocarModelo({ pessoa: dono, id: 'nada', direcao: 'subir', de: 'sonnet', ...fakes() }).status).toBe(404);
  });
  it('segunda chamada com o mesmo de: 409', () => {
    const f = fakes();
    expect(trocarModelo({ pessoa: dono, id: 'x', direcao: 'subir', de: 'sonnet', ...f }).ok).toBe(true);
    expect(trocarModelo({ pessoa: dono, id: 'x', direcao: 'subir', de: 'sonnet', ...f }).status).toBe(409);
  });
  it('topo da escada: 409', () => {
    expect(trocarModelo({ pessoa: dono, id: 'x', direcao: 'subir', de: 'fable', ...fakes('fable') }).status).toBe(409);
  });
  it('conta Codex com id fora da convenção usa a escada do Codex', () => {
    const f = fakes('gpt-5.2-codex', 'trabalho');
    const r = trocarModelo({ pessoa: dono, id: 'x', direcao: 'subir', de: 'gpt-5.2-codex', providerReal: () => 'codex', ...f });
    expect(r).toMatchObject({ ok: true, para: 'gpt-5.3-codex' });
  });
});
