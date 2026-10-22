// Testes dos distintivos: faixas de nível, conquistas e o desenho (formas distintas, sem cor como única pista).
import { describe, expect, it } from 'vitest';
import { BADGE_SIZE, TIER_FROM, achievementsOf, badgeKey, levelTier, renderBadge, tierLabel, type AchievementId } from './badges';

const IDS: AchievementId[] = ['primeiro_brilho', 'em_ascensao', 'veterano', 'lenda', 'dia_limpo'];

/** Máscara de opacidade de um buffer: uma string por linha. */
const mask = (spec: Parameters<typeof renderBadge>[0]): string => {
  const b = renderBadge(spec);
  const rows: string[] = [];
  for (let y = 0; y < b.h; y++) {
    let r = '';
    for (let x = 0; x < b.w; x++) r += b.alpha(x, y) > 0 ? '#' : '.';
    rows.push(r);
  }
  return rows.join('\n');
};

describe('levelTier', () => {
  it('muda de faixa exatamente nos níveis de TIER_FROM', () => {
    TIER_FROM.forEach((n, i) => {
      expect(levelTier(n).tier).toBe(i + 1);
      if (i > 0) expect(levelTier(n - 1).tier).toBe(i);
    });
  });

  it('níveis inválidos ou menores que 1 caem na faixa 1; níveis altos ficam na última', () => {
    for (const n of [0, -4, NaN, Infinity * 0]) expect(levelTier(n).tier).toBe(1);
    expect(levelTier(99).tier).toBe(5);
  });

  it('cada faixa tem nome e forma próprios', () => {
    const tiers = [1, 3, 5, 8, 12].map(levelTier);
    expect(new Set(tiers.map((t) => t.name)).size).toBe(5);
    expect(new Set(tiers.map((t) => t.shape)).size).toBe(5);
  });

  it('o rótulo traz o nome da faixa e o nível em texto', () => {
    expect(tierLabel(5)).toBe('Cometa (nível 5)');
  });
});

describe('achievementsOf', () => {
  const earned = (i: Parameters<typeof achievementsOf>[0]) => achievementsOf(i).filter((a) => a.earned).map((a) => a.id);

  it('sem XP não há conquista', () => {
    expect(earned({ nivel: 1, xp: 0 })).toEqual([]);
  });

  it('ganha por XP e por nível, nos limites', () => {
    expect(earned({ nivel: 1, xp: 5 })).toEqual(['primeiro_brilho']);
    expect(earned({ nivel: 2, xp: 60 })).not.toContain('em_ascensao');
    expect(earned({ nivel: 3, xp: 200 })).toContain('em_ascensao');
    expect(earned({ nivel: 5, xp: 800 })).not.toContain('veterano');
    expect(earned({ nivel: 6, xp: 1250 })).toContain('veterano');
    expect(earned({ nivel: 9, xp: 3200 })).not.toContain('lenda');
    expect(earned({ nivel: 10, xp: 4050 })).toContain('lenda');
  });

  it('"Dia limpo" exige rotina que rodou e nenhuma que falhou', () => {
    const base = { nivel: 1, xp: 0 };
    expect(earned({ ...base })).not.toContain('dia_limpo');
    expect(earned({ ...base, rotinas: { rodaram: 0, falharam: 0 } })).not.toContain('dia_limpo');
    expect(earned({ ...base, rotinas: { rodaram: 3, falharam: 1 } })).not.toContain('dia_limpo');
    expect(earned({ ...base, rotinas: { rodaram: 3, falharam: 0 } })).toContain('dia_limpo');
  });

  it('cada conquista tem id único, nome e descrição', () => {
    const list = achievementsOf({ nivel: 1, xp: 0 });
    expect(list.map((a) => a.id)).toEqual(IDS);
    for (const a of list) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });
});

describe('renderBadge', () => {
  it('todos os distintivos são 16x16 e têm pixels', () => {
    const specs = [
      ...([1, 2, 3, 4, 5] as const).map((tier) => ({ kind: 'tier' as const, tier })),
      ...IDS.flatMap((id) => [true, false].map((earned) => ({ kind: 'achievement' as const, id, earned }))),
    ];
    for (const s of specs) {
      const b = renderBadge(s);
      expect([b.w, b.h]).toEqual([BADGE_SIZE, BADGE_SIZE]);
      expect(mask(s)).toContain('#');
    }
  });

  it('as 5 faixas têm silhuetas diferentes (não dependem só da cor)', () => {
    const masks = ([1, 2, 3, 4, 5] as const).map((tier) => mask({ kind: 'tier', tier }));
    expect(new Set(masks).size).toBe(5);
  });

  it('as medalhas têm símbolos diferentes e a por ganhar difere da ganha', () => {
    const colors = (id: AchievementId, earned: boolean) => [...renderBadge({ kind: 'achievement', id, earned }).data].join(',');
    expect(new Set(IDS.map((id) => colors(id, true))).size).toBe(5);
    for (const id of IDS) expect(colors(id, true)).not.toBe(colors(id, false));
  });

  it('a chave de cache separa faixa, conquista e estado', () => {
    expect(badgeKey({ kind: 'tier', tier: 2 })).not.toBe(badgeKey({ kind: 'tier', tier: 3 }));
    expect(badgeKey({ kind: 'achievement', id: 'lenda', earned: true })).not.toBe(badgeKey({ kind: 'achievement', id: 'lenda', earned: false }));
  });
});
