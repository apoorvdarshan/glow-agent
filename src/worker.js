// Glow Agent worker: serves public/ as static assets and the /api/* routes.
// Secrets: YOUCAM_API_KEY, PAYPAL_CLIENT_SECRET, AI_API_KEY (wrangler secret put).

import { PRODUCTS, getProduct, getShade, summarize } from "./catalog.js";
import { normalizeReport, sanitizeReport } from "./report.js";
import { buildRoutine } from "./recommend.js";
import { createYouCam, sourceFrom, makeupEffect, YouCamError } from "./youcam.js";
import { createPayPal, PayPalError } from "./paypal.js";
import { runAgent, createChat, sanitizeCart } from "./agent.js";
import { consume, limitsFrom, LimitError } from "./limits.js";

// YouCam's own sample selfie from the API docs, used for the no-camera demo.
// Its analysis and try-ons are cached in KV so the demo doesn't spend units.
const SAMPLE_IMAGE_URL = "https://plugins-media.makeupar.com/strapi/assets/sample_Image_1_202b6bf6e6.jpg";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (err) {
      if (err instanceof LimitError || err instanceof HttpError || err instanceof PayPalError) {
        return json({ error: err.message }, err.status ?? 400);
      }
      if (err instanceof YouCamError) {
        const status = err.code === "CreditInsufficiency" ? 503 : err.status >= 400 && err.status < 500 ? 400 : 502;
        const message = err.code === "CreditInsufficiency" ? "The demo has used up its YouCam units for now." : err.message;
        return json({ error: message }, status);
      }
      console.error(err);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};

