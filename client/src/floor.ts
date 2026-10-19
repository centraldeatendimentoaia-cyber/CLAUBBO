// Andar do escritório (Escritório v2): o prédio mostra um andar por vez. Andar 1 = agentes do Escritório;
// andar 2 = sessões do Claude Code abertas em terminais. A escolha fica guardada neste navegador.
const KEY = 'ev2.floor';
const listeners = new Set<() => void>();

function read(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n === 2 ? 2 : 1;
  } catch {
    return 1;
  }
}

let floor = read();

export const getFloor = (): number => floor;

export function setFloor(next: number): void {
  if (next === floor) return;
  floor = next;
  try {
    localStorage.setItem(KEY, String(next));
  } catch {
    // Sem armazenamento: vale só nesta página.
  }
  for (const l of listeners) l();
}

export function onFloor(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
