import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { SALDO_INICIAL, chaveAgente, chavePessoa, contaDe, contasPorPrefixo, extratoDe, mover, saldoDe, totalGeral } from './carteiras.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { humorDe } from './humor.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { criarJogos } from './jogos.mjs';

const oldData = config.data;
let dir = '';
beforeEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jogos-'));
  config.data = dir;
});
afterAll(() => {
  config.data = oldData;
  fs.rmSync(dir, { recursive: true, force: true });
});

const ana = { nome: 'Ana', papel: 'equipe' };
const caio = { nome: 'Caio', papel: 'dono' };
const PEDRA = 0, PAPEL = 1, TESOURA = 2;

// `sorteio` devolve a fila de gestos do agente; `t.v` é o relógio.
function montar(opts: { ocioso?: (id: string) => any; mover?: any; getAgent?: any } = {}) {
  const fila: number[] = [];
  const t = { v: 1_000_000 };
  const jogos = criarJogos({
    getAgent: opts.getAgent ?? ((id: string) => (id === 'zeta' ? null : { id })),
    ...(opts.mover ? { mover: opts.mover } : {}),
    agenteOcioso: opts.ocioso ?? (() => true),
    sorteio: () => fila.shift() ?? PEDRA,
    agora: () => t.v,
  });
  return { jogos, fila, t };
}
const abrir = (j: any, pessoa: any = ana, aposta: any = 10, agentId = 'bia') => j.desafiar({ pessoa, agentId, aposta });
const bruto = (j: any, pessoa: any, aposta: any) => j.desafiar({ pessoa, agentId: 'bia', aposta });
// Contra pedra do agente: papel ganha, tesoura perde, pedra empata.
const ganha = (j: any, id: string, n: number, pessoa = ana) => j.jogar({ pessoa, id, gesto: 'papel', rodada: n });
const perde = (j: any, id: string, n: number, pessoa = ana) => j.jogar({ pessoa, id, gesto: 'tesoura', rodada: n });
const empata = (j: any, id: string, n: number, pessoa = ana) => j.jogar({ pessoa, id, gesto: 'pedra', rodada: n });
const tocar = () => { saldoDe(chavePessoa('Ana')); saldoDe(chavePessoa('Caio')); saldoDe(chaveAgente('bia')); saldoDe(chaveAgente('cida')); };

