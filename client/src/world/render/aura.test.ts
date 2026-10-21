// Aura por modelo: mapeamento modelo -> nível e desenho em canvas 2D (com contexto falso).
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { ESCADAS } from '../../../../server/core/modelos.mjs';
import { auraDe, desenharAura, ESCADAS_AURA, tremorDe } from './aura';

/** Contexto falso: registra o nome de cada método chamado; propriedades de estilo são só atribuídas. */
function ctxFalso() {
  const chamadas: string[] = [];
  const grad = { addColorStop: () => undefined };
  const base: Record<string, unknown> = {};
  const ctx = new Proxy(base, {
    get(alvo, nome: string) {
      if (nome in alvo) return alvo[nome];
      return (..._args: unknown[]) => {
        chamadas.push(nome);
        return nome.startsWith('create') ? grad : undefined;
      };
    },
    set(alvo, nome: string, valor) {
      alvo[nome] = valor;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, chamadas };
}
const n = (c: string[], nome: string) => c.filter((x) => x === nome).length;

describe('auraDe', () => {
  it('mapeia os quatro modelos do Claude nos níveis combinados', () => {
    expect(auraDe('haiku')).toMatchObject({ nivel: 'singela', cor: '#3ad3d0', camadas: 1, brasas: 0, raios: 0, ondas: 0 });
    expect(auraDe('sonnet')).toMatchObject({ nivel: 'singela', cor: '#7cff6b', camadas: 1, brasas: 0, raios: 0, ondas: 0 });
    expect(auraDe('opus')).toMatchObject({ nivel: 'intermediaria', cor: '#ff4fa3', camadas: 2, brasas: 0, raios: 0, ondas: 0, treme: false });
    expect(auraDe('fable')).toMatchObject({ nivel: 'chama', cor: '#ffd23f', camadas: 4, brasas: 18, raios: 5, ondas: 2, treme: true });
  });

  it('sem modelo ou modelo desconhecido: sem aura', () => {
    expect(auraDe(undefined)).toBeNull();
    expect(auraDe('')).toBeNull();
    expect(auraDe('xyz')).toBeNull();
  });

  it('só o fable treme e tem raios; o rótulo é o nome do modelo', () => {
    for (const m of ['haiku', 'sonnet', 'opus', 'fable']) {
      const a = auraDe(m)!;
      expect(a.rotulo).toBe(m);
      expect(a.treme).toBe(m === 'fable');
      expect(a.raios > 0).toBe(m === 'fable');
    }
  });

  it('a forma distingue o fable dos demais (não só a cor)', () => {
    const f = auraDe('fable')!;
    for (const m of ['haiku', 'sonnet', 'opus']) {
      const a = auraDe(m)!;
      expect(f.camadas).toBeGreaterThan(a.camadas);
      expect(f.brasas).toBeGreaterThan(a.brasas);
      expect(f.raios).toBeGreaterThan(a.raios);
    }
  });

  it('Codex segue a posição na escada: base singela, os dois de cima intermediária e chama', () => {
    const [base, meio, topo] = ESCADAS.codex as string[];
    expect(auraDe(base, 'codex')?.nivel).toBe('singela');
    expect(auraDe(meio, 'codex')?.nivel).toBe('intermediaria');
    expect(auraDe(topo, 'codex')?.nivel).toBe('chama');
    expect(auraDe(topo, 'codex')?.rotulo).toBe(topo);
    // modelo do Claude não vale para o Codex e vice-versa
    expect(auraDe('fable', 'codex')).toBeNull();
    expect(auraDe(topo)).toBeNull();
  });

  it('a cópia da escada no cliente é igual à do servidor', () => {
    expect(ESCADAS_AURA).toEqual(ESCADAS);
  });
});

describe('desenharAura', () => {
  const opcoes = { escala: 0.17, semente: 1234 };

  it('com movimento reduzido não desenha raios nem brasas, nem treme', () => {
    const a = auraDe('fable')!;
    const { ctx, chamadas } = ctxFalso();
    desenharAura(ctx, a, 100, 100, 5000, { ...opcoes, reduzirMovimento: true });
    expect(n(chamadas, 'stroke')).toBe(a.ondas); // só as ondas, paradas; nenhum raio
    expect(n(chamadas, 'fillRect')).toBe(0);
    expect(tremorDe(a, 5000, 1234, true)).toEqual({ dx: 0, dy: 0 });
  });

  it('com movimento desenha os raios visíveis e as brasas', () => {
    const a = auraDe('fable')!;
    let raios = 0;
    let brasas = 0;
    for (let t = 0; t < 4000; t += 70) {
      const { ctx, chamadas } = ctxFalso();
      desenharAura(ctx, a, 100, 100, t, { ...opcoes, reduzirMovimento: false });
      raios += n(chamadas, 'stroke') - a.ondas;
      brasas += n(chamadas, 'fillRect');
    }
    expect(raios).toBeGreaterThan(0);
    expect(brasas).toBeGreaterThan(0);
  });

  it('auras singela e intermediária não desenham brasas, raios nem ondas', () => {
    for (const m of ['haiku', 'sonnet', 'opus']) {
      const { ctx, chamadas } = ctxFalso();
      desenharAura(ctx, auraDe(m)!, 50, 50, 1234, { ...opcoes, reduzirMovimento: false });
      expect(n(chamadas, 'fillRect')).toBe(0);
      expect(n(chamadas, 'stroke')).toBe(0);
      expect(n(chamadas, 'fill')).toBeGreaterThan(0);
    }
  });

  it('é determinística: mesmos now e semente, mesmas chamadas', () => {
    const a = auraDe('fable')!;
    const r1 = ctxFalso();
    const r2 = ctxFalso();
    desenharAura(r1.ctx, a, 10, 10, 777, { ...opcoes, reduzirMovimento: false });
    desenharAura(r2.ctx, a, 10, 10, 777, { ...opcoes, reduzirMovimento: false });
    expect(r1.chamadas).toEqual(r2.chamadas);
  });

  it('só o nível chama treme', () => {
    let moveu = false;
    for (let t = 0; t < 400; t += 30) if (tremorDe(auraDe('fable')!, t, 1, false).dx !== 0) moveu = true;
    expect(moveu).toBe(true);
    expect(tremorDe(auraDe('opus')!, 30, 1, false)).toEqual({ dx: 0, dy: 0 });
  });
});
