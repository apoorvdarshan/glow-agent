// Daily quotas that protect the demo's YouCam units and AI spend. Counters
// live in KV, which is eventually consistent, so a burst can overshoot a
// limit slightly; that's acceptable for a demo.

export const DEFAULT_LIMITS = {
  upload: { perIp: 10, global: 200 },
  analyze: { perIp: 3, global: 15 },
  tryon: { perIp: 15, global: 120 },
  // No real site-wide cap: Gemini's free-tier quota is already the ceiling.
  // The per-IP cap stops one visitor from using up that shared quota.
  agent: { perIp: 30, global: 100_000 },
};

export class LimitError extends Error {
  constructor(kind, scope) {
    super(
      scope === "global"
        ? "The demo has hit today's limit for this. Try the sample face, or come back tomorrow."
        : "You've hit today's limit for this in the demo. Try the sample face, or come back tomorrow.",
    );
    this.kind = kind;
    this.scope = scope;
    this.status = 429;
  }
}

function today(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function limitsFrom(env) {
  const limits = structuredClone(DEFAULT_LIMITS);
  for (const kind of Object.keys(limits)) {
    const perIp = Number(env[`LIMIT_${kind.toUpperCase()}_PER_IP`]);
    const global = Number(env[`LIMIT_${kind.toUpperCase()}_DAILY`]);
    if (Number.isFinite(perIp) && perIp >= 0) limits[kind].perIp = perIp;
    if (Number.isFinite(global) && global >= 0) limits[kind].global = global;
  }
  return limits;
}

// Counts one use of `kind` for `ip`, or throws LimitError when over quota.
export async function consume(kv, limits, kind, ip, now = Date.now()) {
  const limit = limits[kind];
  const day = today(now);
  const ipKey = `rl:${kind}:${day}:${ip}`;
  const globalKey = `rl:${kind}:${day}:all`;
  const [ipCount, globalCount] = await Promise.all([kv.get(ipKey), kv.get(globalKey)]).then((v) => v.map((n) => Number(n ?? 0)));
  if (globalCount >= limit.global) throw new LimitError(kind, "global");
  if (ipCount >= limit.perIp) throw new LimitError(kind, "ip");
  const ttl = { expirationTtl: 60 * 60 * 48 };
  await Promise.all([kv.put(ipKey, String(ipCount + 1), ttl), kv.put(globalKey, String(globalCount + 1), ttl)]);
}
