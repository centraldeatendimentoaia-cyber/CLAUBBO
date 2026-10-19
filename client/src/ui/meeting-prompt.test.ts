import { describe, expect, it } from 'vitest';
import { buildMeetingPrompt } from './meeting-prompt';

describe('buildMeetingPrompt', () => {
  const at = new Date(2026, 9, 18, 12).getTime();
  const text = buildMeetingPrompt({ objective: 'definir a campanha de Natal', participants: ['Ana', 'Bia'], at, minutes: '## Decisão\nPiloto.\n\n## Próximos passos\n- Ana: lista\n\n## Pontos em aberto\n- verba\n' });

  it('traz assunto, data, participantes e a ata', () => {
    expect(text).toContain('Contexto da reunião de 18/10/2026: definir a campanha de Natal');
    expect(text).toContain('Participantes: Ana, Bia');
    for (const s of ['## Decisão', '## Próximos passos', '## Pontos em aberto']) expect(text).toContain(s);
  });
  it('não deixa espaço sobrando no fim da ata', () => {
    expect(text).not.toContain('verba\n\n\n');
  });
});
