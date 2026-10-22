// Presença ao vivo: onde cada pessoa (dono ou equipe com nome) está no mapa agora. Fica só em memória, uma entrada por
// pessoa; some quando a pessoa sai (conexão fechada), pede para sair ou para de avisar por mais de `ttlMs`.
// Só valida, limita a taxa e guarda: quem pode chamar e como a lista chega às páginas é do bridge.
const DIRS = ['up', 'down', 'left', 'right'];
const MAX_ANDAR = 99;
const MAX_TILE = 400; // o mapa tem dezenas de tiles; o limite só barra lixo
const chave = (nome) => String(nome ?? '').trim().normalize('NFKC').toLowerCase();

/** Quem aparece no mapa dos outros: só dono ou equipe, e com nome. Agente, celular sem conta e anônimo ficam de fora. */
export const podeAparecer = (pessoa) => !!pessoa?.nome && (pessoa.papel === 'dono' || pessoa.papel === 'equipe');

/**
 * `ttlMs`: sem aviso por esse tempo a pessoa some. `minIntervaloMs`: avisos mais próximos que isso são recusados (429).
 * `max`: quantas pessoas ao mesmo tempo (um escritório hospedado com muita gente ainda cabe; passou disso, recusa 503).
 */
export function criarPresenca({ now = Date.now, ttlMs = 8000, minIntervaloMs = 80, max = 100 } = {}) {
  const pessoas = new Map(); // chave -> { nome, papel, andar, x, y, dir, em }

  const expirou = (p, t) => t - p.em > ttlMs;
  function varrer() {
    const t = now();
    let mudou = false;
    for (const [k, p] of pessoas) if (expirou(p, t)) { pessoas.delete(k); mudou = true; }
    return mudou;
  }

  return {
    /** Registra a posição. { ok: true } | { ok: false, status, error }. Só a posição válida entra; nada do corpo além dos cinco campos é guardado. */
    atualizar(pessoa, corpo) {
      if (!podeAparecer(pessoa)) return { ok: false, status: 403, error: 'só dono ou equipe com nome aparece no mapa' };
      const { andar, x, y, dir } = corpo ?? {};
      if (!Number.isInteger(andar) || andar < 1 || andar > MAX_ANDAR) return { ok: false, status: 422, error: 'andar inválido' };
      if (![x, y].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_TILE)) return { ok: false, status: 422, error: 'posição inválida' };
      if (!DIRS.includes(dir)) return { ok: false, status: 422, error: 'direção inválida' };
      const t = now();
      const k = chave(pessoa.nome);
      const antes = pessoas.get(k);
      if (antes && !expirou(antes, t) && t - antes.em < minIntervaloMs) return { ok: false, status: 429, error: 'devagar: poucas atualizações por segundo' };
      if (!antes) {
        varrer();
        if (pessoas.size >= max) return { ok: false, status: 503, error: 'o mapa está cheio' };
      }
      pessoas.set(k, { nome: pessoa.nome, papel: pessoa.papel, andar, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, dir, em: t });
      return { ok: true };
    },
    /** Tira a pessoa (saiu, fechou a página, perdeu a conexão). true se ela estava. */
    remover(nome) {
      return pessoas.delete(chave(nome));
    },
    /** Tira quem passou do prazo; true se alguém saiu (o bridge avisa as páginas). */
    varrer,
    /** Quem está no mapa agora, na ordem de entrada, sem o carimbo de tempo. */
    lista() {
      varrer();
      return [...pessoas.values()].map(({ nome, papel, andar, x, y, dir }) => ({ nome, papel, andar, x, y, dir }));
    },
  };
}