describe('abrir partida', () => {
  it('reserva as duas apostas e mantém o total de moedas', () => {
    const { jogos } = montar();
    tocar();
    const total = totalGeral();
    const r = abrir(jogos);
    expect(r).toMatchObject({ ok: true, status: 200, rodada: 1, placar: { pessoa: 0, agente: 0 }, saldo: SALDO_INICIAL - 10 });
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL - 10);
    expect(saldoDe(`partida:${r.id}`)).toBe(20);
    expect(totalGeral()).toBe(total);
  });
  it('aposta fora de 5, 10 e 25 dá 400', () => {
    const { jogos } = montar();
    for (const aposta of [7, 0, -5, '10', undefined, 5.5]) expect(bruto(jogos, ana, aposta)).toMatchObject({ ok: false, status: 400 });
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
  });
  it('só dono ou equipe com nome: o resto dá 403', () => {
    const { jogos } = montar();
    for (const p of [undefined, { nome: '', papel: 'dono' }, { nome: 'Ana', papel: 'agente' }, { papel: 'equipe' }, { nome: '  ', papel: 'equipe' }]) {
      expect(bruto(jogos, p, 10)).toMatchObject({ ok: false, status: 403 });
    }
  });
  it('agente inexistente dá 404 e agente ocupado dá 409, sem mexer em moeda', () => {
    const { jogos } = montar({ ocioso: (id) => id !== 'cida' });
    tocar();
    const total = totalGeral();
    expect(abrir(jogos, ana, 10, 'zeta')).toMatchObject({ ok: false, status: 404 });
    expect(abrir(jogos, ana, 10, 'cida')).toMatchObject({ ok: false, status: 409 });
    expect(totalGeral()).toBe(total);
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
  });
  it('aposta maior que o saldo da pessoa dá 422 sem reservar nada', () => {
    const { jogos, t } = montar();
    // a Ana perde 25 três vezes e 10 duas vezes: sobram 5 moedas
    for (const aposta of [25, 25, 25, 10, 10]) {
      t.v += 11_000;
      const a = abrir(jogos, ana, aposta, 'bia');
      expect(a.ok).toBe(true);
      perde(jogos, a.id, 1); perde(jogos, a.id, 2);
    }
    expect(saldoDe(chavePessoa('Ana'))).toBe(5);
    t.v += 11_000;
    tocar();
    const total = totalGeral(), antes = saldoDe(chaveAgente('cida'));
    expect(abrir(jogos, ana, 10, 'cida')).toMatchObject({ ok: false, status: 422 });
    expect(saldoDe(chaveAgente('cida'))).toBe(antes);
    expect(totalGeral()).toBe(total);
  });
  it('agente sem saldo dá 422 e a pessoa não perde nada', () => {
    const { jogos, t } = montar();
    // o agente perde 100 em partidas de 25 contra duas pessoas diferentes
    for (let i = 0; i < 4; i++) {
      const p = i % 2 ? caio : ana;
      t.v += 60_000;
      const a = abrir(jogos, p, 25, 'bia');
      expect(a.ok).toBe(true);
      ganha(jogos, a.id, 1, p); ganha(jogos, a.id, 2, p);
    }
    expect(saldoDe(chaveAgente('bia'))).toBe(0);
    t.v += 60_000;
    const antes = saldoDe(chavePessoa('Ana'));
    expect(abrir(jogos, ana, 5, 'bia')).toMatchObject({ ok: false, status: 422 });
    expect(saldoDe(chavePessoa('Ana'))).toBe(antes);
  });
  it('segunda partida da mesma pessoa, ou no mesmo agente, dá 409', () => {
    const { jogos } = montar();
    expect(abrir(jogos, ana, 10, 'bia').ok).toBe(true);
    expect(abrir(jogos, ana, 10, 'cida')).toMatchObject({ ok: false, status: 409 });
    expect(abrir(jogos, caio, 10, 'bia')).toMatchObject({ ok: false, status: 409 });
    expect(saldoDe(chavePessoa('Caio'))).toBe(SALDO_INICIAL);
  });
  it('intervalo de 10 s entre partidas da mesma pessoa com o mesmo agente dá 429', () => {
    const { jogos, t } = montar();
    const a = abrir(jogos);
    ganha(jogos, a.id, 1); ganha(jogos, a.id, 2);
    t.v += 9_000;
    expect(abrir(jogos)).toMatchObject({ ok: false, status: 429 });
    const c = abrir(jogos, ana, 10, 'cida'); // outro agente não é bloqueado
    expect(c.ok).toBe(true);
    ganha(jogos, c.id, 1); ganha(jogos, c.id, 2);
    t.v += 1_000;
    expect(abrir(jogos).ok).toBe(true);
  });
  it('nomes hostis viram chaves comuns', () => {
    const { jogos } = montar();
    expect(abrir(jogos, { nome: '__proto__', papel: 'equipe' }, 5, 'constructor').ok).toBe(true);
    expect(abrir(jogos, { nome: 'Constructor', papel: 'dono' }, 5, '__proto__').ok).toBe(true);
  });
});

