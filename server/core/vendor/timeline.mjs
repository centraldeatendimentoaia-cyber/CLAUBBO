// GERADO por server/build-shared.mjs a partir de shared/timeline.ts: não edite.

// shared/timeline.ts
var TIMELINE_VERSION = 1;
var MAX_TITLE = 160;
var MAX_TEXT = 120;
var pad2 = (n) => String(n).padStart(2, "0");
function dayKey(at) {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function isDayKey(s) {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2e3 || mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
function dayStart(key) {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(y, mo - 1, d).getTime();
}
function shiftDay(key, offset) {
  const [y, mo, d] = key.split("-").map(Number);
  return dayKey(new Date(y, mo - 1, d + offset, 12).getTime());
}
var clip = (s, max) => s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
function compactActivity(a) {
  const out = { kind: a.kind, icon: a.icon, text: clip(a.text, MAX_TEXT), at: a.at };
  if (a.tool) out.tool = a.tool;
  if (a.error) out.error = true;
  return out;
}
function compactShell(j) {
  return { id: j.id, label: clip(j.label, MAX_TEXT), startedAt: j.startedAt, background: j.background, kind: j.kind };
}
function compactAgent(a, demo = false) {
  const out = {
    id: a.id,
    kind: a.kind,
    roomId: a.roomId,
    name: a.name,
    look: a.look,
    role: a.role,
    account: a.account,
    status: a.status,
    statusSince: a.statusSince,
    startedAt: a.startedAt,
    seed: a.seed
  };
  if (a.provider) out.provider = a.provider;
  if (a.parentId) out.parentId = a.parentId;
  if (a.waitingFor) out.waitingFor = a.waitingFor;
  if (a.activity) out.activity = compactActivity(a.activity);
  if (a.background) out.background = true;
  if (a.parts && Object.keys(a.parts).length) out.parts = { ...a.parts };
  if (a.title) out.title = clip(a.title, MAX_TITLE);
  if (a.shells?.length) out.shells = a.shells.map(compactShell);
  if (demo) out.demo = true;
  return out;
}
function compactRoom(r, demo = false) {
  const out = { id: r.id, name: r.name, path: r.path, slot: r.slot, seed: r.seed, createdAt: r.createdAt };
  if (demo) out.demo = true;
  return out;
}
function compactAccount(a, demo = false) {
  const out = { id: a.id, short: a.short, name: a.name, color: a.color, sessions: a.sessions, usageStatus: a.usageStatus };
  if (a.provider) out.provider = a.provider;
  if (a.plan) out.plan = a.plan;
  if (a.usage) {
    const u = { source: a.usage.source };
    if (a.usage.fiveHour) u.fiveHour = { ...a.usage.fiveHour };
    if (a.usage.sevenDay) u.sevenDay = { ...a.usage.sevenDay };
    if (a.usage.noQuota) u.noQuota = true;
    out.usage = u;
  }
  if (demo) out.demo = true;
  return out;
}
var isDemoId = (id) => id.startsWith("demo:");
function compactSnapshot(snap, isDemo = isDemoId) {
  return {
    rooms: new Map(snap.rooms.map((r) => [r.id, compactRoom(r, isDemo(r.id))])),
    agents: new Map(snap.agents.map((a) => [a.id, compactAgent(a, isDemo(a.id))])),
    accounts: new Map(snap.accounts.map((a) => [a.id, compactAccount(a, isDemo(a.id))]))
  };
}
function keyframeOf(frame, at, every, boot = false) {
  const k = {
    t: "k",
    at,
    v: TIMELINE_VERSION,
    every,
    rooms: [...frame.rooms.values()],
    agents: [...frame.agents.values()],
    accounts: [...frame.accounts.values()]
  };
  if (boot) k.boot = true;
  return k;
}
function frameOf(k) {
  return {
    rooms: new Map(k.rooms.map((r) => [r.id, r])),
    agents: new Map(k.agents.map((a) => [a.id, a])),
    accounts: new Map(k.accounts.map((a) => [a.id, a]))
  };
}
function emptyFrame() {
  return { rooms: /* @__PURE__ */ new Map(), agents: /* @__PURE__ */ new Map(), accounts: /* @__PURE__ */ new Map() };
}
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
function patchOf(prev, next) {
  const p = prev;
  const n = next;
  let patch = null;
  for (const k of Object.keys(n)) if (!same(p[k], n[k])) (patch ??= {})[k] = n[k];
  for (const k of Object.keys(p)) if (!(k in n)) (patch ??= {})[k] = null;
  return patch;
}
function diffWhole(prev, next) {
  const out = [];
  for (const [id, v] of next) if (!same(prev.get(id), v)) out.push([id, v]);
  for (const id of prev.keys()) if (!next.has(id)) out.push([id, null]);
  return out;
}
function diffFrames(prev, next) {
  const out = {};
  const rooms = diffWhole(prev.rooms, next.rooms);
  if (rooms.length) out.rooms = rooms;
  const agents = [];
  for (const [id, a] of next.agents) {
    const p = prev.agents.get(id);
    if (!p) agents.push([id, a]);
    else {
      const patch = patchOf(p, a);
      if (patch) agents.push([id, patch]);
    }
  }
  for (const id of prev.agents.keys()) if (!next.agents.has(id)) agents.push([id, null]);
  if (agents.length) out.agents = agents;
  const accounts = diffWhole(prev.accounts, next.accounts);
  if (accounts.length) out.accounts = accounts;
  return out.rooms || out.agents || out.accounts ? out : null;
}
var isFullAgent = (p) => typeof p.id === "string" && typeof p.roomId === "string" && typeof p.name === "string" && typeof p.status === "string" && typeof p.seed === "number";
function applyChanges(frame, d) {
  for (const [id, r] of d.rooms ?? []) {
    if (r) frame.rooms.set(id, r);
    else frame.rooms.delete(id);
  }
  for (const [id, acc] of d.accounts ?? []) {
    if (acc) frame.accounts.set(id, acc);
    else frame.accounts.delete(id);
  }
  for (const [id, patch] of d.agents ?? []) {
    if (!patch) {
      frame.agents.delete(id);
      continue;
    }
    const cur = frame.agents.get(id);
    if (!cur) {
      if (isFullAgent(patch)) frame.agents.set(id, withoutNulls(patch));
      continue;
    }
    const next = { ...cur };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    frame.agents.set(id, next);
  }
}
function withoutNulls(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== null) out[k] = v;
  return out;
}
function parseTimeline(text) {
  const out = [];
  let last = -Infinity;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(rec)) continue;
    if (rec.at < last) rec.at = last;
    last = rec.at;
    out.push(rec);
  }
  return out;
}
function isRecord(r) {
  if (!r || typeof r !== "object") return false;
  const o = r;
  if (typeof o.at !== "number" || !Number.isFinite(o.at)) return false;
  if (o.t === "k") return Array.isArray(o.rooms) && Array.isArray(o.agents) && Array.isArray(o.accounts) && typeof o.every === "number";
  if (o.t === "d") return ["rooms", "agents", "accounts"].every((k) => o[k] === void 0 || Array.isArray(o[k]));
  return o.t === "end";
}
var ZERO_STATS = { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 };
function activityId(agentId, a) {
  return `tl:${agentId}:${a.at}:${a.kind}`;
}
function toActivity(agentId, a) {
  const out = { id: activityId(agentId, a), kind: a.kind, icon: a.icon, text: a.text, at: a.at };
  if (a.tool) out.tool = a.tool;
  if (a.error) out.error = true;
  return out;
}
function toAgentInfo(t, recent = []) {
  const activity = t.activity ? toActivity(t.id, t.activity) : void 0;
  const a = {
    id: t.id,
    kind: t.kind,
    roomId: t.roomId,
    name: t.name,
    look: t.look,
    role: t.role,
    sessionId: t.id,
    account: t.account,
    status: t.status,
    recent: recent.length ? recent.slice() : activity ? [activity] : [],
    tasks: [],
    startedAt: t.startedAt,
    lastEventAt: Math.max(t.statusSince, activity?.at ?? 0),
    statusSince: t.statusSince,
    stats: { ...ZERO_STATS },
    seed: t.seed
  };
  if (t.provider) a.provider = t.provider;
  if (t.parentId) a.parentId = t.parentId;
  if (t.title) a.title = t.title;
  if (t.waitingFor) a.waitingFor = t.waitingFor;
  if (activity) a.activity = activity;
  if (t.shells?.length) a.shells = t.shells.map((j) => ({ ...j }));
  if (t.background) a.background = true;
  if (t.parts) a.parts = { ...t.parts };
  return a;
}
function toRoomInfo(r) {
  return { id: r.id, name: r.name, path: r.path, slot: r.slot, seed: r.seed, createdAt: r.createdAt };
}
function toAccountInfo(a, at) {
  const out = { id: a.id, short: a.short, name: a.name, color: a.color, configDir: "", sessions: a.sessions, usageStatus: a.usageStatus };
  if (a.provider) out.provider = a.provider;
  if (a.plan) out.plan = a.plan;
  if (a.usage) {
    const u = { source: a.usage.source, fetchedAt: at };
    if (a.usage.fiveHour) u.fiveHour = { ...a.usage.fiveHour };
    if (a.usage.sevenDay) u.sevenDay = { ...a.usage.sevenDay };
    if (a.usage.noQuota) u.noQuota = true;
    out.usage = u;
  }
  return out;
}
export {
  TIMELINE_VERSION,
  activityId,
  applyChanges,
  compactAccount,
  compactActivity,
  compactAgent,
  compactRoom,
  compactShell,
  compactSnapshot,
  dayKey,
  dayStart,
  diffFrames,
  emptyFrame,
  frameOf,
  isDayKey,
  isDemoId,
  keyframeOf,
  parseTimeline,
  shiftDay,
  toAccountInfo,
  toActivity,
  toAgentInfo,
  toRoomInfo
};
