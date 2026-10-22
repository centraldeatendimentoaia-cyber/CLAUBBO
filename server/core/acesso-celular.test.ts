import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { IPV4, PHONE_WRITES, hostAllowed, isLoopback, newPhoneToken, phoneGate } from './acesso.mjs';

const TOKEN = newPhoneToken();
const req = (method: string, cookie = '') => ({ method, headers: cookie ? { cookie } : {} });
const url = (p: string) => new URL(p, 'http://x');

describe('modo celular e XP', () => {
  it('celular não dá "ficou bom": POST negado com 403', () => {
    const g = phoneGate(req('POST', ''), url('/api/xp/ficou-bom'), TOKEN, 4530);
    expect(g).toMatchObject({ action: 'deny', status: 403 });
  });
});

describe('modo celular', () => {
  it('aceita o IP da rede no Host só quando o modo celular está ligado', () => {
    expect(hostAllowed('192.168.0.10:4530', 4530)).toBe(false);
    expect(hostAllowed('192.168.0.10:4530', 4530, '192.168.0.10')).toBe(true);
    expect(hostAllowed('192.168.0.11:4530', 4530, '192.168.0.10')).toBe(false);
    expect(hostAllowed('192.168.0.10:4531', 4530, '192.168.0.10')).toBe(false);
    expect(hostAllowed('127.0.0.1:4530', 4530, '192.168.0.10')).toBe(true);
  });

  it('só aceita IPv4 como V2_LAN_HOST', () => {
    for (const ok of ['192.168.0.10', '10.0.0.2', '172.16.5.200']) expect(IPV4.test(ok)).toBe(true);
    for (const bad of ['', 'evil.example', '192.168.0.256', '192.168.0', '192.168.0.1:4530', '0.0.0.0/0', '192.168.0.1 ']) expect(IPV4.test(bad)).toBe(false);
  });

  it('reconhece o próprio computador', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(isLoopback(a)).toBe(true);
    for (const a of ['192.168.0.20', '::ffff:192.168.0.20', '', undefined]) expect(isLoopback(a)).toBe(false);
  });

  it('nega sem token e sem cookie', () => {
    const g = phoneGate(req('GET'), url('/'), TOKEN, 4530);
    expect(g.action).toBe('deny');
    expect(g.status).toBe(403);
  });

  it('nega token errado na URL', () => {
    expect(phoneGate(req('GET'), url('/?t=errado'), TOKEN, 4530).action).toBe('deny');
  });

  it('com o token do QR code grava o cookie e tira o token da URL', () => {
    const g = phoneGate(req('GET'), url(`/?t=${TOKEN}`), TOKEN, 4530);
    expect(g.action).toBe('redirect');
    expect(g.location).toBe('/');
    expect(g.cookie).toContain(`v2_cel_4530=${TOKEN}`);
    expect(g.cookie).toContain('HttpOnly');
    expect(g.cookie).toContain('SameSite=Strict');
    expect(phoneGate(req('GET'), url(`/api/snapshot?x=1&t=${TOKEN}`), TOKEN, 4530).location).toBe('/api/snapshot?x=1');
  });

  it('com o cookie libera a leitura', () => {
    expect(phoneGate(req('GET', `v2_cel_4530=${TOKEN}`), url('/api/snapshot'), TOKEN, 4530).action).toBe('allow');
    expect(phoneGate(req('GET', 'v2_cel_4530=outro'), url('/api/snapshot'), TOKEN, 4530).action).toBe('deny');
  });

  it('não deixa escrever fora de aprovar e recusar, nem com token e cookie válidos', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(phoneGate(req(m, `v2_cel_4530=${TOKEN}`), url(`/api/chat?t=${TOKEN}`), TOKEN, 4530)).toMatchObject({ action: 'deny', status: 403 });
    }
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      expect(phoneGate(req(m, `v2_cel_4530=${TOKEN}`), url('/api/ops/tasks/abc/approve'), TOKEN, 4530).action).toBe('deny');
    }
    for (const p of ['/api/ops/tasks/abc/retry', '/api/ops/tasks/abc/approve/x', '/api/company', '/api/backup/restore']) {
      expect(phoneGate(req('POST', `v2_cel_4530=${TOKEN}`), url(p), TOKEN, 4530).action).toBe('deny');
    }
  });

  it('com o cookie deixa aprovar e recusar', () => {
    for (const p of ['/api/ops/tasks/abc/approve', '/api/ops/tasks/abc/reject', '/api/cli/requests/1/approve', '/api/agent-proposals/1/reject', '/api/agent-calls/1/approve', '/api/permissions/9/decision']) {
      expect(phoneGate(req('POST', `v2_cel_4530=${TOKEN}`), url(p), TOKEN, 4530).action).toBe('allow');
    }
  });

  it('aprovar sem cookie é negado, e o token na URL não vale para escrita', () => {
    expect(phoneGate(req('POST'), url('/api/ops/tasks/abc/approve'), TOKEN, 4530).action).toBe('deny');
    expect(phoneGate(req('POST'), url(`/api/ops/tasks/abc/approve?t=${TOKEN}`), TOKEN, 4530).action).toBe('deny');
  });

  describe('token de pessoa', () => {
    const ANA = 'a'.repeat(64);
    const team = { pessoas: [{ nome: 'Ana', papel: 'equipe', hash: crypto.createHash('sha256').update(ANA).digest('hex') }] };

    it('com o cookie da pessoa libera a leitura como equipe', () => {
      expect(phoneGate(req('GET', `v2_cel_4530=${ANA}`), url('/api/snapshot'), TOKEN, 4530, team)).toEqual({ action: 'allow', person: { nome: 'Ana', papel: 'equipe' } });
    });

    it('na primeira visita grava o cookie com o token da pessoa', () => {
      const g = phoneGate(req('GET'), url(`/?t=${ANA}`), TOKEN, 4530, team);
      expect(g).toMatchObject({ action: 'redirect', location: '/' });
      expect(g.cookie).toContain(`v2_cel_4530=${ANA}`);
    });

    it('token desconhecido é negado, e o do QR code segue valendo como dono', () => {
      expect(phoneGate(req('GET', `v2_cel_4530=${'b'.repeat(64)}`), url('/'), TOKEN, 4530, team)).toMatchObject({ action: 'deny', status: 403 });
      expect(phoneGate(req('GET', `v2_cel_4530=${TOKEN}`), url('/'), TOKEN, 4530, team)).toEqual({ action: 'allow', person: { nome: 'celular', papel: 'dono' } });
    });

    it('pessoa da equipe só escreve aprovando ou recusando', () => {
      expect(phoneGate(req('POST', `v2_cel_4530=${ANA}`), url('/api/chat'), TOKEN, 4530, team)).toMatchObject({ action: 'deny', status: 403 });
      expect(phoneGate(req('POST', `v2_cel_4530=${ANA}`), url('/api/ops/tasks/abc/approve'), TOKEN, 4530, team).action).toBe('allow');
    });

    it('rotas de agentes (modelo, obrigado, btw): equipe passa; token inválido e PUT de agente não', () => {
      expect(phoneGate(req('POST', `v2_cel_4530=${ANA}`), url('/api/agentes/x/modelo'), TOKEN, 4530, team).action).toBe('allow');
      expect(phoneGate(req('POST', `v2_cel_4530=${ANA}`), url('/api/agentes/x/btw'), TOKEN, 4530, team).action).toBe('allow');
      expect(phoneGate(req('POST', `v2_cel_4530=${'b'.repeat(64)}`), url('/api/agentes/x/modelo'), TOKEN, 4530, team)).toMatchObject({ action: 'deny', status: 403 });
      expect(phoneGate(req('PUT', `v2_cel_4530=${ANA}`), url('/api/agentes/x'), TOKEN, 4530, team).action).toBe('deny');
    });

    it('jogos: equipe passa só em POST desafio e jogada; GET e variantes com .. ou %2F não são escrita do celular', () => {
      const c = `v2_cel_4530=${ANA}`;
      expect(phoneGate(req('POST', c), url('/api/jogos/desafio'), TOKEN, 4530, team).action).toBe('allow');
      expect(phoneGate(req('POST', c), url('/api/jogos/3f2a-bc/jogada'), TOKEN, 4530, team).action).toBe('allow');
      for (const p of ['/api/jogos/../jogada', '/api/jogos/a%2Fb/jogada', '/api/jogos/a/b/jogada', '/api/jogos/desafio/x', '/api/jogos/x/jogada/y']) expect(PHONE_WRITES.test(p)).toBe(false);
      expect(phoneGate(req('PUT', c), url('/api/jogos/desafio'), TOKEN, 4530, team).action).toBe('deny');
    });

    it('presença: equipe e dono passam só em POST /api/presenca e /api/presenca/sair; o resto não é escrita do celular', () => {
      const c = `v2_cel_4530=${ANA}`;
      expect(phoneGate(req('POST', c), url('/api/presenca'), TOKEN, 4530, team).action).toBe('allow');
      expect(phoneGate(req('POST', c), url('/api/presenca/sair'), TOKEN, 4530, team).action).toBe('allow');
      expect(phoneGate(req('POST', `v2_cel_4530=${TOKEN}`), url('/api/presenca'), TOKEN, 4530, team).action).toBe('allow');
      expect(phoneGate(req('POST', `v2_cel_4530=${'b'.repeat(64)}`), url('/api/presenca'), TOKEN, 4530, team)).toMatchObject({ action: 'deny', status: 403 });
      expect(phoneGate(req('POST', ''), url('/api/presenca'), TOKEN, 4530, team)).toMatchObject({ action: 'deny', status: 403 });
      for (const p of ['/api/presenca/x', '/api/presenca/../sair', '/api/presenca/sair/x']) expect(PHONE_WRITES.test(p)).toBe(false);
      expect(phoneGate(req('PUT', c), url('/api/presenca'), TOKEN, 4530, team).action).toBe('deny');
    });

    it('equipe: passa só POST /api/equipe/<nome>/personagem; GET, PUT e variantes com barra não são escrita do celular', () => {
      const c = `v2_cel_4530=${ANA}`;
      expect(phoneGate(req('POST', c), url('/api/equipe/Ana/personagem'), TOKEN, 4530, team).action).toBe('allow');
      for (const p of ['/api/equipe/a/b/personagem', '/api/equipe//personagem', '/api/equipe/Ana/personagem/x', '/api/equipe/Ana']) expect(PHONE_WRITES.test(p)).toBe(false);
      expect(phoneGate(req('PUT', c), url('/api/equipe/Ana/personagem'), TOKEN, 4530, team).action).toBe('deny');
    });

    it('com V2_CELULAR_ESCRITA=1 só o token do dono escreve fora de aprovar/recusar; a equipe nunca (I2)', () => {
      process.env.V2_CELULAR_ESCRITA = '1';
      try {
        expect(phoneGate(req('POST', `v2_cel_4530=${ANA}`), url('/api/chat'), TOKEN, 4530, team)).toMatchObject({ action: 'deny', status: 403 });
        expect(phoneGate(req('DELETE', `v2_cel_4530=${ANA}`), url('/api/agents/x'), TOKEN, 4530, team)).toMatchObject({ action: 'deny', status: 403 });
        expect(phoneGate(req('POST', `v2_cel_4530=${ANA}`), url('/api/ops/tasks/abc/approve'), TOKEN, 4530, team).action).toBe('allow');
        expect(phoneGate(req('POST', `v2_cel_4530=${TOKEN}`), url('/api/chat'), TOKEN, 4530, team).action).toBe('allow');
        expect(phoneGate(req('POST', ''), url('/api/chat'), TOKEN, 4530, team).action).toBe('deny');
      } finally { delete process.env.V2_CELULAR_ESCRITA; }
    });
  });

  it('sem token configurado nada passa', () => {
    expect(phoneGate(req('GET', 'v2_cel_4530='), url('/?t='), '', 4530).action).toBe('deny');
  });
});