describe('jogar', () => {
  it('vitória por 2 a 0 paga as duas apostas ao vencedor e registra humor', () => {
    const { jogos } = montar();
    tocar();
    const total = totalGeral();
    const a = abrir(jogos);
    expect(ganha(jogos, a.id, 1)).toMatchObject({ ok: true, rodada: { numero: 1, gestoPessoa: 'papel', gestoAgente: 'pedra', vencedor: 'pessoa' }, placar: { pessoa: 1, agente: 0 }, fim: false });
    const f = ganha(jogos, a.id, 2);
    expect(f).toMatchObject({ ok: true, placar: { pessoa: 2, agente: 0 }, fim: true, resultado: 'pessoa', saldo: SALDO_INICIAL + 10, humor: 'neutro' });
    expect(typeof f.fala).toBe('string');
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL - 10);
    expect(saldoDe(`partida:${a.id}`)).toBe(0);
    expect(totalGeral()).toBe(total);
    expect(contaDe(chavePessoa('Ana'))).toMatchObject({ ganhou: 10, perdeu: 0 });
    expect(contaDe(chaveAgente('bia'))).toMatchObject({ ganhou: 0, perdeu: 10 });
  });
  it('vitória por 2 a 1 do agente', () => {
    const { jogos } = montar();
    const a = abrir(jogos);
    perde(jogos, a.id, 1); ganha(jogos, a.id, 2);
    const f = perde(jogos, a.id, 3);
    expect(f).toMatchObject({ ok: true, placar: { pessoa: 1, agente: 2 }, fim: true, resultado: 'agente', saldo: SALDO_INICIAL - 10 });
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL + 10);
    expect(contaDe(chaveAgente('bia'))).toMatchObject({ ganhou: 10 });
  });
  it('rodada empatada repete e não conta', () => {
    const { jogos } = montar();
    const a = abrir(jogos);
    expect(empata(jogos, a.id, 1)).toMatchObject({ ok: true, rodada: { numero: 1, vencedor: 'empate' }, placar: { pessoa: 0, agente: 0 }, fim: false });
    expect(jogos.ler({ pessoa: ana, id: a.id })).toMatchObject({ rodada: 2, placar: { pessoa: 0, agente: 0 } });
    ganha(jogos, a.id, 2);
    expect(ganha(jogos, a.id, 3)).toMatchObject({ fim: true, resultado: 'pessoa' });
  });
  it('cinco rodadas sem vencedor empatam a partida e devolvem as apostas', () => {
    const { jogos } = montar();
    tocar();
    const total = totalGeral();
    const a = abrir(jogos);
    ganha(jogos, a.id, 1); // 1 a 0 e depois só empates
    for (let n = 2; n <= 4; n++) expect(empata(jogos, a.id, n).fim).toBe(false);
    const f = empata(jogos, a.id, 5);
    expect(f).toMatchObject({ fim: true, resultado: 'empate', saldo: SALDO_INICIAL });
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL);
    expect(totalGeral()).toBe(total);
    expect(contaDe(chavePessoa('Ana'))).toMatchObject({ ganhou: 0, perdeu: 0 });
  });
  it('gesto inválido dá 400 e não avança', () => {
    const { jogos } = montar();
    const a = abrir(jogos);
    for (const gesto of ['fogo', '', undefined, 1]) expect(jogos.jogar({ pessoa: ana, id: a.id, gesto, rodada: 1 })).toMatchObject({ ok: false, status: 400 });
    expect(jogos.ler({ pessoa: ana, id: a.id }).rodada).toBe(1);
  });
  it('partida de outra pessoa ou inexistente dá 404', () => {
    const { jogos } = montar();
    const a = abrir(jogos);
    expect(ganha(jogos, a.id, 1, caio)).toMatchObject({ ok: false, status: 404 });
    expect(jogos.ler({ pessoa: caio, id: a.id })).toMatchObject({ ok: false, status: 404 });
    expect(ganha(jogos, 'nao-existe', 1)).toMatchObject({ ok: false, status: 404 });
    expect(jogos.ler({ pessoa: ana, id: '__proto__' })).toMatchObject({ ok: false, status: 404 });
    expect(jogos.ler({ pessoa: ana, id: a.id }).ok).toBe(true);
  });
  it('partida encerrada dá 409', () => {
    const { jogos } = montar();
    const a = abrir(jogos);
    ganha(jogos, a.id, 1); ganha(jogos, a.id, 2);
    expect(ganha(jogos, a.id, 3)).toMatchObject({ ok: false, status: 409 });
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL + 10); // sem pagar duas vezes
  });
  it('rodada diferente da atual (clique duplo, duas abas) dá 409 sem avançar', () => {
    const { jogos, fila } = montar();
    const a = abrir(jogos);
    expect(ganha(jogos, a.id, 1).ok).toBe(true);
    fila.push(TESOURA); // se avançasse, esse sorteio seria consumido
    expect(ganha(jogos, a.id, 1)).toMatchObject({ ok: false, status: 409 });
    expect(jogos.ler({ pessoa: ana, id: a.id })).toMatchObject({ rodada: 2, placar: { pessoa: 1, agente: 0 } });
    expect(fila).toEqual([TESOURA]);
    for (const r of [0, 3, -1]) expect(ganha(jogos, a.id, r)).toMatchObject({ ok: false, status: 409 });
  });
  it('agente que ficou ocupado entre abrir e jogar dá 409 sem mexer em moeda', () => {
    let livre = true;
    const { jogos } = montar({ ocioso: () => livre });
    const a = abrir(jogos);
    livre = false;
    expect(ganha(jogos, a.id, 1)).toMatchObject({ ok: false, status: 409 });
    expect(jogos.ler({ pessoa: ana, id: a.id })).toMatchObject({ rodada: 1, placar: { pessoa: 0, agente: 0 } });
    expect(saldoDe(`partida:${a.id}`)).toBe(20);
  });
  it('ler mostra o histórico e não traz gesto não sorteado', () => {
    const { jogos, fila } = montar();
    const a = abrir(jogos);
    fila.push(TESOURA);
    const antes = jogos.ler({ pessoa: ana, id: a.id });
    expect(antes.rodadas).toEqual([]);
    expect(JSON.stringify(antes)).not.toMatch(/gestoAgente|tesoura|pedra|papel/);
    jogos.jogar({ pessoa: ana, id: a.id, gesto: 'pedra', rodada: 1 }); // pedra x tesoura: pessoa vence
    expect(jogos.ler({ pessoa: ana, id: a.id }).rodadas).toEqual([{ numero: 1, gestoPessoa: 'pedra', gestoAgente: 'tesoura', vencedor: 'pessoa' }]);
  });
  it('o estado sobrevive a recriar o módulo (recarregar a página no meio da partida)', () => {
    const a = abrir(montar().jogos);
    const outro = montar().jogos;
    expect(outro.ler({ pessoa: ana, id: a.id })).toMatchObject({ ok: true, rodada: 1, estado: 'aberta' });
  });
});

