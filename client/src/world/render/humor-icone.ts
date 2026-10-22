// Emoji de humor sobre a cabeça do agente no mapa: só quando o humor foge do neutro (sem animação, nada a respeitar de movimento).
const ICONES: Record<string, string> = { animado: '😄', chateado: '😞' };

/** Emoji a desenhar para o humor vindo do snapshot; null para neutro, ausente ou valor desconhecido. */
export const iconeDeHumor = (humor: string | undefined): string | null => (humor !== undefined && Object.hasOwn(ICONES, humor) ? ICONES[humor] : null);
