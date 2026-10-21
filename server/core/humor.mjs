// Humor dos agentes a partir das últimas partidas. É só expressão (texto e ícone): nunca altera aura, modelo, nível, tarefa, custo
// ou prioridade. Vitória do agente +1, derrota -1, empate 0; soma das 5 últimas: >= 2 animado, <= -2 chateado; 6 h sem partida volta a neutro.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const MAX_PARTIDAS = 5;
const PRAZO = 6 * 3600e3;
const PONTOS = { agente: 1, pessoa: -1, empate: 0 };
const file = () => path.join(config.data, 'humor.json');
// Objetos sem protótipo: um agente chamado "constructor" ou "__proto__" é só uma chave comum.
const limpo = (o) => Object.assign(Object.create(null), o);
const load = () => {
  const d = readJson(file(), null);
  const agentes = limpo(d?.agentes && typeof d.agentes === 'object' ? d.agentes : {});
  // Dado corrompido vira "sem partidas" em vez de lançar.
  for (const k of Object.keys(agentes)) {
    const a = agentes[k];
    const partidas = Array.isArray(a?.partidas) ? a.partidas.filter((p) => p === 1 || p === -1 || p === 0) : [];
    agentes[k] = { partidas: partidas.slice(-MAX_PARTIDAS), at: Number.isFinite(a?.at) ? a.at : 0 };
  }
  return { agentes };
};

/** Guarda o resultado de uma partida terminada. Síncrono de ponta a ponta: não há await entre ler e gravar. */
export function registrarPartida(agentId, resultado, now = Date.now()) {
  if (!Object.hasOwn(PONTOS, resultado)) return;
  const d = load();
  const a = (d.agentes[agentId] ??= { partidas: [], at: now });
  a.partidas = [...a.partidas, PONTOS[resultado]].slice(-MAX_PARTIDAS);
  a.at = now;
  writeJson(file(), d);
}

export function humorDe(agentId, now = Date.now()) {
  const a = load().agentes[agentId];
  if (!a || !a.partidas.length || now - a.at >= PRAZO) return 'neutro';
  const soma = a.partidas.reduce((s, p) => s + p, 0);
  return soma >= 2 ? 'animado' : soma <= -2 ? 'chateado' : 'neutro';
}

// Falas fixas, sem modelo de linguagem. `geral` serve a qualquer momento; as demais, ao fim de uma partida (resultado visto do agente).
const FALAS = {
  animado: {
    geral: ['Estou voando hoje!', 'Bora mais uma?', 'Hoje nada me segura.'],
    agente: ['Ganhei de novo! Pode aplaudir.', 'Mais uma pra conta. Que fase!'],
    pessoa: ['Você ganhou, mas estou de bom humor.', 'Boa jogada! Revanche?'],
    empate: ['Empatou, mas o astral segue lá em cima.', 'Nem empate me derruba hoje.'],
  },
  neutro: {
    geral: ['Pronto para jogar.', 'Vamos a uma partida?', 'Tudo tranquilo por aqui.'],
    agente: ['Boa, levei essa.', 'Ganhei! Foi por pouco.'],
    pessoa: ['Você levou essa. Boa jogada.', 'Perdi, mas foi justo.'],
    empate: ['Empate. Bem equilibrado.', 'Ficou no zero a zero.'],
  },
  chateado: {
    geral: ['Hoje não é meu dia...', 'Estou meio desanimado, viu?', 'Preciso de uma vitória.'],
    agente: ['Finalmente! Já estava na hora.', 'Ufa, até que enfim ganhei uma.'],
    pessoa: ['De novo?! Assim eu reclamo.', 'Você só pode estar de brincadeira...'],
    empate: ['Empate... nem pra ganhar!', 'Nem perdi, nem ganhei. Que fase.'],
  },
};
const DESCONHECIDO = ['Vamos jogar?', 'Estou por aqui.'];

/** Fala curta e fixa para o humor (e para o resultado da partida, se vier). `sorteio(n)` devolve um índice em [0, n); o padrão é Math.random. */
export function falaDe(humor, resultado, sorteio = (n) => Math.floor(Math.random() * n)) {
  const grupo = Object.hasOwn(FALAS, humor) ? FALAS[humor] : null;
  const lista = (grupo && Object.hasOwn(grupo, resultado) ? grupo[resultado] : grupo?.geral) ?? DESCONHECIDO;
  const i = Math.floor(Number(sorteio(lista.length)));
  return lista[Number.isFinite(i) ? Math.min(Math.max(i, 0), lista.length - 1) : 0];
}
