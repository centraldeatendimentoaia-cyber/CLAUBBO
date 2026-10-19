import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { toolsFor, toolId } from './runner.mjs';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const server = (name: string) => ({ name, id: toolId(name), key: norm(name), status: 'connected' });
const servers = ['meta-ads', 'meta-ads-lavi', 'meta-ads-saiae', 'ads-meta', 'Meta_Ads', 'claude.ai Meta Ads', 'google-ads', 'saiae-crm', 'claude.ai Notion'].map(server);
const withTools = (...tools: string[]) => toolsFor({ tools }, servers, {});

describe('toolsFor: bloqueio de envio e de escritas', () => {
  it('solicitar_envio fica bloqueado por padrão, mesmo com o servidor liberado', () => {
    const r = withTools('saiae-crm');
    expect(r.allowed).toContain('mcp__saiae-crm__*');
    expect(r.denied).toContain('mcp__saiae-crm__solicitar_envio');
  });

  it('solicitar_envio não é liberado por data/tool-rules.json (só por tarefa)', () => {
    const r = toolsFor({ tools: ['saiae-crm'] }, servers, { allow: ['mcp__saiae-crm__solicitar_envio'] });
    expect(r.denied).toContain('mcp__saiae-crm__solicitar_envio');
  });

  it('escritas do Meta Ads ficam bloqueadas em qualquer servidor meta-ads*', () => {
    const r = withTools('meta-ads-lavi', 'meta-ads-saiae');
    expect(r.denied).toContain('mcp__meta-ads-lavi__create_meta_campaign');
    expect(r.denied).toContain('mcp__meta-ads-lavi__update_daily_budget');
    expect(r.denied).toContain('mcp__meta-ads-saiae__delete_campaign');
    expect(r.denied).toContain('mcp__meta-ads__pause_campaign');
    expect(r.denied).not.toContain('mcp__google-ads__create_meta_campaign');
  });

  it('qualquer variação de nome com meta e ads tem as escritas bloqueadas', () => {
    const r = withTools('ads-meta', 'Meta_Ads', 'claude.ai Meta Ads');
    for (const id of ['ads-meta', 'Meta_Ads', 'claude_ai_Meta_Ads']) {
      expect(r.denied).toContain(`mcp__${id}__create_meta_campaign`);
      expect(r.denied).toContain(`mcp__${id}__update_daily_budget`);
    }
    expect(r.allowed).toEqual(expect.arrayContaining(['mcp__ads-meta__*', 'mcp__Meta_Ads__*', 'mcp__claude_ai_Meta_Ads__*']));
    expect(r.denied).not.toContain('mcp__google-ads__pause_campaign');
  });

  it('liberar "ads" não libera meta-ads nem google-ads', () => {
    const r = withTools('ads');
    expect(r.allowed.some((t: string) => t.startsWith('mcp__'))).toBe(false);
    expect(r.servers).toEqual([]);
  });

  it('liberar "crm" não libera saiae-crm', () => {
    const r = withTools('crm');
    expect(r.allowed).not.toContain('mcp__saiae-crm__*');
    expect(r.servers).toEqual([]);
  });

  it('liberar o nome exato funciona, e só esse servidor', () => {
    const r = withTools('meta-ads-lavi', 'google-ads', 'notion');
    expect(r.allowed).toEqual(expect.arrayContaining(['mcp__meta-ads-lavi__*', 'mcp__google-ads__*', 'mcp__claude_ai_Notion__*']));
    expect(r.allowed).not.toContain('mcp__meta-ads__*');
    expect(r.allowed).not.toContain('mcp__meta-ads-saiae__*');
  });
});
