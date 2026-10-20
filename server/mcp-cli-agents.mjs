#!/usr/bin/env node
// Servidor MCP "cli-agents" (stdio): deixa os agentes do Escritório consultar e acionar os agentes de terminal
// (sessões do Claude Code abertas, o andar 2). Lista FECHADA de sete ferramentas:
//   listar_agentes_cli   leitura: quem está aberto, onde, fazendo o quê
//   ver_agente_cli       leitura: estado e últimas atividades de um deles
//   ler_resposta_agente_cli  leitura: texto das respostas dele, lido do transcript da sessão
//   propor_agente        NÃO cria: guarda uma proposta de agente novo; só o clique em APROVAR na página cria
//   chamar_agente        pede algo a outro agente do Escritório; o par precisa de OK do João (ou estar liberado)
//   acionar_agente_cli   NÃO envia: cria um pedido em "Pedidos aos terminais"; só o clique em APROVAR na página entrega
// Variáveis: BRIDGE_URL (padrão http://127.0.0.1:4530), AGENT_ID (quem está pedindo).
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import fs from 'node:fs';
import nodePath from 'node:path';
import { config } from './core/config.mjs';

const BRIDGE = process.env.BRIDGE_URL || 'http://127.0.0.1:4530';
const FROM = process.env.AGENT_ID || 'agente';

// Token dos agentes (data/acesso.json): só vale para criar pedidos e propostas, que esperam o clique do João. Relido a cada chamada.
const agentToken = () => { try { return JSON.parse(fs.readFileSync(nodePath.join(config.data, 'acesso.json'), 'utf8')).agentes || ''; } catch { return ''; } };

