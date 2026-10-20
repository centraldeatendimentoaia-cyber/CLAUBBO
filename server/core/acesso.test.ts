import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { confirmHuman, hostAllowed, loadAccess, resetConfirm, roleOf, sessionCookie } from './acesso.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { cleanCommand, cleanFolder, cleanSystem } from './system-config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { createBackup } from './backup.mjs';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-acesso-'));
afterAll(() => fs.rmSync(data, { recursive: true, force: true }));
const req = (headers: Record<string, string>) => ({ headers });

describe('token por instalação', () => {
  it('nasce na primeira execução, fica em data/acesso.json e é o mesmo na seguinte', () => {
    const a = loadAccess(data);
    expect(a.pagina).toMatch(/^[0-9a-f]{64}$/); expect(a.agentes).toMatch(/^[0-9a-f]{64}$/); expect(a.pagina).not.toBe(a.agentes);
    expect(fs.existsSync(path.join(data, 'acesso.json'))).toBe(true);
    expect(loadAccess(data)).toEqual(a);
  });
  it('arquivo estragado gera tokens novos', () => {
    const a = loadAccess(data);
    fs.writeFileSync(path.join(data, 'acesso.json'), '{ não é json');
    expect(loadAccess(data).pagina).not.toBe(a.pagina);
  });
  it('quem é quem: cookie ou cabeçalho da página, cabeçalho dos agentes, o resto é ninguém', () => {
    const a = loadAccess(data);
    expect(roleOf(req({ cookie: `outro=1; v2_token_4530=${a.pagina}` }), a, 4530)).toBe('pagina');
    expect(roleOf(req({ cookie: `v2_token_4531=${a.pagina}` }), a, 4530)).toBeNull(); // cookie de outro Escritório (outra porta)
    expect(roleOf(req({ 'x-v2-token': a.pagina }), a, 4530)).toBe('pagina');
    expect(roleOf(req({ 'x-v2-agente': a.agentes }), a, 4530)).toBe('agentes');
    expect(roleOf(req({ 'x-v2-token': a.agentes }), a, 4530)).toBeNull(); // o token dos agentes não passa por token de página
    expect(roleOf(req({ 'x-v2-token': 'x'.repeat(64) }), a, 4530)).toBeNull();
    expect(roleOf(req({}), a, 4530)).toBeNull();
  });
  it('o cookie é HttpOnly e SameSite=Strict', () => {
    expect(sessionCookie({ pagina: 'abc' }, 4530)).toBe('v2_token_4530=abc; HttpOnly; SameSite=Strict; Path=/');
  });
  it('o backup não leva os tokens', () => {
    loadAccess(data);
    const b = createBackup(data, Date.parse('2026-10-19T10:00:00'));
    expect(fs.existsSync(path.join(data, 'backups', b.name, 'acesso.json'))).toBe(false);
  });
});

describe('Host', () => {
  it('aceita só 127.0.0.1, localhost e [::1] com a porta do servidor', () => {
    for (const h of ['127.0.0.1:4530', 'localhost:4530', 'LOCALHOST:4530', '[::1]:4530']) expect(hostAllowed(h, 4530), h).toBe(true);
    for (const h of ['evil.example:4530', 'evil.example', '127.0.0.1', '127.0.0.1:4531', 'localhost.evil.example:4530', '127.0.0.1.evil.example:4530', '', undefined]) expect(hostAllowed(h, 4530), String(h)).toBe(false);
  });
});

describe('confirmação humana', () => {
  beforeEach(() => resetConfirm());
  it('só o "sim" da janela libera; "não" e expirar recusam', async () => {
    expect(await confirmHuman('ok?', { mode: 'dialogo', run: async () => true, platform: 'win32' })).toEqual({ ok: true });
    const no = await confirmHuman('ok?', { mode: 'dialogo', run: async () => false, platform: 'win32' });
    expect(no).toMatchObject({ ok: false, status: 403 });
  });
  it('depois de um "não" espera antes de abrir outra janela (sem enxurrada)', async () => {
    let calls = 0; let t = 1000;
    const run = async () => { calls++; return false; };
    await confirmHuman('a', { mode: 'dialogo', run, now: () => t, platform: 'win32' });
    expect(await confirmHuman('b', { mode: 'dialogo', run, now: () => t + 1000, platform: 'win32' })).toMatchObject({ ok: false, status: 429 });
    expect(calls).toBe(1);
    t += 25_000;
    await confirmHuman('c', { mode: 'dialogo', run, now: () => t, platform: 'win32' });
    expect(calls).toBe(2);
  });
  it('uma janela por vez', async () => {
    let release: (v: boolean) => void = () => {};
    const first = confirmHuman('a', { mode: 'dialogo', run: () => new Promise<boolean>((r) => { release = r; }), platform: 'win32' });
    expect(await confirmHuman('b', { mode: 'dialogo', run: async () => true, platform: 'win32' })).toMatchObject({ ok: false, status: 409 });
    release(true);
    expect(await first).toEqual({ ok: true });
  });
  it('fora do Windows não há janela: recusa em vez de liberar', async () => {
    expect(await confirmHuman('a', { mode: 'dialogo', platform: 'linux' })).toMatchObject({ ok: false, status: 501 });
  });
  it('modos de teste: nao recusa, sim libera', async () => {
    expect(await confirmHuman('a', { mode: 'nao' })).toMatchObject({ ok: false, status: 403 });
    expect(await confirmHuman('a', { mode: 'sim' })).toEqual({ ok: true });
  });
});