async function route(request, env, url) {
  const { pathname } = url;
  const method = request.method;
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const limits = limitsFrom(env);
  const youcam = createYouCam(env);

  if (method === "GET" && pathname === "/api/config") {
    return json({ ai: aiEnabled(env), paypalClientId: env.PAYPAL_CLIENT_ID ?? null, sampleImage: "/api/sample/asset/source" });
  }

  if (method === "GET" && pathname === "/api/products") return json(PRODUCTS.map(summarize));

  // The cached sample report for the intro page; never starts a paid task.
  if (method === "GET" && pathname === "/api/sample") {
    return json({ report: (await env.GLOW_KV.get("sample:report", "json")) ?? null });
  }

  if (method === "POST" && pathname === "/api/photo") {
    const type = request.headers.get("Content-Type") ?? "";
    if (!["image/jpeg", "image/png"].includes(type)) throw new HttpError("Send a JPEG or PNG photo.");
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) throw new HttpError("Photos must be under 8 MB.");
    await consume(env.GLOW_KV, limits, "upload", ip);
    return json({ fileId: await youcam.upload(bytes, type) });
  }

  if (method === "POST" && pathname === "/api/analyze") {
    const body = await readJson(request);
    if (body.sample) {
      const cached = await env.GLOW_KV.get("sample:report", "json");
      if (cached) return json({ status: "success", report: cached });
      const pending = await env.GLOW_KV.get("sample:pending");
      if (pending) return json({ taskId: pending });
      const taskId = await youcam.startSkinAnalysis({ src_file_url: SAMPLE_IMAGE_URL });
      await env.GLOW_KV.put("sample:pending", taskId, { expirationTtl: 600 });
      return json({ taskId });
    }
    const source = sourceFrom({ fileId: fileIdFrom(body) });
    await consume(env.GLOW_KV, limits, "analyze", ip);
    return json({ taskId: await youcam.startSkinAnalysis(source) });
  }

  let match = pathname.match(/^\/api\/analyze\/([\w-]{10,200})$/);
  if (method === "GET" && match) {
    const taskId = match[1];
    const result = await youcam.pollSkinAnalysis(taskId);
    if (result.status !== "success") return json(result);
    const report = normalizeReport(result.results?.output);
    if (url.searchParams.get("sample") === "1" && taskId === (await env.GLOW_KV.get("sample:pending"))) {
      return json({ status: "success", report: await cacheSampleReport(env, report) });
    }
    return json({ status: "success", report: proxiedReport(report, taskId) });
  }

  // Serves a result image (the resized photo or a concern mask) same-origin,
  // so the page can use masks as CSS mask-images. Re-polling the task is free
  // and returns fresh pre-signed URLs.
  match = pathname.match(/^\/api\/analyze\/([\w-]{10,200})\/(image|mask\/[a-z_0-9]{2,30})$/);
  if (method === "GET" && match) {
    const result = await youcam.pollSkinAnalysis(match[1]);
    if (result.status !== "success") throw new HttpError("Result not ready.", 404);
    const report = normalizeReport(result.results?.output);
    const source = match[2] === "image" ? report.imageUrl : report.concerns.find((c) => `mask/${c.id}` === match[2])?.maskUrl;
    if (!source) throw new HttpError("Not found", 404);
    const res = await fetch(source);
    if (!res.ok) throw new HttpError("Image expired. Analyze again.", 404);
    const bytes = await res.arrayBuffer();
    return new Response(bytes, { headers: { "Content-Type": sniffImageType(bytes), "Cache-Control": "private, max-age=3600" } });
  }

  if (method === "POST" && pathname === "/api/tryon") {
    const body = await readJson(request);
    const { product, shade } = productShade(body.productId, body.shadeId);
    const taskId = await startTryOn(env, youcam, limits, ip, photoFrom(body), product, shade);
    return json({ taskId });
  }

  // Cached sample renders use "cached:<product>:<shade>" ids, which browsers send percent-encoded.
  match = pathname.match(/^\/api\/tryon\/([\w%:-]{10,240})$/);
  if (method === "GET" && match) {
    const taskId = decodeURIComponent(match[1]);
    if (!/^[\w:-]{10,200}$/.test(taskId)) throw new HttpError("Not found", 404);
    return json(await pollTryOn(env, youcam, taskId));
  }

  if (method === "POST" && pathname === "/api/routine") {
    const body = await readJson(request);
    const report = sanitizeReport(body.report);
    if (!report) throw new HttpError("Analyze a photo first.");
    const routine = buildRoutine(report, { focus: Array.isArray(body.focus) ? body.focus : [], budget: Number(body.budget) > 0 ? Number(body.budget) : null });
    return json({ routine, products: routine.productIds.map((id) => summarize(getProduct(id))) });
  }

  if (method === "POST" && pathname === "/api/agent") {
    if (!aiEnabled(env)) throw new HttpError("The AI agent isn't configured yet.", 503);
    const body = await readJson(request);
    const report = sanitizeReport(body.report);
    if (!report) throw new HttpError("Analyze a photo first.");
    const history = sanitizeHistory(body.history);
    if (history.length === 0 || history.at(-1).role !== "user") throw new HttpError("Say something first.");
    await consume(env.GLOW_KV, limits, "agent", ip);
    const photo = photoFrom(body);
    try {
      const result = await runAgent(
        { report, history, cart: sanitizeCart(body.cart) },
        { chat: createChat(env), startTryOn: (product, shade) => startTryOn(env, youcam, limits, ip, photo, product, shade) },
      );
      return json(result);
    } catch (err) {
      if (err instanceof LimitError || err instanceof YouCamError) throw err;
      console.error("agent", err);
      throw new HttpError(err.message.startsWith("Glow is") ? err.message : "Glow couldn't answer just now. Please try again.", 502);
    }
  }

  if (method === "POST" && pathname === "/api/orders") {
    const body = await readJson(request);
    return json(await createPayPal(env).createOrder(sanitizeCart(body.cart)));
  }

  match = pathname.match(/^\/api\/orders\/([A-Z0-9]{10,30})\/capture$/);
  if (method === "POST" && match) return json(await createPayPal(env).captureOrder(match[1]));

  match = pathname.match(/^\/api\/sample\/asset\/([\w.-]{1,120})$/);
  if (method === "GET" && match) return sampleAsset(env, match[1]);

  throw new HttpError("Not found", 404);
}

function aiEnabled(env) {
  return Boolean(env.AI_API_KEY && env.AI_BASE_URL && env.AI_MODEL);
}

async function readJson(request) {
  if (Number(request.headers.get("Content-Length") ?? 0) > 200_000) throw new HttpError("Request too large.", 413);
  try {
    return (await request.json()) ?? {};
  } catch {
    throw new HttpError("Invalid JSON.");
  }
}

function fileIdFrom(body) {
  const id = body?.fileId;
  if (typeof id !== "string" || id.length < 10 || id.length > 300) throw new HttpError("Upload a photo first.");
  return id;
}

