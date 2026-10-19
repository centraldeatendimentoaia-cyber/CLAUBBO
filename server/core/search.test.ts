import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { foldQuery, loadSources, searchAll, snippetOf } from './search.mjs';

const names = { ana: 'Ana', bia: 'Bia' };
const src = {
  chat: [{ agent: 'ana', messages: [{ at: 100, who: 'user', text: 'Qual o Orçamento do salão?' }, { at: 300, who: 'agent', text: 'O orçamento fechou em R$ 500.' }] }],
  archive: [{ agent: 'bia', messages: [{ at: 50, who: 'agent', text: 'Falamos do ORCAMENTO antigo' }] }],
  tasks: [{ id: 't1', agent: 'ana', title: 'x', text: 'x', result: 'Entrega: orçamento aprovado', doneAt: 200, addedAt: 10 }],
  activity: [{ at: 400, agent: 'bia', text: 'Bia: revisou o orçamento' }],
};

describe('busca global', () => {
  it('ignora acento e maiúsculas, em conversas, arquivo morto, entregas e atividade, do mais novo ao mais antigo', () => {
    const r = searchAll('orcamento', src, names);
    expect(r.ok).toBe(true);
    expect(r.results.map((x: any) => x.kind)).toEqual(['atividade', 'conversa', 'entrega', 'conversa', 'conversa']);
    expect(r.results.map((x: any) => x.at)).toEqual([400, 300, 200, 100, 50]);
    expect(r.results[0]).toMatchObject({ agent: 'bia', agentName: 'Bia' });
    expect(r.total).toBe(5);
  });
  it('o trecho traz a frase e o acento original', () => {
    const s = snippetOf('Qual o Orçamento do salão?', foldQuery('orcamento'));
    expect(s.match).toBe('Orçamento');
    expect(s.before).toBe('Qual o ');
  });
  it('mínimo de 2 caracteres e limite respeitado', () => {
    expect(searchAll('o', src, names).ok).toBe(false);
    expect(searchAll(' ', src, names).ok).toBe(false);
    expect(searchAll('orcamento', src, names, 2).results).toHaveLength(2);
  });
  it('segredos óbvios nunca são devolvidos nem encontrados', () => {
    const s = { chat: [{ agent: 'ana', messages: [{ at: 1, who: 'user', text: 'minha chave sk-ant-abcdefghij1234567890 e senha: hunter2abc' }] }], archive: [], tasks: [], activity: [] };
    const r = searchAll('chave', s, names);
    const text = JSON.stringify(r.results);
    expect(text).not.toContain('sk-ant-abcdefghij');
    expect(text).not.toContain('hunter2abc');
    expect(text).toContain('[segredo omitido]');
    expect(searchAll('abcdefghij', s, names).results).toHaveLength(0);
  });
  it('lê as fontes do disco e ignora arquivo estragado', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-search-'));
    fs.mkdirSync(path.join(dir, 'chat', 'arquivo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'chat', 'ana.json'), JSON.stringify({ agent: 'ana', messages: [{ at: 1, who: 'user', text: 'promoção de inverno' }] }));
    fs.writeFileSync(path.join(dir, 'chat', 'quebrado.json'), '{ não é json');
    fs.writeFileSync(path.join(dir, 'chat', 'arquivo', 'bia.jsonl'), `${JSON.stringify({ at: 2, who: 'agent', text: 'Promocao antiga' })}\nlinha ruim\n`);
    fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify([{ id: 'k', agent: 'ana', title: 'Promoção', text: 'a', addedAt: 3 }]));
    const r = searchAll('promocao', loadSources(dir), names);
    expect(r.results.map((x: any) => x.kind).sort()).toEqual(['conversa', 'conversa', 'entrega']);
  });
});
