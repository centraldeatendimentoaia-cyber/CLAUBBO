// Pedra, papel e tesoura entre uma pessoa e um agente, melhor de 3, com apostas reservadas em `partida:<id>`. O servidor sorteia o
// gesto do agente só depois de receber o da pessoa e grava. Moeda só muda de mãos em `mover` (carteiras.mjs), sempre com ids únicos
// por partida e finalidade, então repetir um pagamento nunca move moeda de novo. Estado em `data/jogos.json`.
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';
import { chaveAgente, chavePessoa, mover, saldoDe } from './carteiras.mjs';
import { falaDe, humorDe, registrarPartida } from './humor.mjs';

const APOSTAS = [5, 10, 25];
const GESTOS = ['pedra', 'papel', 'tesoura'];
const VENCE = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' };
const RODADAS_PARA_VENCER = 2;
const MAX_RODADAS = 5;
const EXPIRA_MS = 2 * 60e3;
const INTERVALO_MS = 10e3;
const MAX_ENCERRADAS = 50;
const file = () => path.join(config.data, 'jogos.json');
// Objetos sem protótipo: um agente ou uma pessoa chamada "constructor" ou "__proto__" é só uma chave comum.
const limpo = (o) => Object.assign(Object.create(null), o && typeof o === 'object' ? o : {});
const load = () => {
  const d = readJson(file(), null);
  return { partidas: limpo(d?.partidas), aberturas: limpo(d?.aberturas) };
};
const erro = (status, error) => ({ ok: false, status, error });
const conta = (id) => `partida:${id}`;

/** Estado público da partida: nunca traz gesto que ainda não foi sorteado (o do agente só existe depois da jogada da pessoa). */
function visao(p, saldo) {
  const fim = p.estado !== 'aberta';
  return {
    ok: true, status: 200, id: p.id, agentId: p.agentId, aposta: p.aposta, estado: p.estado, rodada: p.rodadas.length + 1,
    placar: { ...p.placar }, rodadas: p.rodadas.map((r) => ({ ...r })), fim, ...(p.resultado ? { resultado: p.resultado } : {}), saldo,
  };
}

/** Paga ou devolve as apostas guardadas na partida, com ids fixos. Devolve true se tudo foi movido (ou já tinha sido). */
function pagar(p) {
  const de = conta(p.id), pessoa = chavePessoa(p.pessoa), agente = chaveAgente(p.agentId);
  const m = (id, para, valor, texto, contar) => mover({ id: `${p.id}:${id}`, de, para, valor, texto, contar }).ok;
  if (p.estado === 'expirada') {
    return m('volta:pessoa', pessoa, p.aposta, 'aposta devolvida (partida expirada)') && m('volta:agente', agente, p.aposta, 'aposta devolvida (partida expirada)');
  }
  if (p.resultado === 'empate') {
    return m('fim:pessoa', pessoa, p.aposta, 'aposta devolvida (empate)') && m('fim:agente', agente, p.aposta, 'aposta devolvida (empate)');
  }
  const ganhou = p.resultado === 'pessoa';
  return m('fim', ganhou ? pessoa : agente, p.aposta * 2, ganhou ? 'venceu a partida' : 'perdeu a partida',
    { ganhou: ganhou ? pessoa : agente, perdeu: ganhou ? agente : pessoa, valor: p.aposta });
}

/** Expira partidas paradas e refaz pagamentos que ficaram pela metade. Chamado no início de toda operação. */
function varrer(d, now) {
  let mudou = false;
  for (const p of Object.values(d.partidas)) {
    if (p.estado === 'aberta' && now - p.ultima > EXPIRA_MS) { p.estado = 'expirada'; p.pago = false; mudou = true; }
  }
  if (mudou) writeJson(file(), d);
  for (const p of Object.values(d.partidas)) {
    if (p.estado !== 'aberta' && !p.pago && pagar(p)) { p.pago = true; mudou = true; }
  }
  const encerradas = Object.keys(d.partidas).filter((k) => d.partidas[k].estado !== 'aberta' && d.partidas[k].pago);
  for (const k of encerradas.slice(0, Math.max(0, encerradas.length - MAX_ENCERRADAS))) { delete d.partidas[k]; mudou = true; }
  for (const k of Object.keys(d.aberturas)) if (now - d.aberturas[k] >= INTERVALO_MS) { delete d.aberturas[k]; mudou = true; }
  if (mudou) writeJson(file(), d);
}

const podeJogar = (pessoa) => (pessoa?.papel === 'dono' || pessoa?.papel === 'equipe') && typeof pessoa.nome === 'string' && pessoa.nome.trim() !== '';

