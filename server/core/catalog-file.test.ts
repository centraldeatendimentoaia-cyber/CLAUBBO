import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { loadCatalog } from './catalog.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../catalog/agentes.json', import.meta.url), 'utf8')) as Array<Record<string, unknown>>;
// chaves aceitas pelo runner (toolsFor): web, chrome e o nome normalizado dos servidores MCP conhecidos
const KNOWN_TOOLS = new Set(['web', 'chrome', 'higgsfield', 'meta-ads', 'google-ads', 'supabase', 'saiae-crm', 'vercel']);

describe('catálogo de agentes (arquivo real)', () => {
  it('todos os itens passam na validação, sem repetir id', () => {
    const c = loadCatalog();
    expect(c).toHaveLength(raw.length);
    expect(new Set(c.map((a: { id: string }) => a.id)).size).toBe(raw.length);
  });
  it('só usa ferramentas que o runner conhece; agente dev não leva ferramentas de rede', () => {
    for (const a of loadCatalog() as Array<{ id: string; tools: string[]; type: string }>) {
      for (const t of a.tools) expect(KNOWN_TOOLS.has(t), `${a.id}: ${t}`).toBe(true);
      if (a.type === 'dev') expect(a.tools, a.id).toEqual([]);
    }
  });
  it('sem sistema, comando, fantasia ou segredo no arquivo', () => {
    const text = JSON.stringify(raw);
    for (const a of raw) expect(a, String(a.id)).not.toHaveProperty('system');
    expect(text).not.toMatch(/costume|"command"|sk-ant-|api[_-]?key\s*[:=]|password\s*[:=]/i);
  });
});

describe('catálogo ampliado', () => {
  const all = loadCatalog() as Array<{ id: string; category: string; brief: string; name: string; needs: string[]; tools: string[] }>;
  it('todo item cai numa categoria conhecida (nenhum foi rebaixado a "administrativo" por engano)', () => {
    const byId = new Map(raw.map((r) => [String(r.id), String(r.category)]));
    for (const a of all) expect(a.category, a.id).toBe(byId.get(a.id));
  });
  it('tem as áreas pedidas com a lista mínima', () => {
    const ids = new Set(all.map((a) => a.id));
    for (const id of ['gestor-meta-ads', 'gestor-google-ads', 'seo', 'social-media', 'ux-researcher', 'ui-designer', 'ux-writer', 'auditor-acessibilidade', 'copy-vendas', 'roteirista-reels', 'naming-slogans', 'redator-de-blog', 'sdr', 'atendimento-ao-cliente', 'financeiro', 'juridico', 'rh-recrutamento']) expect(ids.has(id), id).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(60);
  });
  it('instrução específica (comprimento e seções) e ferramenta de conta exige "needs"', () => {
    for (const a of all) {
      expect(a.brief.length, a.id).toBeGreaterThan(600);
      expect(a.brief, a.id).toMatch(/Missão:.*Como trabalha:.*Nunca:.*Quando pergunta ao dono:/s);
      for (const t of a.tools) if (['meta-ads', 'google-ads', 'supabase', 'saiae-crm', 'higgsfield', 'vercel'].includes(t)) expect(a.needs, `${a.id} usa ${t}`).toContain(t);
    }
  });
});
