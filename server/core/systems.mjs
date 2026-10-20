// Sistemas dos agentes: ligar, desligar, ver logs, monitorar e reerguer.
//
// Regras de segurança:
//  - O comando de subir vem SEMPRE da configuração do agente (data/agents.json, cadastrada pelo João na página). Nada
//    de texto de chat, de agente ou de proposta chega aqui: as funções recebem só o id do agente e releem a config.
//  - Só reergue o que o João ligou pelo painel (ou que o monitor viu no ar) e que caiu depois. Desligar pelo painel
//    cancela o reerguer. URL externa só avisa.
//  - Reerguer tenta até MAX_ATTEMPTS vezes com espera crescente; esgotou, avisa e para de tentar.
import net from 'node:net';
import { spawn as nodeSpawn, execFile } from 'node:child_process';
import { cleanCommand } from './system-config.mjs';

export const MAX_ATTEMPTS = 3;
export const BACKOFF_MS = [30_000, 60_000, 120_000];
const LOG_LINES = 500;
const LINE_MAX = 400;

/** Porta aberta em 127.0.0.1? */
export function probePort(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/** Responde HTTP? Qualquer resposta abaixo de 500 conta como no ar (401/403 também: o servidor está de pé). */
export async function probeUrl(url, timeoutMs = 6000) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Mata a árvore de processos (Windows: taskkill /T). */
export function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (process.platform === 'win32') execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
    else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* já saiu */ } } resolve(); }
  });
}

/** Pid que escuta a porta (Windows). Só usado para desligar um sistema que o escritório ligou antes de reiniciar. */
export function pidOfPort(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    execFile('powershell.exe', ['-NoProfile', '-Command', `(Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`], { windowsHide: true, timeout: 8000 }, (err, out) => {
      const pid = Number(String(out || '').trim());
      resolve(!err && Number.isInteger(pid) && pid > 0 ? pid : null);
    });
  });
}

const clipLine = (l) => String(l).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').slice(0, LINE_MAX);