describe('comando de subir (lista permitida)', () => {
  it.each(['npm start', 'npm run dev', 'node server.js', 'python -m http.server', 'node .\\server\\app.js --port=3000', 'NPM.CMD run build'])('aceita %s', (c) => {
    expect(cleanCommand(c).ok, c).toBe(true);
  });
  it.each([
    ['calc', /fora da lista/], ['powershell -c x', /fora da lista/], ['cmd /c dir', /fora da lista/], ['curl http://evil.example', /fora da lista/], ['npx vite', /fora da lista/],
    ['C:\\Windows\\System32\\calc.exe', /sem caminho/], ['./run.sh', /sem caminho/],
    ['npm start & calc', /caractere de shell/], ['npm start | more', /caractere de shell/], ['npm start; calc', /caractere de shell/], ['npm start > x.txt', /caractere de shell/],
    ['node server.js `calc`', /caractere de shell/], ['node $(calc)', /caractere de shell/], ['npm start %COMSPEC%', /caractere de shell/], ['node "a b.js"', /caractere de shell/], ['npm start\ncalc', /caractere de shell/],
    ['node -e x', /código passado/], ['python -c import-os', /código passado/], ['node --eval x', /código passado/],
    ['npm exec evil', /baixa e roda/], ['pnpm dlx evil', /baixa e roda/],
    ['', /obrigatório/], ['npm ' + 'x'.repeat(300), /obrigatório/],
  ])('recusa %s', (c, why) => {
    const r = cleanCommand(c);
    expect(r.ok, c).toBe(false);
    expect(r.error).toMatch(why);
  });
  it('V2_COMANDOS_PERMITIDOS acrescenta um programa à lista (só nome simples)', () => {
    process.env.V2_COMANDOS_PERMITIDOS = 'meuapp, ../x';
    try { expect(cleanCommand('meuapp --porta 3000').ok).toBe(true); expect(cleanCommand('../x y').ok).toBe(false); } finally { delete process.env.V2_COMANDOS_PERMITIDOS; }
  });
});

describe('pasta de projeto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-pasta-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  it('aceita caminho absoluto que existe', () => {
    expect(cleanFolder(dir)).toEqual({ ok: true, folder: path.normalize(dir) });
  });
  it.each([
    ['relativo/proj', /absoluto/], ['', /absoluto/],
    [path.join(os.tmpdir(), 'nao-existe-v2'), /não existe/],
    [`${os.tmpdir()}\\a&calc`, /não permitido/], [`${os.tmpdir()}/a;b`, /não permitido/], [`${os.tmpdir()}/a$(x)`, /não permitido/], [`${os.tmpdir()}/%TEMP%`, /não permitido/],
    [path.parse(os.tmpdir()).root, /raiz do disco/],
    [os.homedir(), /pasta pessoal/],
    ...(process.platform === 'win32' ? [['C:\\Windows\\System32', /pasta do sistema/], ['C:\\Program Files', /pasta do sistema/]] : [['/etc', /pasta do sistema/]]),
  ] as [string, RegExp][])('recusa %s', (p, why) => {
    const r = cleanFolder(p);
    expect(r.ok, p).toBe(false);
    expect(r.error).toMatch(why);
  });
  it('o cadastro do sistema usa as duas regras', () => {
    expect(cleanSystem({ type: 'local', folder: dir, command: 'npm start', port: 3000 }).ok).toBe(true);
    expect(cleanSystem({ type: 'local', folder: dir, command: 'calc', port: 3000 }).ok).toBe(false);
    expect(cleanSystem({ type: 'local', folder: `${dir}&x`, command: 'npm start', port: 3000 }).ok).toBe(false);
    // releitura do que já estava salvo não derruba o agente (o comando é conferido de novo ao subir)
    expect(cleanSystem({ type: 'local', folder: 'D:/proj/loja', command: 'calc', port: 3000 }, { checkFolder: false }).ok).toBe(true);
  });
});
