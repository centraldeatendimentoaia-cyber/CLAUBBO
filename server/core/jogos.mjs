// Pedra, papel e tesoura entre uma pessoa e um agente, melhor de 3, com apostas reservadas em `partida:<id>`. O servidor sorteia o
// gesto do agente só depois de receber o da pessoa e grava. Moeda só muda de mãos em `mover` (carteiras.mjs), sempre com ids únicos
// por partida e finalidade, então repetir um pagamento nunca move moeda de novo. Estado em `data/jogos.json`.
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';
import { chaveAgente, chavePessoa, contasPorPrefixo, jaMovido, mover as moverReal, saldoDe } from './carteiras.mjs';
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
const ESTADOS = ['reservando', 'aberta', 'encerrada', 'expirada'];
const num = (x) => Number.isFinite(x);
// Registro com formato impossível é descartado (a moeda dele volta por `devolverOrfas`) em vez de quebrar quem lê.
const valido = (k, p) => p && typeof p === 'object' && p.id === k && typeof p.pessoa === 'string' && p.pessoa.trim() !== '' && typeof p.agentId === 'string'
  && p.agentId !== '' && APOSTAS.includes(p.aposta) && ESTADOS.includes(p.estado) && Array.isArray(p.rodadas) && num(p.ultima)
  && num(p.placar?.pessoa) && num(p.placar?.agente);
const load = () => {
  const d = readJson(file(), null);
  const partidas = limpo(d?.partidas);
  for (const k of Object.keys(partidas)) if (!valido(k, partidas[k])) delete partidas[k];
  const aberturas = limpo(d?.aberturas);
  for (const k of Object.keys(aberturas)) if (!num(aberturas[k])) delete aberturas[k];
  return { partidas, aberturas };
};
// getAgent e agenteOcioso são consultados no meio de uma sequência síncrona: uma Promise aqui abriria brecha entre conferir e gravar.
const sincrono = (x) => {
  if (x && typeof x.then === 'function') throw new TypeError('getAgent e agenteOcioso devem ser síncronos');
  return x;
};
const par = (p) => `${chavePessoa(p.pessoa)}|${p.agentId}`;
const erro = (status, error) => ({ ok: false, status, error });
const conta = (id) => `partida:${id}`;

/** Estado público da partida: nunca traz gesto que ainda não foi sorteado (o do agente só existe depois da jogada da pessoa). */
function visao(p, saldo) {
  const fim = p.estado !== 'aberta';
  return {
    ok: true, status: 200, id: p.id, agentId: p.agentId, aposta: p.aposta, estado: p.estado, rodada: fim ? null : p.rodadas.length + 1,
    placar: { ...p.placar }, rodadas: p.rodadas.map((r) => ({ ...r })), fim, ...(p.resultado ? { resultado: p.resultado } : {}), saldo,
  };
}