export function createSystems({
  getAgents,
  notify = async () => {},
  spawn = (command, opts) => nodeSpawn(command, { ...opts, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }),
  probe = { port: probePort, url: probeUrl },
  kill = killTree,
  portPid = pidOfPort,
  now = Date.now,
  load = () => ({}),
  save = () => {},
}) {
  /** @type {Map<string, any>} */
  const st = new Map();
  const saved = load();

  const stateOf = (id) => {
    if (!st.has(id)) st.set(id, { status: 'unknown', desired: false, attempts: 0, nextTryAt: 0, graceUntil: 0, pid: saved[id]?.pid ?? null, child: null, logs: [], since: now(), notifiedDown: false });
    return st.get(id);
  };
  const persist = () => save(Object.fromEntries([...st].map(([id, s]) => [id, { desired: s.desired, pid: s.pid }])));
  const agentOf = (id) => getAgents().find((a) => a.id === id);
  const sysName = (a) => a?.system?.name || 'sistema';
  const setStatus = (s, status) => { if (s.status !== status) { s.status = status; s.since = now(); } };
  const log = (s, line) => { s.logs.push(...String(line).split(/\r?\n/).filter((l) => l.trim()).map(clipLine)); if (s.logs.length > LOG_LINES) s.logs.splice(0, s.logs.length - LOG_LINES); };

  /** Sobe o processo do comando cadastrado. Não decide nada: quem chama já conferiu as regras. */
  function launch(a, s) {
    const sys = a.system;
    const ok = cleanCommand(sys.command); // confere de novo na hora de rodar: o agents.json pode ter vindo de antes da lista permitida
    if (!ok.ok) { log(s, `[escritório] comando recusado: ${ok.error}`); setStatus(s, 'down'); s.desired = false; persist(); return false; }
    log(s, `[escritório] subindo: ${sys.command}`);
    const child = spawn(sys.command, { cwd: sys.folder, env: process.env });
    s.child = child;
    s.pid = child.pid ?? null;
    s.graceUntil = now() + BACKOFF_MS[0]; // tempo para o processo abrir a porta antes de ser dado como caído
    child.stdout?.on('data', (d) => log(s, d));
    child.stderr?.on('data', (d) => log(s, d));
    child.on('error', (e) => log(s, `[escritório] não consegui rodar o comando: ${e.message}`));
    child.on('exit', (code) => { log(s, `[escritório] o processo terminou (código ${code ?? '?'})`); if (s.child === child) { s.child = null; s.pid = null; persist(); } });
    persist();
    return true;
  }

  const fail = (status, error) => ({ ok: false, status, error });

  async function start(id) {
    const a = agentOf(id);
    if (a?.system?.type !== 'local') return fail(400, 'este agente não tem um sistema local');
    const cmd = cleanCommand(a.system.command);
    if (!cmd.ok) return fail(400, cmd.error);
    const s = stateOf(id);
    if (await probe.port(a.system.port)) { setStatus(s, 'up'); s.desired = true; persist(); return { ok: true, already: true }; }
    if (s.child) return fail(409, 'o sistema já está subindo');
    s.desired = true;
    s.attempts = 0;
    s.notifiedDown = false;
    setStatus(s, 'restarting');
    return launch(a, s) ? { ok: true } : fail(400, 'comando recusado');
  }

  async function stop(id) {
    const a = agentOf(id);
    if (a?.system?.type !== 'local') return fail(400, 'este agente não tem um sistema local');
    const s = stateOf(id);
    s.desired = false; // desligar pelo painel cancela o reerguer
    s.attempts = 0;
    const pid = s.child?.pid ?? s.pid ?? (await portPid(a.system.port));
    if (!pid) {
      const stillUp = await probe.port(a.system.port);
      setStatus(s, stillUp ? 'up' : 'down');
      persist();
      return stillUp ? fail(409, 'não consegui achar o processo deste sistema para desligar') : { ok: true, already: true };
    }
    await kill(pid);
    s.child = null;
    s.pid = null;
    setStatus(s, 'down');
    log(s, '[escritório] sistema desligado pelo painel');
    persist();
    return { ok: true };
  }

  /** Um ciclo do monitor: confere cada sistema e reerguer o que caiu. */
  async function tick() {
    for (const a of getAgents()) {
      const sys = a.system;
      if (!sys || sys.type === 'visual') continue;
      const s = stateOf(a.id);
      const up = sys.type === 'local' ? await probe.port(sys.port) : await probe.url(sys.url);
      if (sys.type === 'url') { await tickUrl(a, s, up); continue; }
      if (up) {
        const recovered = s.attempts > 0;
        setStatus(s, 'up');
        if (!s.desired) { s.desired = true; persist(); } // viu no ar: passa a vigiar
        s.attempts = 0;
        s.notifiedDown = false;
        if (recovered) await notify({ type: 'system_back', agent: a.name, system: sysName(a) });
        continue;
      }
      // fora do ar
      if (!s.desired) { if (s.status !== 'restarting') setStatus(s, 'down'); continue; } // nunca esteve no ar nem foi ligado: não é queda
      if (s.child && now() < Math.max(s.graceUntil, s.nextTryAt)) { setStatus(s, 'restarting'); continue; } // dando tempo para o processo subir
      if (!sys.autoRestart) { setStatus(s, 'down'); continue; }
      if (s.attempts >= MAX_ATTEMPTS) {
        setStatus(s, 'down');
        s.desired = false; // parou de tentar
        persist();
        if (!s.notifiedDown) { s.notifiedDown = true; log(s, '[escritório] não voltou depois de 3 tentativas: parei de tentar'); await notify({ type: 'system_failed', agent: a.name, system: sysName(a) }); }
        continue;
      }
      if (now() < s.nextTryAt) continue;
      if (s.child) { await kill(s.child.pid); s.child = null; s.pid = null; } // tentativa anterior travada
      s.attempts += 1;
      s.nextTryAt = now() + BACKOFF_MS[Math.min(s.attempts - 1, BACKOFF_MS.length - 1)];
      setStatus(s, 'restarting');
      log(s, `[escritório] caiu: tentativa ${s.attempts} de ${MAX_ATTEMPTS}`);
      launch(a, s);
    }
  }

  /** URL externa: só avisa (caiu / voltou). Não avisa de algo que já estava fora do ar quando o escritório ligou. */
  async function tickUrl(a, s, up) {
    const was = s.status;
    setStatus(s, up ? 'up' : 'down');
    if (!up && was === 'up') { s.notifiedDown = true; await notify({ type: 'url_down', agent: a.name, system: sysName(a) }); }
    else if (up && s.notifiedDown) { s.notifiedDown = false; await notify({ type: 'url_back', agent: a.name, system: sysName(a) }); }
  }

  return {
    start, stop, tick,
    logs: (id, n = 200) => (st.get(id)?.logs ?? []).slice(-Math.max(1, Math.min(n, LOG_LINES))),
    /** Estado para a interface: no ar, indisponível ou reerguendo (ou desconhecido antes do primeiro ciclo). */
    view(id) {
      const a = agentOf(id);
      if (!a?.system || a.system.type === 'visual') return null;
      const s = stateOf(id);
      return { type: a.system.type, name: a.system.name || '', state: s.status === 'up' ? 'up' : s.status === 'restarting' ? 'restarting' : s.status === 'down' ? 'down' : 'unknown', desired: s.desired, attempts: s.attempts, since: s.since };
    },
  };
}
