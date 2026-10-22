// Chamadas da presença ao vivo: a página avisa onde está o boneco e, ao sair, que saiu. A lista dos outros chega pelo
// stream do store (evento `presenca`). Quem pode e quem aparece é decidido pelo servidor (403 = esta página não aparece).
import type { Posicao } from '../ui/presenca-model';

/** Avisa a posição. 'proibido' = o servidor não deixa esta página aparecer (agente, sem nome): não adianta tentar de novo. */
export async function avisarPosicao(p: Posicao): Promise<'ok' | 'proibido' | 'falhou'> {
  try {
    const res = await fetch('/api/presenca', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    return res.ok ? 'ok' : res.status === 403 ? 'proibido' : 'falhou'; // 429 e 503 passam: o próximo aviso tenta de novo
  } catch {
    return 'falhou';
  }
}

/** Tira o boneco do mapa dos outros (ao fechar a página). `keepalive` deixa o pedido terminar mesmo com a página fechando. */
export function sairDoMapa(): void {
  try {
    void fetch('/api/presenca/sair', { method: 'POST', keepalive: true }).catch(() => {});
  } catch { /* página já fechando */ }
}
