import { describe, expect, it } from 'vitest';
import { CATEGORIA_DE, type Categoria } from '../world/objetos';
import { dicaDoObjeto, ehJogo, menuDoObjeto, textoDoRelogio, usoDe } from './objetos-model';

const categorias = [...new Set(Object.values(CATEGORIA_DE))] as Categoria[];

describe('objetos-model', () => {
  it('toda categoria tem verbo, título e (fora jogos e relógio) um texto', () => {
    for (const c of categorias) {
      const u = usoDe(c);
      expect(u.verbo, c).not.toBe('');
      expect(u.titulo, c).not.toBe('');
      if (!ehJogo(c) && c !== 'relogio') expect(u.texto, c).not.toBe('');
    }
  });

  it('a dica começa com "E · "', () => {
    expect(dicaDoObjeto('cafe')).toBe('E · Tomar um café');
  });

  it('jogo: um item por agente ocioso, atalhos 1..n, no máximo 9; sem ninguém, lista vazia', () => {
    const ociosos = Array.from({ length: 11 }, (_, i) => ({ id: `escritorio:a${i}`, name: `A${i}` }));
    const m = menuDoObjeto('fliperama', ociosos);
    expect(m).toHaveLength(9);
    expect(m[0]).toMatchObject({ acao: 'jogar', atalho: '1', agenteId: 'escritorio:a0', habilitado: true });
    expect(menuDoObjeto('pingpong', [])).toEqual([]);
  });

  it('móvel comum: um único item "usar"', () => {
    expect(menuDoObjeto('sentar', [{ id: 'escritorio:x', name: 'X' }])).toEqual([{ acao: 'usar', rotulo: 'Sentar um instante', atalho: '1', habilitado: true }]);
  });

  it('relógio mostra a hora', () => {
    expect(textoDoRelogio(new Date(2026, 9, 22, 14, 5))).toMatch(/(14:05|02:05)/);
  });
});