describe('expiração', () => {
  it('sem jogada por mais de 2 minutos devolve as apostas sem tocar no humor', () => {
    const { jogos, t } = montar();
    tocar();
    const total = totalGeral();
    const a = abrir(jogos);
    ganha(jogos, a.id, 1);
    t.v += 120_000; // exatamente 2 minutos ainda vale
    expect(jogos.ler({ pessoa: ana, id: a.id }).estado).toBe('aberta');
    t.v += 1;
    expect(jogos.ler({ pessoa: ana, id: a.id })).toMatchObject({ ok: true, estado: 'expirada', fim: true });
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL);
    expect(saldoDe(`partida:${a.id}`)).toBe(0);
    expect(totalGeral()).toBe(total);
    expect(humorDe('bia', t.v)).toBe('neutro');
    expect(fs.existsSync(path.join(dir, 'humor.json'))).toBe(false);
    expect(ganha(jogos, a.id, 2)).toMatchObject({ ok: false, status: 410 });
    expect(extratoDe(chavePessoa('Ana'))[0].delta).toBe(10);
  });
  it('desafiar libera pessoa e agente de uma partida expirada', () => {
    const { jogos, t } = montar();
    abrir(jogos);
    t.v += 130_000;
    expect(abrir(jogos, caio, 10, 'bia').ok).toBe(true);
  });
});

const lerArquivo = () => JSON.parse(fs.readFileSync(path.join(dir, 'jogos.json'), 'utf8'));
const gravar = (partidas: any) => fs.writeFileSync(path.join(dir, 'jogos.json'), JSON.stringify({ partidas, aberturas: {} }));
const registro = (id: string, extra: any = {}) => ({ id, pessoa: 'ana', agentId: 'bia', aposta: 10, estado: 'aberta', placar: { pessoa: 0, agente: 0 }, rodadas: [], aberta: 1, ultima: 1_000_000, pago: false, ...extra });
const reservar = (id: string, pernas = ['pessoa', 'agente']) => {
  if (pernas.includes('pessoa')) mover({ id: id + ':reserva:pessoa', de: chavePessoa('Ana'), para: 'partida:' + id, valor: 10, texto: 'x' });
  if (pernas.includes('agente')) mover({ id: id + ':reserva:agente', de: chaveAgente('bia'), para: 'partida:' + id, valor: 10, texto: 'x' });
};

