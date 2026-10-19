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
