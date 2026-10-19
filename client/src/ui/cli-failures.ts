// Pedidos aprovados que falham (Escritório v2): o cartão não pode sumir sem aviso. Fica na tela, com a mensagem do erro,
// até o João dispensar. Lógica sem DOM para poder ser testada.

export interface Failure {
  key: string;
  head: string;
  error: string;
}

export interface Listed {
  key: string;
  state: string;
  error?: string;
}

/** Mensagem de erro de uma resposta do servidor ao aprovar (null = deu certo). O servidor devolve 200 mesmo quando o pedido falha ao rodar. */
export function approveError(ok: boolean, status: number, body: { state?: string; error?: string }): string | null {
  if (!ok) return body.error ?? `erro ${status}`;
  if (body.state === 'failed') return body.error ?? 'falhou sem mensagem';
  return null;
}

/**
 * Falhas a mostrar: pedidos que esta página viu esperando (`watched`: chave → título) e que depois ficaram `failed`
 * (inclui chamadas que falham depois de rodar), mais erros locais (`local`), menos os já dispensados.
 */
export function collectFailures(watched: Map<string, string>, listed: Listed[], local: Map<string, Failure>, dismissed: Set<string>): Failure[] {
  const out = new Map<string, Failure>();
  for (const f of local.values()) out.set(f.key, f);
  for (const it of listed) {
    const head = watched.get(it.key);
    if (head !== undefined && it.state === 'failed') out.set(it.key, { key: it.key, head, error: it.error ?? 'falhou sem mensagem' });
  }
  return [...out.values()].filter((f) => !dismissed.has(f.key));
}
