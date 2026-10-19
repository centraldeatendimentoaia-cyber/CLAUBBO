import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { BACKOFF_MS, createSystems, MAX_ATTEMPTS } from './systems.mjs';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  constructor(public pid: number) { super(); }
}

function setup(agents: any[]) {
  let t = 1_000_000;
  const open = new Set<number>(); // portas "abertas"
  const urlUp = { v: true };
  const spawned: { command: string; opts: any; child: FakeChild }[] = [];
  const killed: number[] = [];
  const events: any[] = [];
  let pid = 100;
  const sys = createSystems({
    getAgents: () => agents,
    notify: async (e: any) => { events.push(e); },
    spawn: (command: string, opts: any) => { const child = new FakeChild(++pid); spawned.push({ command, opts, child }); return child; },
    probe: { port: async (p: number) => open.has(p), url: async () => urlUp.v },
    kill: async (p: number) => { killed.push(p); },
    portPid: async () => null,
    now: () => t,
  });
  return { sys, open, urlUp, spawned, killed, events, advance: (ms: number) => { t += ms; } };
}

const local = (extra: object = {}) => ({ id: 'loja', name: 'Ana', system: { type: 'local', name: 'Loja', folder: 'D:/proj/loja', command: 'npm start', port: 3000, autoRestart: true, ...extra } });

describe('ligar e desligar', () => {
  it('liga com o comando e a pasta da configuração; os logs aparecem; no ar quando a porta abre', async () => {
    const c = setup([local()]);
    expect(await c.sys.start('loja')).toEqual({ ok: true });
    expect(c.spawned).toHaveLength(1);
    expect(c.spawned[0].command).toBe('npm start');
    expect(c.spawned[0].opts.cwd).toBe('D:/proj/loja');
    c.spawned[0].child.stdout.emit('data', 'servidor ouvindo na 3000\n');
    c.spawned[0].child.stderr.emit('data', '\x1b[31maviso\x1b[0m\n');
    expect(c.sys.logs('loja')).toEqual(expect.arrayContaining(['servidor ouvindo na 3000', 'aviso']));
    expect(c.sys.view('loja')?.state).toBe('restarting');
    c.open.add(3000);
    await c.sys.tick();
    expect(c.sys.view('loja')).toMatchObject({ state: 'up', desired: true });
  });
  it('se a porta já está aberta, não sobe outro processo', async () => {
    const c = setup([local()]);
    c.open.add(3000);
    expect(await c.sys.start('loja')).toEqual({ ok: true, already: true });
    expect(c.spawned).toHaveLength(0);
  });
  it('só aceita agente com sistema local; id de agente é tudo que recebe (nunca um comando)', async () => {
    const c = setup([{ id: 'v', name: 'V', system: { type: 'visual' } }, { id: 'u', name: 'U', system: { type: 'url', url: 'https://x.com' } }, { id: 'n', name: 'N' }]);
    for (const id of ['v', 'u', 'n', 'nao-existe']) expect((await c.sys.start(id)).ok).toBe(false);
    expect(c.spawned).toHaveLength(0);
  });
  it('desligar mata o processo e cancela o reerguer', async () => {
    const c = setup([local()]);
    await c.sys.start('loja');
    c.open.add(3000);
    await c.sys.tick();
    expect(await c.sys.stop('loja')).toEqual({ ok: true });
    expect(c.killed).toEqual([c.spawned[0].child.pid]);
    c.open.delete(3000);
    await c.sys.tick();
    await c.sys.tick();
    expect(c.spawned).toHaveLength(1); // não reergueu
    expect(c.events).toEqual([]);
    expect(c.sys.view('loja')).toMatchObject({ state: 'down', desired: false });
  });
});