function photoFrom(body) {
  return body?.sample ? { sample: true } : { fileId: fileIdFrom(body) };
}

function productShade(productId, shadeId) {
  const product = getProduct(productId);
  const shade = getShade(product, shadeId);
  if (!product?.tryOn || !shade) throw new HttpError("Pick a product shade to try on.");
  return { product, shade };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
}

// Starts a makeup try-on. Sample-face renders are cached, so a cached shade
// returns a "cached:" pseudo task id instead of spending a unit.
async function startTryOn(env, youcam, limits, ip, photo, product, shade) {
  if (photo.sample) {
    const key = `tryon-${product.id}-${shade.id}`;
    if (await env.GLOW_KV.get(`sample:have:${key}`)) return `cached:${product.id}:${shade.id}`;
  }
  await consume(env.GLOW_KV, limits, "tryon", ip);
  const source = photo.sample ? { src_file_url: SAMPLE_IMAGE_URL } : sourceFrom(photo);
  const taskId = await youcam.startMakeup(source, [makeupEffect(product.tryOn.category, shade)]);
  if (photo.sample) await env.GLOW_KV.put(`sample:tryon-task:${taskId}`, `${product.id}:${shade.id}`, { expirationTtl: 3600 });
  return taskId;
}

async function pollTryOn(env, youcam, taskId) {
  if (taskId.startsWith("cached:")) {
    const [, productId, shadeId] = taskId.split(":");
    return { status: "success", url: `/api/sample/asset/tryon-${productId}-${shadeId}` };
  }
  const result = await youcam.pollMakeup(taskId);
  if (result.status !== "success") return result;
  const resultUrl = result.results?.url ?? result.results?.[0]?.download_url ?? null;
  const sampleShade = await env.GLOW_KV.get(`sample:tryon-task:${taskId}`);
  if (sampleShade && resultUrl) {
    const [productId, shadeId] = sampleShade.split(":");
    const name = `tryon-${productId}-${shadeId}`;
    await copyToKv(env, resultUrl, name);
    return { status: "success", url: `/api/sample/asset/${name}` };
  }
  return { status: "success", url: resultUrl };
}

function proxiedReport(report, taskId) {
  const base = `/api/analyze/${taskId}`;
  return {
    ...report,
    imageUrl: report.imageUrl ? `${base}/image` : null,
    concerns: report.concerns.map((c) => ({ ...c, maskUrl: c.maskUrl ? `${base}/mask/${c.id}` : null })),
  };
}

// YouCam's result URLs expire after two hours, so the sample face's photo and
// masks are copied into KV and served from /api/sample/asset/.
async function cacheSampleReport(env, report) {
  await copyToKv(env, SAMPLE_IMAGE_URL, "source");
  if (report.imageUrl) await copyToKv(env, report.imageUrl, "image");
  const concerns = [];
  for (const c of report.concerns) {
    if (c.maskUrl) await copyToKv(env, c.maskUrl, `mask-${c.id}`);
    concerns.push({ ...c, maskUrl: c.maskUrl ? `/api/sample/asset/mask-${c.id}` : null });
  }
  const cached = { ...report, imageUrl: report.imageUrl ? "/api/sample/asset/image" : null, concerns };
  await env.GLOW_KV.put("sample:report", JSON.stringify(cached));
  await env.GLOW_KV.delete("sample:pending");
  return cached;
}

async function copyToKv(env, sourceUrl, name) {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new HttpError(`Couldn't fetch ${name}`, 502);
  await env.GLOW_KV.put(`sample:asset:${name}`, await res.arrayBuffer());
  await env.GLOW_KV.put(`sample:have:${name}`, "1");
}

// S3 serves YouCam results as binary/octet-stream, so detect the real type.
function sniffImageType(bytes) {
  const b = new Uint8Array(bytes, 0, 4);
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  return "application/octet-stream";
}

async function sampleAsset(env, name) {
  if (name === "source" && !(await env.GLOW_KV.get("sample:have:source"))) {
    return Response.redirect(SAMPLE_IMAGE_URL, 302);
  }
  const value = await env.GLOW_KV.get(`sample:asset:${name}`, "arrayBuffer");
  if (!value) return json({ error: "Not found" }, 404);
  return new Response(value, {
    headers: { "Content-Type": sniffImageType(value), "Cache-Control": "public, max-age=86400" },
  });
}
