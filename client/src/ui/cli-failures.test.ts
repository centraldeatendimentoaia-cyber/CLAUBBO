/// <reference types="node" />
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { approveError, collectFailures } from './cli-failures';

describe('erro ao aprovar', () => {
  it('resposta 200 com state failed é erro com a mensagem do servidor', () => {
    expect(approveError(true, 200, { state: 'failed', error: 'já existe um agente com esse id' })).toBe('já existe um agente com esse id');
  });
  it('failed sem mensagem ainda avisa', () => {
    expect(approveError(true, 200, { state: 'failed' })).toBe('falhou sem mensagem');
  });
  it('HTTP de erro usa a mensagem ou o código', () => {
    expect(approveError(false, 429, { error: 'já há uma chamada em andamento' })).toBe('já há uma chamada em andamento');
    expect(approveError(false, 500, {})).toBe('erro 500');
  });
  it('aprovação que deu certo não é erro', () => {
    expect(approveError(true, 200, { state: 'created' })).toBeNull();
    expect(approveError(true, 200, { state: 'sent' })).toBeNull();
  });
});

describe('cartões de falha', () => {
  const watched = new Map([['agentx1', 'Maestro propõe o agente Dup']]);
  it('pedido visto esperando que ficou failed vira cartão com o erro', () => {
    const f = collectFailures(watched, [{ key: 'agentx1', state: 'failed', error: 'já existe' }], new Map(), new Set());
    expect(f).toEqual([{ key: 'agentx1', head: 'Maestro propõe o agente Dup', error: 'já existe' }]);
  });
  it('failed antigo que esta página nunca viu esperando não aparece', () => {
    expect(collectFailures(new Map(), [{ key: 'agentold', state: 'failed', error: 'x' }], new Map(), new Set())).toEqual([]);
  });
  it('fica enquanto o João não dispensa, e some depois', () => {
    const listed = [{ key: 'agentx1', state: 'failed', error: 'já existe' }];
    expect(collectFailures(watched, listed, new Map(), new Set())).toHaveLength(1);
    expect(collectFailures(watched, listed, new Map(), new Set())).toHaveLength(1);
    expect(collectFailures(watched, listed, new Map(), new Set(['agentx1']))).toHaveLength(0);
  });
  it('erro local (HTTP) aparece mesmo sem o pedido na lista', () => {
    const local = new Map([['call9', { key: 'call9', head: 'A quer conversar com B', error: 'já há uma chamada em andamento' }]]);
    expect(collectFailures(new Map(), [], local, new Set())).toHaveLength(1);
  });
});

describe('barra Terminais/automático com o feed aberto', () => {
  const css = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  it('sobe para cima do feed aberto (altura do feed na conta do bottom)', () => {
    expect(css).toMatch(/\.has-feed \.cr-mode\s*\{[^}]*bottom:[^}]*--feed-h/);
  });
  it('o feed (z-index 15) não pode ficar por cima da barra: a regra do feed aberto vem depois da base', () => {
    expect(css.lastIndexOf('.has-feed .cr-mode')).toBeGreaterThan(css.indexOf('.cr-mode {'));
  });
});
