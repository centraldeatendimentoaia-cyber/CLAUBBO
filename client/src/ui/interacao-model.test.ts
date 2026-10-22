import { describe, expect, it } from 'vitest';
import { aparenciaDoJogador, criarGuarda, MENSAGEM_SEM_ELEVADOR, mensagemDaFalha, menuDoAgente, menuDoElevador } from './interacao-model';

const base = { model: 'sonnet', provider: 'claude', status: 'idle', ocioso: true, obrigadoPossivel: true };
const por = (itens: ReturnType<typeof menuDoAgente>, acao: string) => itens.find((i) => i.acao === acao)!;

describe('menuDoAgente', () => {
  it('agente sonnet ocioso: seis itens na ordem do spec, todos habilitados', () => {
    const m = menuDoAgente(base);
    expect(m.map((i) => i.acao)).toEqual(['conversar', 'desafiar', 'btw', 'agradecer', 'subir', 'descer']);
    expect(m.map((i) => i.atalho)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(m.every((i) => i.habilitado && !i.motivo)).toBe(true);
  });

  it('agente trabalhando: desafiar apagado com motivo', () => {
    const d = por(menuDoAgente({ ...base, status: 'working', ocioso: false }), 'desafiar');
    expect(d.habilitado).toBe(false);
    expect(d.motivo).toBe('só agente ocioso');
  });

  it('saldo conhecido abaixo de 5: desafiar apagado com motivo; desconhecido ou >= 5 fica habilitado', () => {
    const d = (saldoPessoa?: number | null) => por(menuDoAgente({ ...base, saldoPessoa }), 'desafiar');
    expect(d(4)).toMatchObject({ habilitado: false, motivo: 'sem moedas' });
    expect(d(0).habilitado).toBe(false);
    expect(d(5).habilitado).toBe(true);
    expect(d(null).habilitado).toBe(true);
    expect(d(undefined).habilitado).toBe(true);
  });

  it('agente ocupado vence o motivo de saldo', () => {
    expect(por(menuDoAgente({ ...base, ocioso: false, saldoPessoa: 0 }), 'desafiar').motivo).toBe('só agente ocioso');
  });

  it('sem resultado novo: agradecer apagado', () => {
    const a = por(menuDoAgente({ ...base, obrigadoPossivel: false }), 'agradecer');
    expect(a.habilitado).toBe(false);
    expect(a.motivo).toBe('sem resultado novo');
  });

  it('fable já no topo; haiku já na base', () => {
    const topo = por(menuDoAgente({ ...base, model: 'fable' }), 'subir');
    expect(topo.habilitado).toBe(false);
    expect(topo.motivo).toBe('já no topo');
    const base_ = por(menuDoAgente({ ...base, model: 'haiku' }), 'descer');
    expect(base_.habilitado).toBe(false);
    expect(base_.motivo).toBe('já na base');
  });

  it('modelo fora da escada ou ausente: subir e descer apagados', () => {
    for (const model of ['xyz', undefined]) {
      const m = menuDoAgente({ ...base, model });
      for (const a of ['subir', 'descer']) {
        expect(por(m, a).habilitado).toBe(false);
        expect(por(m, a).motivo).toBe('modelo fora da escada');
      }
    }
  });

  it('rótulos mostram origem e destino', () => {
    const m = menuDoAgente({ ...base, model: 'opus' });
    expect(por(m, 'subir').rotulo).toContain('opus → fable');
    expect(por(m, 'descer').rotulo).toContain('opus → sonnet');
  });

  it('codex segue a escada do codex', () => {
    const m = menuDoAgente({ ...base, model: 'gpt-5.2-codex', provider: 'codex' });
    expect(por(m, 'subir').rotulo).toContain('gpt-5.2-codex → gpt-5.3-codex');
    expect(por(menuDoAgente({ ...base, model: 'opus', provider: 'codex' }), 'subir').habilitado).toBe(false);
  });
});

describe('menuDoElevador', () => {
  const andares = [
    { andar: 1, nome: 'Recepção', temElevador: true },
    { andar: 2, nome: 'Terminais', temElevador: true },
    { andar: 3, nome: 'Sem elevador', temElevador: false },
  ];

  it('lista só andares com elevador e marca o atual', () => {
    const m = menuDoElevador(andares, 1);
    expect(m.map((i) => i.rotulo)).toEqual(['Andar 1 — Recepção', 'Andar 2 — Terminais']);
    expect(m[0]).toMatchObject({ habilitado: false, motivo: 'você está aqui' });
    expect(m[1].habilitado).toBe(true);
    expect(m.map((i) => i.atalho)).toEqual(['1', '2']);
    expect(m.map((i) => i.andar)).toEqual([1, 2]);
  });

  it('andar sem nome mostra só Andar N', () => {
    expect(menuDoElevador([{ andar: 4, nome: '', temElevador: true }], 1)[0].rotulo).toBe('Andar 4');
  });

  it('sem nenhum andar com elevador: lista vazia e mensagem', () => {
    const m = menuDoElevador([{ andar: 1, nome: 'A', temElevador: false }], 1);
    expect(m).toEqual([]);
    expect(MENSAGEM_SEM_ELEVADOR).toBe('Nenhum andar com elevador.');
  });
});

describe('mensagemDaFalha', () => {
  it('409 na troca de modelo avisa que já mudou', () => {
    expect(mensagemDaFalha('subir', 409, 'x')).toContain('já mudou');
    expect(mensagemDaFalha('descer', 409, 'x')).toContain('já mudou');
  });
  it('409 ao agradecer mostra a mensagem do servidor (com o nome de quem agradeceu)', () => {
    expect(mensagemDaFalha('agradecer', 409, 'já agradecido por Ana')).toBe('já agradecido por Ana');
  });
  it('403 mostra o motivo do servidor; sem rede avisa', () => {
    expect(mensagemDaFalha('btw', 403, 'sem permissão')).toBe('sem permissão');
    expect(mensagemDaFalha('btw', 0, '')).toBe('Sem conexão com o servidor.');
  });
});

describe('agradecer carregando', () => {
  it('enquanto a lista não chegou, o motivo é carregando e não sem resultado novo', () => {
    const a = por(menuDoAgente({ ...base, obrigadoPossivel: false, carregando: true }), 'agradecer');
    expect(a.habilitado).toBe(false);
    expect(a.motivo).toBe('carregando…');
  });
});

describe('criarGuarda', () => {
  it('ignora disparos enquanto uma chamada está em voo e libera depois', async () => {
    const g = criarGuarda();
    let solta!: (v: string) => void;
    const primeira = g.rodar(() => new Promise<string>((r) => (solta = r)));
    expect(g.ativo).toBe(true);
    expect(await g.rodar(async () => 'segunda')).toEqual({ rodou: false });
    solta('ok');
    expect(await primeira).toEqual({ rodou: true, valor: 'ok' });
    expect(g.ativo).toBe(false);
    expect(await g.rodar(async () => 'terceira')).toEqual({ rodou: true, valor: 'terceira' });
  });
  it('libera mesmo se a chamada falhar', async () => {
    const g = criarGuarda();
    await expect(g.rodar(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(g.ativo).toBe(false);
  });
});

describe('aparenciaDoJogador', () => {
  it('usa o me do World quando existe', () => {
    expect(aparenciaDoJogador({ name: 'Ana', look: 'f', parts: {} as never })).toMatchObject({ name: 'Ana', look: 'f' });
  });
  it('o personagem editado na equipe vale mais que o do World; sem edição, não muda nada', () => {
    const parts = { hairStyle: 'bob' } as never;
    const world = { name: 'Ana', look: 'f' as const };
    expect(aparenciaDoJogador(world, undefined, { rotulo: 'JMAL', look: 'm', parts, custom: true })).toEqual({ name: 'JMAL', look: 'm', parts });
    expect(aparenciaDoJogador(world, undefined, { rotulo: 'JMAL', look: 'm', parts, custom: false })).toEqual(world);
  });
  it('sem World: padrão estável por nome, sem parts', () => {
    const a = aparenciaDoJogador(undefined, 'Rui');
    expect(a).toEqual(aparenciaDoJogador(undefined, 'Rui'));
    expect(a.name).toBe('Rui');
    expect(['f', 'm']).toContain(a.look);
    expect(a.parts).toBeUndefined();
  });
  it('sem nome: Você', () => {
    expect(aparenciaDoJogador().name).toBe('Você');
    expect(aparenciaDoJogador(undefined, '  ').name).toBe('Você');
  });
});
