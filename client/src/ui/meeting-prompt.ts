// Texto pronto para colar em qualquer agente com o que ficou decidido numa reunião (botão "Copiar prompt" da ata).
export interface MeetingPromptInput {
  objective: string;
  participants: string[];
  /** Quando terminou (epoch ms). */
  at: number;
  /** A ata como foi gravada (Decisão, Próximos passos, Pontos em aberto). */
  minutes: string;
}

export function buildMeetingPrompt(m: MeetingPromptInput): string {
  const date = new Date(m.at).toLocaleDateString('pt-BR');
  return [
    `Contexto da reunião de ${date}: ${m.objective}`,
    `Participantes: ${m.participants.join(', ')}`,
    '',
    'Ata (decisões, próximos passos e pontos em aberto):',
    m.minutes.trim(),
    '',
    'Use isto como contexto combinado; se algo faltar ou estiver em aberto, diga o que falta em vez de supor.',
  ].join('\n');
}

/** Copia para a área de transferência; cai no execCommand se a API moderna não estiver disponível. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