describe('conservação', () => {
  it('50 partidas aleatórias (com chamadas repetidas, rodada velha e pessoa errada) não criam nem destroem moeda', () => {
    const { jogos, fila, t } = montar();
    tocar();
    const total = totalGeral();
    expect(total).toBe(4 * SALDO_INICIAL);
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const gestos = ['pedra', 'papel', 'tesoura'];
    for (let i = 0; i < 50; i++) {
      const pessoa = rnd(2) ? ana : caio, outra = pessoa === ana ? caio : ana, agentId = rnd(2) ? 'bia' : 'cida';
      t.v += 11_000;
      const a = abrir(jogos, pessoa, [5, 10, 25][rnd(3)], agentId);
      if (!a.ok) continue;
      if (rnd(8) === 0) { t.v += 121_000; jogos.ler({ pessoa, id: a.id }); continue; } // abandonada
      for (let n = 1; n <= 6; n++) {
        const gesto = gestos[rnd(3)];
        fila.push(rnd(3));
        if (rnd(3) === 0) jogos.jogar({ pessoa: outra, id: a.id, gesto, rodada: n }); // pessoa errada
        if (rnd(3) === 0) jogos.jogar({ pessoa, id: a.id, gesto, rodada: n + 1 + rnd(3) }); // rodada adiantada
        const r = jogos.jogar({ pessoa, id: a.id, gesto, rodada: n });
        if (rnd(2) === 0) jogos.jogar({ pessoa, id: a.id, gesto, rodada: n }); // clique duplo
        if (!r.ok || r.fim) break;
      }
    }
    t.v += 300_000;
    jogos.ler({ pessoa: ana, id: 'x' });
    expect(contasPorPrefixo('partida:')).toEqual([]);
    const contas = ['pessoa:ana', 'pessoa:caio', 'agente:bia', 'agente:cida'].map((k) => saldoDe(k));
    for (const c of contas) expect(c).toBeGreaterThanOrEqual(0);
    expect(contas.reduce((x, y) => x + y, 0)).toBe(total);
    expect(totalGeral()).toBe(total);
  });
  it('guarda exatamente 50 partidas encerradas e remove as mais antigas', () => {
    const { jogos, t } = montar();
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      t.v += 11_000;
      const a = abrir(jogos, ana, 5, 'bia');
      expect(a.ok).toBe(true);
      ids.push(a.id);
      const f = i % 2 ? ganha : perde;
      f(jogos, a.id, 1, ana); f(jogos, a.id, 2, ana);
    }
    jogos.ler({ pessoa: ana, id: 'x' });
    expect(Object.keys(lerArquivo().partidas)).toEqual(ids.slice(10));
  });
});