async function bridge(path, opts) {
  const r = await fetch(BRIDGE + path, { ...opts, headers: { 'content-type': 'application/json', 'x-v2-agente': agentToken() }, signal: AbortSignal.timeout(8000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `erro ${r.status}`);
  return body;
}

const id = v => { if (typeof v !== 'string' || !v.trim() || v.length > 120) throw new Error('agente: use um id devolvido por listar_agentes_cli'); return v; };

export const tools = [
  {
    name: 'listar_agentes_cli', description: 'Lista os agentes de terminal (sessões do Claude Code abertas): id, nome, sala (projeto), estado, atividade atual e se aceitam mensagem.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => bridge('/api/cli/agents'),
  },
  {
    name: 'ver_agente_cli', description: 'Estado e últimas atividades de um agente de terminal (id de listar_agentes_cli).',
    inputSchema: { type: 'object', properties: { agente: { type: 'string' } }, required: ['agente'], additionalProperties: false },
    run: async ({ agente }) => bridge(`/api/cli/agents/${encodeURIComponent(id(agente))}`),
  },
  {
    name: 'ler_resposta_agente_cli', description: 'LÊ o texto que um agente de terminal escreveu (id de listar_agentes_cli), direto do transcript da sessão: a última resposta completa (padrão) ou as últimas N mensagens. Funciona com o agente parado ("turno":"concluido") ou trabalhando ("em_andamento": devolve o que já foi escrito). Respostas grandes vêm cortadas em max_chars: use "proximo_inicio" como "inicio" (com ultimas=1) para continuar, ou "pular" para mensagens mais antigas. Só leitura; nada é gravado e segredos óbvios são omitidos.',
    inputSchema: { type: 'object', properties: {
      agente: { type: 'string' },
      ultimas: { type: 'integer', minimum: 1, maximum: 20, description: 'quantas mensagens do agente (padrão 1 = a última)' },
      pular: { type: 'integer', minimum: 0, description: 'pula as N mais recentes (para ler mais antigas)' },
      inicio: { type: 'integer', minimum: 0, description: 'só com ultimas=1: posição do caractere onde continuar uma resposta grande' },
      max_chars: { type: 'integer', minimum: 500, maximum: 60000, description: 'limite de caracteres devolvidos (padrão 20000)' },
      incluir_pedidos: { type: 'boolean', description: 'inclui também o que foi pedido ao terminal, intercalado' },
    }, required: ['agente'], additionalProperties: false },
    run: async ({ agente, ultimas, pular, inicio, max_chars, incluir_pedidos }) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries({ ultimas, pular, inicio, max_chars })) if (Number.isInteger(v)) q.set(k, v);
      if (incluir_pedidos === true) q.set('pedidos', '1');
      return bridge(`/api/cli/agents/${encodeURIComponent(id(agente))}/respostas?${q}`);
    },
  },
  {
    name: 'acionar_agente_cli', description: 'Pede ao João para ENVIAR uma instrução a um agente de terminal (id de listar_agentes_cli). NÃO envia: cria um pedido em "Pedidos aos terminais" e só o clique em APROVAR entrega. Seja específico: o terminal executa o que for pedido com as permissões dele.',
    inputSchema: { type: 'object', properties: { agente: { type: 'string' }, texto: { type: 'string', description: 'instrução completa, até 4000 caracteres' } }, required: ['agente', 'texto'], additionalProperties: false },
    run: async ({ agente, texto }) => {
      if (typeof texto !== 'string' || !texto.trim()) throw new Error('texto: obrigatório');
      return bridge('/api/cli/requests', { method: 'POST', body: JSON.stringify({ agentId: id(agente), text: texto.slice(0, 4000), from: FROM }) });
    },
  },
  {
    name: 'propor_agente', description: 'Propõe um agente novo para o Escritório. NÃO cria: a proposta espera em "Propostas de agentes" e só o clique em APROVAR do João cria. Campos: id (minúsculas, números, hífen), name, role, does, brief (instruções do agente, até 2000 caracteres), model (sonnet|opus|haiku|vazio), effort, tools (ex.: web, chrome, notion, meta, cli-agents), skills, type (pensador|dev).',
    inputSchema: { type: 'object', properties: { agente: { type: 'object' } }, required: ['agente'], additionalProperties: false },
    run: async ({ agente }) => bridge('/api/agent-proposals', { method: 'POST', body: JSON.stringify({ agent: agente, from: FROM }) }),
  },
  {
    name: 'chamar_agente', description: 'Pede a OUTRO agente do Escritório (id, ex.: marina, paulin, fifia) que faça algo e devolve a resposta dele. A primeira chamada de cada par espera o OK do João na página (ele pode liberar o par para sempre); enquanto espera, esta ferramenta fica aguardando. O chamado responde sem poder chamar ninguém. Seja específico, com tudo que ele precisa.',
    inputSchema: { type: 'object', properties: { agente: { type: 'string' }, texto: { type: 'string', description: 'pedido completo, até 4000 caracteres' } }, required: ['agente', 'texto'], additionalProperties: false },
    run: async ({ agente, texto }) => {
      const { chamadaId } = await bridge('/api/agent-calls', { method: 'POST', body: JSON.stringify({ from: FROM, to: id(agente), text: texto }) });
      for (let i = 0; i < 300; i++) { // até 10 min
        await new Promise(r => setTimeout(r, 2000));
        const c = await bridge(`/api/agent-calls/${chamadaId}`);
        if (c.state === 'done') return { resposta: c.reply };
        if (c.state === 'rejected') throw new Error('o João recusou esta chamada');
        if (c.state === 'failed') throw new Error(c.error || 'o agente chamado falhou');
      }
      throw new Error('sem resposta a tempo (o João não aprovou ou o agente demorou)');
    },
  },
  {
    name: 'abrir_terminal_claude', description: 'Pede ao João para ABRIR um terminal novo (cmd) com o Claude Code numa pasta. NÃO abre: cria um pedido em "Pedidos aos terminais" e só o clique em APROVAR abre (no modo automático abre direto). Depois de aberto, o novo agente aparece em listar_agentes_cli e você pode usar acionar_agente_cli.',
    inputSchema: { type: 'object', properties: { pasta: { type: 'string', description: 'caminho absoluto de uma pasta que exista, ex.: D:/Projetos/MVP-ESTUDY' } }, required: ['pasta'], additionalProperties: false },
    run: async ({ pasta }) => {
      if (typeof pasta !== 'string' || !pasta.trim()) throw new Error('pasta: obrigatória');
      return bridge('/api/cli/open', { method: 'POST', body: JSON.stringify({ dir: pasta, from: FROM }) });
    },
  },
  {
    name: 'propor_exclusao', description: 'Propõe EXCLUIR um agente do Escritório (id, ex.: marina). NÃO exclui: o pedido espera em "Pedidos pendentes" e só o clique em APROVAR do João apaga. Exclusão é permanente.',
    inputSchema: { type: 'object', properties: { agente: { type: 'string' } }, required: ['agente'], additionalProperties: false },
    run: async ({ agente }) => bridge('/api/agent-proposals', { method: 'POST', body: JSON.stringify({ delete: id(agente), from: FROM }) }),
  },
];

const server = new Server({ name: 'cli-agents', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }));
server.setRequestHandler(CallToolRequestSchema, async req => {
  const t = tools.find(x => x.name === req.params.name);
  if (!t) return { isError: true, content: [{ type: 'text', text: `ferramenta desconhecida: ${req.params.name}` }] };
  try { return { content: [{ type: 'text', text: JSON.stringify(await t.run(req.params.arguments || {})) }] }; }
  catch (e) { return { isError: true, content: [{ type: 'text', text: String(e.message) }] }; }
});
await server.connect(new StdioServerTransport());
