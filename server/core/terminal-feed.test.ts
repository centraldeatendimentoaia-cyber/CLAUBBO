import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { activityEntries, chatEntries, dayKey, diffFeed, groupByDay, mergeMessages, relabelCliEntries, relabelSseChunk } from './terminal-feed.mjs';

type Msg = { at: number; who: 'user' | 'agent'; text: string; auto?: string; error?: boolean };
const BRT = 'America/Sao_Paulo';
const msgs = (n: number, from = 0): Msg[] => Array.from({ length: n }, (_, i) => ({ at: 1_000_000 + (from + i) * 1000, who: (from + i) % 2 ? 'agent' : 'user', text: `mensagem ${from + i} — ação ✓` }));
const idsOf = (list: { id: string }[]) => list.map((x) => x.id);

describe('chatEntries: autor certo, ordem e texto intactos', () => {
  it('dono = user, agente = assistant, erro = system/error, retorno automático = system (não é o dono)', () => {
    const e = chatEntries([
      { at: 1, who: 'user', text: 'oi, Maestro' },
      { at: 2, who: 'agent', text: 'Olá, João.' },
      { at: 3, who: 'agent', text: 'Não consegui responder: boom', error: true },
      { at: 4, who: 'user', text: '[Retorno automático · pedido ab12 · terminal Aline]\nTestes rodaram: 12 ok', auto: 'terminal' },
    ]);
    expect(e.map((x: { kind: string }) => x.kind)).toEqual(['user', 'assistant', 'system', 'system']);
    expect(e[2]).toMatchObject({ level: 'error' });
    expect(e[3]).toMatchObject({ level: 'info', text: expect.stringContaining('[Retorno automático · pedido ab12 · terminal Aline] — Testes rodaram: 12 ok'), detail: expect.stringContaining('Testes rodaram: 12 ok') });
    expect(e.map((x: { at: number }) => x.at)).toEqual([1, 2, 3, 4]);
  });

  it('texto longo, acentos e markdown passam sem cortar nem alterar', () => {
    const long = `# Título ção\n\n- item **negrito** \`código\`\n${'á'.repeat(20_000)}`;
    const [e] = chatEntries([{ at: 1, who: 'agent', text: long }]);
    expect(e.text).toBe(long);
    expect(JSON.parse(JSON.stringify(e)).text).toBe(long);
  });

  it('ids são únicos, mesmo no mesmo milissegundo, e não mudam quando as mais antigas saem', () => {
    const same: Msg[] = [{ at: 5, who: 'user', text: 'a' }, { at: 5, who: 'user', text: 'b' }, { at: 5, who: 'agent', text: 'c' }];
    expect(new Set(idsOf(chatEntries(same))).size).toBe(3);
    const all = msgs(10);
    expect(idsOf(chatEntries(all.slice(3)))).toEqual(idsOf(chatEntries(all)).slice(3));
  });
});

describe('diffFeed: terminal ao vivo', () => {
  it('primeira vez manda init com tudo; sem mudança não manda nada; mensagem nova vira append só dela', () => {
    let d = diffFeed(null, msgs(3));
    expect(d.type).toBe('init');
    expect(d.entries).toHaveLength(3);
    d = diffFeed(d.sent, msgs(3));
    expect(d.type).toBe('none');
    d = diffFeed(d.sent, msgs(4));
    expect(d.type).toBe('append');
    expect(d.entries).toHaveLength(1);
    expect(d.entries[0].text).toContain('mensagem 3');
  });

  it('com o chat no teto de 200 (a mais antiga sai quando entra uma nova) a mensagem nova ainda aparece — o defeito original', () => {
    let d = diffFeed(null, msgs(200));
    for (let step = 1; step <= 5; step++) {
      d = diffFeed(d.sent, msgs(200, step)); // continua com 200, mas deslocado
      expect(d.type, `passo ${step}`).toBe('append');
      expect(d.entries).toHaveLength(1);
      expect(d.entries[0].text).toContain(`mensagem ${199 + step}`);
    }
  });

  it('várias mensagens de uma vez chegam todas, na ordem, sem repetir', () => {
    const first = diffFeed(null, msgs(5));
    const d = diffFeed(first.sent, msgs(8));
    expect(d.entries.map((x: { text: string }) => x.text.slice(0, 11))).toEqual(['mensagem 5 ', 'mensagem 6 ', 'mensagem 7 ']);
  });

  it('conversa apagada ou trocada reenvia init; reconexão (sent = null) manda a conversa toda com os mesmos ids', () => {
    const first = diffFeed(null, msgs(3));
    expect(diffFeed(first.sent, [])).toMatchObject({ type: 'init', entries: [] });
    expect(diffFeed(first.sent, msgs(3, 100)).type).toBe('init');
    expect(idsOf(diffFeed(null, msgs(3)).entries)).toEqual(idsOf(first.entries));
  });
});

