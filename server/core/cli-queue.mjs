// Fila dos pedidos aos terminais: cancelar e reordenar. Funções puras sobre a lista de pedidos (data/cli-requests.json).
// Cancelar um pedido que espera aprovação o encerra sem enviar nada; cancelar um já enviado só para de esperar o retorno
// (o terminal continua o que já recebeu: não há como "desenviar").

/** Cancela o pedido `id`. Devolve { ok, item } ou { ok: false, status, error }. */
export function cancelRequest(list, id, now = Date.now()) {
  const item = list.find((r) => r.id === id);
  if (!item) return { ok: false, status: 404, error: 'pedido não encontrado' };
  if (item.state === 'pending') {
    item.state = 'cancelled';
    item.cancelledAt = now;
    return { ok: true, item };
  }
  if (item.state === 'sent' && item.retorno === 'aguardando') {
    item.retorno = 'cancelado';
    item.cancelledAt = now;
    return { ok: true, item };
  }
  return { ok: false, status: 409, error: 'este pedido não está esperando aprovação nem retorno' };
}

/** Sobe ('up') ou desce ('down') um pedido pendente entre os pendentes (a ordem é a da lista). */
export function moveRequest(list, id, dir) {
  if (dir !== 'up' && dir !== 'down') return { ok: false, status: 400, error: 'direção inválida (use up ou down)' };
  const pending = list.map((r, i) => [r, i]).filter(([r]) => r.state === 'pending');
  const at = pending.findIndex(([r]) => r.id === id);
  if (at < 0) return { ok: false, status: 404, error: 'pedido não está esperando aprovação' };
  const to = dir === 'up' ? at - 1 : at + 1;
  if (to < 0 || to >= pending.length) return { ok: true, moved: false };
  const [i, j] = [pending[at][1], pending[to][1]];
  [list[i], list[j]] = [list[j], list[i]];
  return { ok: true, moved: true };
}