describe('recuperação', () => {
  it('refaz o pagamento de partida encerrada com pago:false, uma única vez', () => {
    const { jogos } = montar();
    tocar();
    reservar('p1');
    gravar({ p1: registro('p1', { estado: 'encerrada', resultado: 'pessoa', pago: false }) });
    expect(jogos.ler({ pessoa: ana, id: 'p1' })).toMatchObject({ ok: true, estado: 'encerrada', saldo: SALDO_INICIAL + 10 });
    const extrato = extratoDe(chavePessoa('Ana')).length;
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL - 10);
    expect(jogos.ler({ pessoa: ana, id: 'p1' }).saldo).toBe(SALDO_INICIAL + 10);
    expect(extratoDe(chavePessoa('Ana')).length).toBe(extrato);
    expect(contaDe(chavePessoa('Ana')).ganhou).toBe(10);
    expect(lerArquivo().partidas.p1.pago).toBe(true);
    expect(saldoDe('partida:p1')).toBe(0);
  });
  it('refaz a devolução de partida expirada com pago:false, uma única vez', () => {
    const { jogos } = montar();
    tocar();
    reservar('p2');
    gravar({ p2: registro('p2', { estado: 'expirada', pago: false }) });
    jogos.ler({ pessoa: ana, id: 'p2' });
    jogos.ler({ pessoa: ana, id: 'p2' });
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL);
    expect(totalGeral()).toBe(4 * SALDO_INICIAL);
  });
  it('partida "reservando" devolve só a perna que foi reservada', () => {
    const { jogos } = montar();
    tocar();
    reservar('p3', ['pessoa']);
    gravar({ p3: registro('p3', { estado: 'reservando' }) });
    jogos.ler({ pessoa: ana, id: 'x' });
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL);
    expect(lerArquivo().partidas.p3).toBeUndefined();
    expect(abrir(jogos).ok).toBe(true); // pessoa e agente seguem livres
  });
  it('partida "reservando" com as duas pernas devolve as duas', () => {
    const { jogos } = montar();
    tocar();
    reservar('p4');
    gravar({ p4: registro('p4', { estado: 'reservando' }) });
    jogos.ler({ pessoa: ana, id: 'x' });
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL);
    expect(lerArquivo().partidas.p4).toBeUndefined();
  });
  it('registro malformado é descartado e a moeda da conta órfã volta a quem a colocou', () => {
    const { jogos } = montar();
    tocar();
    reservar('p5');
    reservar('p6');
    gravar({ p5: registro('p5', { rodadas: 'lixo' }), p6: null }); // p6: sem registro algum
    expect(jogos.ler({ pessoa: ana, id: 'p5' })).toMatchObject({ ok: false, status: 404 });
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
    expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL);
    expect(contasPorPrefixo('partida:')).toEqual([]);
  });
  it('se a segunda reserva falha (422 ou exceção), a primeira volta e nada fica preso', () => {
    for (const modo of ['422', 'throw']) {
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
      const falha = (a: any) => {
        if (String(a.id).endsWith(':reserva:agente')) { if (modo === 'throw') throw new Error('disco'); return { ok: false, status: 422, error: 'saldo insuficiente' }; }
        return mover(a);
      };
      const { jogos } = montar({ mover: falha });
      tocar();
      expect(abrir(jogos).ok).toBe(false);
      expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
      expect(saldoDe(chaveAgente('bia'))).toBe(SALDO_INICIAL);
      expect(contasPorPrefixo('partida:')).toEqual([]);
      expect(Object.keys(lerArquivo().partidas)).toEqual([]);
      expect(abrir(montar().jogos).ok).toBe(true); // pessoa e agente livres
    }
  });
});

describe('intervalo e estado', () => {
  it('o intervalo de 10 s conta também do fim da partida', () => {
    const { jogos, t } = montar();
    const a = abrir(jogos);
    t.v += 100_000;
    ganha(jogos, a.id, 1); ganha(jogos, a.id, 2);
    t.v += 5_000;
    expect(abrir(jogos)).toMatchObject({ ok: false, status: 429 });
    t.v += 5_000;
    expect(abrir(jogos).ok).toBe(true);
  });
  it('o intervalo de 10 s conta também da expiração', () => {
    const { jogos, t } = montar();
    abrir(jogos);
    t.v += 200_000;
    expect(abrir(jogos)).toMatchObject({ ok: false, status: 429 });
    t.v += 10_000;
    expect(abrir(jogos).ok).toBe(true);
  });
  it('partida encerrada ou expirada não anuncia próxima rodada', () => {
    const { jogos, t } = montar();
    const a = abrir(jogos);
    expect(jogos.ler({ pessoa: ana, id: a.id }).rodada).toBe(1);
    ganha(jogos, a.id, 1); ganha(jogos, a.id, 2);
    expect(jogos.ler({ pessoa: ana, id: a.id }).rodada).toBeNull();
    t.v += 20_000;
    const b = abrir(jogos);
    t.v += 200_000;
    expect(jogos.ler({ pessoa: ana, id: b.id }).rodada).toBeNull();
  });
  it('getAgent ou agenteOcioso assíncronos são recusados', () => {
    expect(() => abrir(montar({ getAgent: () => Promise.resolve({}) }).jogos)).toThrow(/síncron/);
    expect(() => abrir(montar({ ocioso: () => Promise.resolve(true) }).jogos)).toThrow(/síncron/);
    expect(saldoDe(chavePessoa('Ana'))).toBe(SALDO_INICIAL);
  });
});