describe('terminais do andar 2: quem pediu', () => {
  const reqs = [
    { agentId: '.claude:1', from: 'maestro-dev', state: 'sent', auto: true, text: 'Aline, rode os testes.' },
    { agentId: '.claude:1', from: 'maestro-dev', state: 'pending', text: 'ainda não saiu' },
    { agentId: '.claude:2', from: 'maestro-dev', state: 'sent', text: 'outro terminal' },
  ];
  const entries = [
    { kind: 'user', id: 'a', at: 1, text: 'Aline, rode os testes.' },
    { kind: 'user', id: 'b', at: 2, text: 'oi, sou eu digitando' },
    { kind: 'user', id: 'c', at: 3, text: 'ainda não saiu' },
    { kind: 'assistant', id: 'd', at: 4, text: 'Aline, rode os testes.' },
  ];
  const relabel = (e: typeof entries) => relabelCliEntries(e, reqs, '.claude:1', () => 'Maestro Dev');

  it('só o prompt igual a um pedido entregue a este terminal é marcado; o que o dono digita fica igual', () => {
    const out = relabel(entries);
    expect(out[0]!.text).toBe('↳ Pedido de Maestro Dev (orquestrador, enviado automaticamente):\nAline, rode os testes.');
    expect(out.slice(1)).toEqual(entries.slice(1));
  });

  it('o stream SSE é reescrito em blocos, mesmo cortado no meio, e o resto passa intacto', () => {
    const init = `event: init\ndata: ${JSON.stringify({ agentId: '.claude:1', entries, truncated: true })}\n\n`;
    const ping = ': ping\n\n';
    const whole = init + ping;
    const a = relabelSseChunk(whole.slice(0, 37), relabel);
    expect(a.out).toBe('');
    const b = relabelSseChunk(a.rest + whole.slice(37), relabel);
    expect(b.rest).toBe('');
    expect(b.out).toContain('↳ Pedido de Maestro Dev');
    expect(b.out).toContain('"truncated":true');
    expect(b.out.endsWith(ping)).toBe(true);
    expect(relabelSseChunk('event: init\ndata: {lixo\n\n', relabel).out).toBe('event: init\ndata: {lixo\n\n');
  });
});

describe('dia local (Brasília), não UTC', () => {
  const at = (iso: string) => Date.parse(iso);

  it('perto da meia-noite: 23h30 e 00h10 em Brasília ficam em dias diferentes, mesmo com o UTC no mesmo dia', () => {
    expect(dayKey(at('2026-10-19T02:30:00Z'), BRT)).toBe('2026-10-18'); // 23:30 em Brasília (UTC-3); em UTC já é 19
    expect(dayKey(at('2026-10-19T03:10:00Z'), BRT)).toBe('2026-10-19'); // 00:10 em Brasília
    expect(dayKey(at('2026-10-19T02:59:59Z'), BRT)).toBe('2026-10-18');
    expect(dayKey(at('2026-10-19T03:00:00Z'), BRT)).toBe('2026-10-19');
    expect(dayKey(at('2026-10-19T02:30:00Z'), 'UTC')).toBe('2026-10-19');
  });

  it('groupByDay agrupa pelo dia local, do mais novo para o mais antigo, e mantém a ordem dentro do dia', () => {
    const list: Msg[] = [
      { at: at('2026-10-18T14:00:00Z'), who: 'user', text: 'manhã' },
      { at: at('2026-10-19T02:30:00Z'), who: 'agent', text: 'noite (ainda 18)' },
      { at: at('2026-10-19T03:10:00Z'), who: 'user', text: 'madrugada (19)' },
    ];
    const g = groupByDay(list, BRT);
    expect(g.map((d: { day: string }) => d.day)).toEqual(['2026-10-19', '2026-10-18']);
    expect(g[1].messages.map((m: Msg) => m.text)).toEqual(['manhã', 'noite (ainda 18)']);
    expect(g[1]).toMatchObject({ count: 2, first: list[0]!.at, last: list[1]!.at });
  });

  it('mergeMessages junta arquivo morto e ativo sem repetir e em ordem', () => {
    const out = mergeMessages(msgs(3), msgs(3, 2)); // a mensagem 2 está nas duas listas
    expect(out.map((m: Msg) => m.text.slice(0, 11))).toEqual(['mensagem 0 ', 'mensagem 1 ', 'mensagem 2 ', 'mensagem 3 ', 'mensagem 4 ']);
  });

  it('eventos do dia viram entradas na ordem do horário', () => {
    const e = activityEntries([{ id: 2, at: 20, kind: 'chat', agentName: 'Ana', text: 'depois' }, { id: 1, at: 10, kind: 'system', text: 'antes' }]);
    expect(e.map((x: { text: string }) => x.text)).toEqual(['antes', 'Ana: depois']);
    expect(e[0]).toMatchObject({ kind: 'system', level: 'warn' });
  });
});
