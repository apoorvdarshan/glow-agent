import { describe, expect, it } from "vitest";
import worker from "../src/worker.js";

function memoryKv(entries = {}) {
  const store = new Map(Object.entries(entries));
  return {
    get: async (k, type) => {
      const v = store.get(k) ?? null;
      return type === "json" && v ? JSON.parse(v) : v;
    },
    put: async (k, v) => void store.set(k, v),
    delete: async (k) => void store.delete(k),
  };
}

const env = (kv = memoryKv()) => ({ GLOW_KV: kv, ASSETS: { fetch: async () => new Response("asset") } });
const get = (path, e = env()) => worker.fetch(new Request(`https://glow.test${path}`), e);

describe("worker routes", () => {
  it("serves cached sample try-ons from percent-encoded ids", async () => {
    const res = await get("/api/tryon/cached%3Askin-tint%3Amedium");
    expect(await res.json()).toEqual({ status: "success", url: "/api/sample/asset/tryon-skin-tint-medium" });
  });

  it("rejects encoded ids that decode to unexpected characters", async () => {
    expect((await get("/api/tryon/cached%3A..%2F..%2Fsecret%3Ax")).status).toBe(404);
  });

  it("returns the cached sample report without calling YouCam", async () => {
    const report = { overall: 92, concerns: [] };
    const res = await worker.fetch(
      new Request("https://glow.test/api/analyze", { method: "POST", body: JSON.stringify({ sample: true }) }),
      env(memoryKv({ "sample:report": JSON.stringify(report) })),
    );
    expect(await res.json()).toEqual({ status: "success", report });
  });

  it("serves the intro's sample report from cache without starting a task", async () => {
    expect(await (await get("/api/sample")).json()).toEqual({ report: null });
    const report = { overall: 92, concerns: [] };
    const cached = env(memoryKv({ "sample:report": JSON.stringify(report) }));
    expect(await (await get("/api/sample", cached)).json()).toEqual({ report });
  });

  it("refuses the agent when no AI model is configured", async () => {
    const res = await worker.fetch(new Request("https://glow.test/api/agent", { method: "POST", body: "{}" }), env());
    expect(res.status).toBe(503);
  });

  it("passes non-API paths to static assets", async () => {
    expect(await (await get("/")).text()).toBe("asset");
  });
});
