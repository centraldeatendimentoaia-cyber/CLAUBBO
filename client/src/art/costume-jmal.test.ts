// Fantasia exclusiva JMAL: desenha algo próprio, é determinística e funciona em todas as direções, poses e tamanhos de avatar.
import { describe, expect, it } from 'vitest';
import { appearanceFromSeed } from './character/appearance';
import { CHAR_H, CHAR_W, POSE_FRAMES, renderCharacter } from './character/render';
import type { CharacterFrameRequest, Dir, Pose } from './api';

const DIRS: Dir[] = ['down', 'left', 'up', 'right'];
const POSES = Object.keys(POSE_FRAMES) as Pose[];
const app = appearanceFromSeed(12345);

const digest = (data: Uint8ClampedArray): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193);
  return String(h >>> 0);
};
const draw = (extra: Partial<CharacterFrameRequest> = {}) => renderCharacter({ appearance: app, dir: 'down', pose: 'stand', frame: 0, ...extra });
const countRgb = (data: Uint8ClampedArray, rgb: [number, number, number]) => {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200 && data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2]) n++;
  return n;
};
const GOLD: [number, number, number] = [0xf2, 0xc9, 0x4c];

describe('fantasia JMAL', () => {
  it('muda os pixels em todas as direções e é diferente da Morte e de um personagem normal', () => {
    for (const dir of DIRS) {
      const plain = digest(draw({ dir }).buf.data);
      const jmal = digest(draw({ dir, costume: 'jmal' }).buf.data);
      expect(jmal, dir).not.toBe(plain);
      expect(jmal, dir).not.toBe(digest(draw({ dir, costume: 'reaper' }).buf.data));
    }
  });

  it('é determinística: o mesmo pedido gera exatamente os mesmos pixels', () => {
    for (const dir of DIRS) expect(digest(draw({ dir, costume: 'jmal' }).buf.data)).toBe(digest(draw({ dir, costume: 'jmal' }).buf.data));
  });

  it('não quebra nenhuma pose nem quadro, nem estoura o tamanho do sprite', () => {
    for (const pose of POSES) {
      for (const dir of DIRS) {
        for (const seated of [false, true]) {
          for (let frame = 0; frame < Math.min(POSE_FRAMES[pose], 4); frame++) {
            const s = draw({ pose, dir, frame, seated, costume: 'jmal' });
            expect(s.buf.w).toBe(CHAR_W);
            expect(s.buf.h).toBe(CHAR_H);
            expect(s.buf.countOpaque(), `${pose}/${dir}/${frame}`).toBeGreaterThan(80);
          }
        }
      }
    }
  });

  it('tem a letra J dourada no peito (de frente e de lado), a coroa e as brasas', () => {
    const plainGold = countRgb(draw().buf.data, GOLD);
    expect(countRgb(draw({ costume: 'jmal' }).buf.data, GOLD)).toBeGreaterThan(plainGold + 12);
    expect(countRgb(draw({ dir: 'left', costume: 'jmal' }).buf.data, GOLD)).toBeGreaterThan(countRgb(draw({ dir: 'left' }).buf.data, GOLD) + 8);
  });

  it('o direito é o espelho do esquerdo e as brasas mudam de um quadro para o outro', () => {
    const left = draw({ dir: 'left', costume: 'jmal' }).buf.flipped();
    expect(digest(left.data)).toBe(digest(draw({ dir: 'right', costume: 'jmal' }).buf.data));
    expect(digest(draw({ costume: 'jmal', frame: 0 }).buf.data)).not.toBe(digest(draw({ costume: 'jmal', frame: 1 }).buf.data));
  });

  it('a fantasia não vaza para quem não a usa (o desenho normal não muda)', () => {
    expect(digest(draw().buf.data)).toBe(digest(draw({ costume: undefined }).buf.data));
  });
});
