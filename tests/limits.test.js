import { describe, expect, it } from "vitest";
import { consume, limitsFrom, LimitError, DEFAULT_LIMITS } from "../src/limits.js";

function memoryKv() {
  const store = new Map();
  return { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v), store };
}

describe("consume", () => {
  const limits = { analyze: { perIp: 2, global: 3 } };

  it("allows uses up to the per-IP limit", async () => {
    const kv = memoryKv();
    await consume(kv, limits, "analyze", "1.1.1.1");
    await consume(kv, limits, "analyze", "1.1.1.1");
    await expect(consume(kv, limits, "analyze", "1.1.1.1")).rejects.toBeInstanceOf(LimitError);
  });

  it("enforces the global daily cap across IPs", async () => {
    const kv = memoryKv();
    await consume(kv, limits, "analyze", "a");
    await consume(kv, limits, "analyze", "b");
    await consume(kv, limits, "analyze", "c");
    await expect(consume(kv, limits, "analyze", "d")).rejects.toMatchObject({ scope: "global", status: 429 });
  });

  it("resets the next day", async () => {
    const kv = memoryKv();
    const day1 = Date.UTC(2026, 9, 27, 12);
    await consume(kv, limits, "analyze", "a", day1);
    await consume(kv, limits, "analyze", "a", day1);
    await expect(consume(kv, limits, "analyze", "a", day1 + 86_400_000)).resolves.toBeUndefined();
  });
});

describe("limitsFrom", () => {
  it("reads overrides from env and keeps defaults otherwise", () => {
    const limits = limitsFrom({ LIMIT_ANALYZE_PER_IP: "5", LIMIT_TRYON_DAILY: "0", LIMIT_AGENT_PER_IP: "abc" });
    expect(limits.analyze.perIp).toBe(5);
    expect(limits.tryon.global).toBe(0);
    expect(limits.agent.perIp).toBe(DEFAULT_LIMITS.agent.perIp);
  });
});