describe('monitor e reerguer', () => {
  it('sistema que nunca esteve no ar nem foi ligado não é "queda": nada sobe', async () => {
    const c = setup([local()]);
    await c.sys.tick();
    await c.sys.tick();
    expect(c.spawned).toHaveLength(0);
    expect(c.sys.view('loja')?.state).toBe('down');
  });
  it('caiu: tenta sozinho com o comando cadastrado, e avisa "voltou" quando volta', async () => {
    const c = setup([local()]);
    c.open.add(3000);
    await c.sys.tick(); // viu no ar: passa a vigiar
    c.open.delete(3000); // caiu
    await c.sys.tick();
    expect(c.spawned).toHaveLength(1);
    expect(c.spawned[0].command).toBe('npm start');
    expect(c.sys.view('loja')?.state).toBe('restarting');
    c.open.add(3000); // a tentativa funcionou
    await c.sys.tick();
    expect(c.events).toEqual([{ type: 'system_back', agent: 'Ana', system: 'Loja' }]);
    expect(c.sys.view('loja')).toMatchObject({ state: 'up', attempts: 0 });
  });
  it('3 tentativas com espera crescente; não voltou: avisa uma vez e para de tentar', async () => {
    const c = setup([local()]);
    c.open.add(3000);
    await c.sys.tick();
    c.open.delete(3000);
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      await c.sys.tick();
      expect(c.spawned).toHaveLength(i);
      c.spawned[i - 1].child.emit('exit', 1); // a tentativa morreu
      await c.sys.tick();
      expect(c.spawned).toHaveLength(i); // ainda esperando a espera crescente
      c.advance(BACKOFF_MS[i - 1] + 1);
    }
    await c.sys.tick();
    await c.sys.tick();
    expect(c.spawned).toHaveLength(MAX_ATTEMPTS);
    expect(c.events).toEqual([{ type: 'system_failed', agent: 'Ana', system: 'Loja' }]);
    expect(c.sys.view('loja')).toMatchObject({ state: 'down', desired: false });
    c.advance(10 * 60_000);
    await c.sys.tick();
    expect(c.spawned).toHaveLength(MAX_ATTEMPTS); // parou de vez
    expect(c.events).toHaveLength(1);
  });
  it('processo recém-ligado tem tempo para abrir a porta (não sobe um segundo por cima)', async () => {
    const c = setup([local()]);
    await c.sys.start('loja');
    await c.sys.tick();
    c.advance(10_000);
    await c.sys.tick();
    expect(c.spawned).toHaveLength(1);
  });
  it('autoRestart desligado: monitora mas não sobe sozinho', async () => {
    const c = setup([local({ autoRestart: false })]);
    c.open.add(3000);
    await c.sys.tick();
    c.open.delete(3000);
    await c.sys.tick();
    expect(c.spawned).toHaveLength(0);
    expect(c.sys.view('loja')?.state).toBe('down');
  });
  it('URL externa só avisa (caiu, voltou) e nunca sobe processo', async () => {
    const c = setup([{ id: 'site', name: 'Bia', system: { type: 'url', name: 'Site', url: 'https://exemplo.com' } }]);
    await c.sys.tick(); // no ar
    c.urlUp.v = false;
    await c.sys.tick();
    await c.sys.tick();
    c.urlUp.v = true;
    await c.sys.tick();
    expect(c.events).toEqual([{ type: 'url_down', agent: 'Bia', system: 'Site' }, { type: 'url_back', agent: 'Bia', system: 'Site' }]);
    expect(c.spawned).toHaveLength(0);
  });
  it('URL que já estava fora do ar quando o escritório ligou não gera "voltou" falso', async () => {
    const c = setup([{ id: 'site', name: 'Bia', system: { type: 'url', name: 'Site', url: 'https://exemplo.com' } }]);
    c.urlUp.v = false;
    await c.sys.tick();
    c.urlUp.v = true;
    await c.sys.tick();
    expect(c.events).toEqual([]);
  });
  it('o aviso leva só os nomes (nunca pasta, comando ou log)', async () => {
    const c = setup([local()]);
    c.open.add(3000);
    await c.sys.tick();
    c.open.delete(3000);
    for (let i = 1; i <= MAX_ATTEMPTS; i++) { await c.sys.tick(); c.spawned[i - 1].child.emit('exit', 1); c.advance(BACKOFF_MS[i - 1] + 1); }
    await c.sys.tick();
    expect(JSON.stringify(c.events)).not.toMatch(/proj|npm start/);
  });
});
