import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { attachmentsOf, kindOf, openById, resolveFile, saveFile } from './entregas.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { deliveriesFrom } from './deliveries.mjs';

let dir = '';
const oldData = config.data;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-entregas-')); config.data = dir; });
afterAll(() => { config.data = oldData; fs.rmSync(dir, { recursive: true, force: true }); });

describe('arquivos de entrega', () => {
  it('grava em data/entregas/<tarefa>/ e abre pelo id opaco', () => {
    const r = saveFile('t1', 'banner.png', Buffer.from('PNG'));
    expect(r).toMatchObject({ ok: true, kind: 'image' });
    expect(fs.readFileSync(path.join(dir, 'entregas', 't1', 'banner.png'), 'utf8')).toBe('PNG');
    const f = openById(r.id);
    expect(f).toMatchObject({ name: 'banner.png', mime: 'image/png', size: 3, kind: 'image' });
    expect(f.path.startsWith(path.join(dir, 'entregas'))).toBe(true);
  });

  it('classifica imagem, PDF, vídeo, planilha; svg só baixa', () => {
    expect(kindOf('a.PDF')).toBe('pdf');
    expect(kindOf('a.mp4')).toBe('video');
    expect(kindOf('a.xlsx')).toBe('file');
    expect(kindOf('a.svg')).toBe('file');
    expect(kindOf('a.csv')).toBe('text');
  });

  it('recusa caminho fora da pasta (.., barras, unidade, tarefa inválida)', () => {
    const bs = String.fromCharCode(92);
    for (const [t, n] of [['t1', '../x.txt'], ['t1', `..${bs}x.txt`], ['t1', 'a/b.txt'], ['..', 'x.txt'], ['t1/..', 'x.txt'], ['t1', '..'], ['t1', 'C:evil.txt'], ['', 'x.txt']]) {
      expect(resolveFile(t, n)).toBeNull();
      expect(saveFile(t, n, Buffer.from('x'))).toMatchObject({ ok: false, status: 400 });
    }
    expect(fs.existsSync(path.join(dir, 'x.txt'))).toBe(false);
  });

  it('id forjado para fora da pasta não abre nada', () => {
    expect(openById(Buffer.from('t1/../../agents.json').toString('base64url'))).toBeNull();
    expect(openById('lixo')).toBeNull();
    expect(openById('../../agents')).toBeNull();
    expect(openById('a'.repeat(40))).toBeNull();
  });

  it('o id é hexadecimal fixo (formato que o cliente aceita) e não revela o caminho', () => {
    const { id } = saveFile('t1', 'foto.jpg', Buffer.from('JPG'));
    expect(id).toMatch(/^[a-f0-9]{40}$/);
    expect(openById(id)).toMatchObject({ name: 'foto.jpg', mime: 'image/jpeg' });
  });

  it('arquivo vazio é recusado', () => {
    expect(saveFile('t1', 'v.txt', Buffer.alloc(0))).toMatchObject({ ok: false, status: 400 });
  });

  it('a entrega da tarefa lista os arquivos, mesmo sem texto de resultado', () => {
    saveFile('t2', 'relatorio.pdf', Buffer.from('%PDF'));
    expect(attachmentsOf('t2')).toMatchObject([{ name: 'relatorio.pdf', kind: 'pdf' }]);
    const agents = [{ id: 'ana', name: 'Ana', account: 'principal' }];
    const base = { agent: 'ana', title: 'Relatório', text: 'Relatório', state: 'done', addedAt: 1, doneAt: 5 };
    const out = deliveriesFrom([{ ...base, id: 't2' }, { ...base, id: 't3' }], agents, []);
    expect(out).toHaveLength(1);
    expect(out[0].attachments[0]).toMatchObject({ name: 'relatorio.pdf', kind: 'pdf' });
    expect(out[0].agentName).toBe('Ana');
  });
});