export function criarJogos({ getAgent, agenteOcioso, sorteio = (n) => crypto.randomInt(n), agora = Date.now }) {
  function desafiar({ pessoa, agentId, aposta } = {}) {
    if (!podeJogar(pessoa)) return erro(403, 'só dono ou equipe com nome pode jogar');
    if (!APOSTAS.includes(aposta)) return erro(400, 'aposta deve ser 5, 10 ou 25');
    if (typeof agentId !== 'string' || !agentId) return erro(400, 'agente inválido');
    const now = agora();
    const d = load();
    varrer(d, now);
    if (!getAgent(agentId)) return erro(404, 'agente não encontrado');
    if (!agenteOcioso(agentId)) return erro(409, 'agente ocupado');
    const quem = chavePessoa(pessoa.nome), agente = chaveAgente(agentId);
    const abertas = Object.values(d.partidas).filter((p) => p.estado === 'aberta');
    if (abertas.some((p) => p.agentId === agentId)) return erro(409, 'agente já está em uma partida');
    if (abertas.some((p) => chavePessoa(p.pessoa) === quem)) return erro(409, 'você já tem uma partida aberta');
    const par = `${quem}|${agentId}`;
    if (d.aberturas[par] !== undefined && now - d.aberturas[par] < INTERVALO_MS) return erro(429, 'espere alguns segundos para jogar de novo com este agente');
    if (saldoDe(quem) < aposta) return erro(422, 'saldo insuficiente');
    if (saldoDe(agente) < aposta) return erro(422, 'agente sem moedas para apostar');

    const id = crypto.randomUUID();
    const r1 = mover({ id: `${id}:reserva:pessoa`, de: quem, para: conta(id), valor: aposta, texto: 'aposta reservada' }, now);
    if (!r1.ok) return erro(r1.status, r1.error);
    const r2 = mover({ id: `${id}:reserva:agente`, de: agente, para: conta(id), valor: aposta, texto: 'aposta reservada' }, now);
    if (!r2.ok) {
      mover({ id: `${id}:volta:pessoa`, de: conta(id), para: quem, valor: aposta, texto: 'aposta devolvida' }, now);
      return erro(r2.status, r2.error);
    }
    d.partidas[id] = { id, pessoa: pessoa.nome.trim().toLowerCase(), agentId, aposta, estado: 'aberta', placar: { pessoa: 0, agente: 0 }, rodadas: [], aberta: now, ultima: now, pago: false };
    d.aberturas[par] = now;
    writeJson(file(), d);
    return { ok: true, status: 200, id, rodada: 1, placar: { pessoa: 0, agente: 0 }, saldo: saldoDe(quem) };
  }

  /** Partida da pessoa ou null: quem não abriu a partida não a enxerga (404). */
  const minha = (d, pessoa, id) => {
    if (!podeJogar(pessoa) || typeof id !== 'string') return null;
    const p = d.partidas[id];
    return p && chavePessoa(p.pessoa) === chavePessoa(pessoa.nome) ? p : null;
  };

  function jogar({ pessoa, id, gesto, rodada } = {}) {
    if (!podeJogar(pessoa)) return erro(403, 'só dono ou equipe com nome pode jogar');
    const now = agora();
    const d = load();
    varrer(d, now);
    const p = minha(d, pessoa, id);
    if (!p) return erro(404, 'partida não encontrada');
    if (!GESTOS.includes(gesto)) return erro(400, 'gesto inválido');
    if (!Number.isInteger(rodada)) return erro(400, 'rodada inválida');
    if (p.estado === 'expirada') return erro(410, 'partida expirada');
    if (p.estado !== 'aberta') return erro(409, 'partida encerrada');
    if (rodada !== p.rodadas.length + 1) return erro(409, 'rodada desatualizada');
    if (!agenteOcioso(p.agentId)) return erro(409, 'agente ocupado');

    const gestoAgente = GESTOS[Math.min(Math.max(Math.floor(Number(sorteio(GESTOS.length))) || 0, 0), GESTOS.length - 1)];
    const vencedor = gesto === gestoAgente ? 'empate' : VENCE[gesto] === gestoAgente ? 'pessoa' : 'agente';
    const r = { numero: p.rodadas.length + 1, gestoPessoa: gesto, gestoAgente, vencedor };
    p.rodadas.push(r);
    p.ultima = now;
    if (vencedor !== 'empate') p.placar[vencedor]++;
    const venceu = p.placar.pessoa >= RODADAS_PARA_VENCER ? 'pessoa' : p.placar.agente >= RODADAS_PARA_VENCER ? 'agente' : null;
    const fim = !!venceu || p.rodadas.length >= MAX_RODADAS;
    const quem = chavePessoa(p.pessoa);
    if (!fim) {
      writeJson(file(), d);
      return { ok: true, status: 200, rodada: { ...r }, placar: { ...p.placar }, fim: false, saldo: saldoDe(quem) };
    }
    p.estado = 'encerrada';
    p.resultado = venceu ?? 'empate';
    writeJson(file(), d); // primeiro o resultado, depois a moeda: se cair no meio, `varrer` refaz o pagamento
    if (pagar(p)) { p.pago = true; writeJson(file(), d); }
    registrarPartida(p.agentId, p.resultado, now);
    const humor = humorDe(p.agentId, now);
    return { ok: true, status: 200, rodada: { ...r }, placar: { ...p.placar }, fim: true, resultado: p.resultado, saldo: saldoDe(quem), humor, fala: falaDe(humor, p.resultado) };
  }

  function ler({ pessoa, id } = {}) {
    if (!podeJogar(pessoa)) return erro(403, 'só dono ou equipe com nome pode jogar');
    const d = load();
    varrer(d, agora());
    const p = minha(d, pessoa, id);
    return p ? visao(p, saldoDe(chavePessoa(p.pessoa))) : erro(404, 'partida não encontrada');
  }

  return { desafiar, jogar, ler };
}