/** Paga ou devolve as apostas guardadas na partida, com ids fixos. Devolve true se tudo foi movido (ou já tinha sido). */
function pagar(p, mover) {
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

/** Devolve só as pernas da reserva que de fato foram movidas (nunca as duas às cegas). true se não sobrou nada a devolver. */
function devolverPernas(p, mover) {
  const dono = { pessoa: chavePessoa(p.pessoa), agente: chaveAgente(p.agentId) };
  let ok = true;
  for (const perna of ['pessoa', 'agente']) {
    if (!jaMovido(`${p.id}:reserva:${perna}`)) continue;
    ok = mover({ id: `${p.id}:volta:${perna}`, de: conta(p.id), para: dono[perna], valor: p.aposta, texto: 'aposta devolvida' }).ok && ok;
  }
  return ok;
}

/** Conta `partida:*` com saldo e sem registro: devolve a cada contraparte o que ela colocou, lido do extrato da própria conta. */
function devolverOrfas(d, mover) {
  for (const { chave, extrato } of contasPorPrefixo('partida:')) {
    const id = chave.slice('partida:'.length);
    if (d.partidas[id]) continue;
    const liquido = new Map();
    for (const e of extrato) if (typeof e.com === 'string') liquido.set(e.com, (liquido.get(e.com) ?? 0) + e.delta);
    for (const [com, valor] of liquido) if (valor > 0) mover({ id: `${id}:orfa:${com}`, de: chave, para: com, valor, texto: 'aposta devolvida' });
  }
}

/** Expira partidas paradas e refaz pagamentos que ficaram pela metade. Chamado no início de toda operação. */
function varrer(d, now, mover) {
  let mudou = false;
  for (const p of Object.values(d.partidas)) {
    if (p.estado === 'aberta' && now - p.ultima > EXPIRA_MS) { p.estado = 'expirada'; p.pago = false; d.aberturas[par(p)] = now; mudou = true; }
  }
  if (mudou) writeJson(file(), d);
  for (const p of Object.values(d.partidas)) {
    if (p.estado === 'reservando') { if (devolverPernas(p, mover)) { delete d.partidas[p.id]; mudou = true; } }
    else if (p.estado !== 'aberta' && !p.pago && pagar(p, mover)) { p.pago = true; mudou = true; }
  }
  if (mudou) writeJson(file(), d);
  devolverOrfas(d, mover);
  const encerradas = Object.keys(d.partidas).filter((k) => d.partidas[k].estado !== 'aberta' && d.partidas[k].estado !== 'reservando' && d.partidas[k].pago);
  for (const k of encerradas.slice(0, Math.max(0, encerradas.length - MAX_ENCERRADAS))) { delete d.partidas[k]; mudou = true; }
  for (const k of Object.keys(d.aberturas)) if (now - d.aberturas[k] >= INTERVALO_MS) { delete d.aberturas[k]; mudou = true; }
  if (mudou) writeJson(file(), d);
}

const podeJogar = (pessoa) => (pessoa?.papel === 'dono' || pessoa?.papel === 'equipe') && typeof pessoa.nome === 'string' && pessoa.nome.trim() !== '';

export function criarJogos({ getAgent: getAgentAssinc, agenteOcioso: ociosoAssinc, sorteio = (n) => crypto.randomInt(n), agora = Date.now, mover = moverReal }) {
  const getAgent = (id) => sincrono(getAgentAssinc(id));
  const agenteOcioso = (id) => sincrono(ociosoAssinc(id));
  function desafiar({ pessoa, agentId, aposta } = {}) {
    if (!podeJogar(pessoa)) return erro(403, 'só dono ou equipe com nome pode jogar');
    if (!APOSTAS.includes(aposta)) return erro(400, 'aposta deve ser 5, 10 ou 25');
    if (typeof agentId !== 'string' || !agentId) return erro(400, 'agente inválido');
    const now = agora();
    const d = load();
    varrer(d, now, mover);
    if (!getAgent(agentId)) return erro(404, 'agente não encontrado');
    if (!agenteOcioso(agentId)) return erro(409, 'agente ocupado');
    const quem = chavePessoa(pessoa.nome), agente = chaveAgente(agentId);
    const abertas = Object.values(d.partidas).filter((p) => p.estado === 'aberta' || p.estado === 'reservando');
    if (abertas.some((p) => p.agentId === agentId)) return erro(409, 'agente já está em uma partida');
    if (abertas.some((p) => chavePessoa(p.pessoa) === quem)) return erro(409, 'você já tem uma partida aberta');
    const parChave = `${quem}|${agentId}`;
    if (d.aberturas[parChave] !== undefined && now - d.aberturas[parChave] < INTERVALO_MS) return erro(429, 'espere alguns segundos para jogar de novo com este agente');
    if (saldoDe(quem) < aposta) return erro(422, 'saldo insuficiente');
    if (saldoDe(agente) < aposta) return erro(422, 'agente sem moedas para apostar');

    const id = crypto.randomUUID();
    const p = { id, pessoa: pessoa.nome.trim().toLowerCase(), agentId, aposta, estado: 'reservando', placar: { pessoa: 0, agente: 0 }, rodadas: [], aberta: now, ultima: now, pago: false };
    d.partidas[id] = p;
    writeJson(file(), d); // o registro vem antes da moeda: se cair no meio, `varrer` sabe o que devolver
    const desfazer = () => { devolverPernas(p, mover); delete d.partidas[id]; writeJson(file(), d); };
    try {
      const r1 = mover({ id: `${id}:reserva:pessoa`, de: quem, para: conta(id), valor: aposta, texto: 'aposta reservada' }, now);
      if (!r1.ok) { desfazer(); return erro(r1.status, r1.error); }
      const r2 = mover({ id: `${id}:reserva:agente`, de: agente, para: conta(id), valor: aposta, texto: 'aposta reservada' }, now);
      if (!r2.ok) { desfazer(); return erro(r2.status, r2.error); }
    } catch {
      try { desfazer(); } catch { /* o registro 'reservando' fica e a próxima varredura devolve */ }
      return erro(500, 'falha ao reservar as apostas');
    }
    p.estado = 'aberta';
    d.aberturas[par(p)] = now;
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
    varrer(d, now, mover);
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
    d.aberturas[par(p)] = now;
    p.resultado = venceu ?? 'empate';
    writeJson(file(), d); // primeiro o resultado, depois a moeda: se cair no meio, `varrer` refaz o pagamento
    if (pagar(p, mover)) { p.pago = true; writeJson(file(), d); }
    registrarPartida(p.agentId, p.resultado, now);
    const humor = humorDe(p.agentId, now);
    return { ok: true, status: 200, rodada: { ...r }, placar: { ...p.placar }, fim: true, resultado: p.resultado, saldo: saldoDe(quem), humor, fala: falaDe(humor, p.resultado) };
  }

  function ler({ pessoa, id } = {}) {
    if (!podeJogar(pessoa)) return erro(403, 'só dono ou equipe com nome pode jogar');
    const d = load();
    varrer(d, agora(), mover);
    const p = minha(d, pessoa, id);
    return p ? visao(p, saldoDe(chavePessoa(p.pessoa))) : erro(404, 'partida não encontrada');
  }

  return { desafiar, jogar, ler };
}
