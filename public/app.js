import { productArt } from "./product-art.js";

const $ = (id) => document.getElementById(id);
const CART_KEY = "glow-agent-bag";
const MOBILE = window.matchMedia("(max-width: 960px)");

const state = {
  config: { ai: false, paypalClientId: null, sampleImage: "/api/sample/asset/source" },
  products: new Map(),
  photo: null, // { fileId } or { sample: true }
  photoUrl: null,
  report: null,
  active: new Set(), // concern ids drawn on the report map
  history: [],
  cart: loadCart(),
  busy: false,
};

// ---------- helpers ----------

async function api(path, { method = "GET", body, headers } = {}) {
  const isJson = body !== undefined && !(body instanceof Blob);
  const res = await fetch(path, {
    method,
    headers: isJson ? { "Content-Type": "application/json" } : headers,
    body: isJson ? JSON.stringify(body) : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status, busy: Boolean(data.busy) });
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollUntilDone(path, { interval = 2500, timeout = 120000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const result = await api(path);
    if (result.status === "success") return result;
    if (result.status === "error") throw new Error(result.message ?? "Processing failed.");
    await sleep(interval);
  }
  throw new Error("This is taking longer than usual. Try again in a minute.");
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c) node.append(c);
  return node;
}

const usd = (n) => `$${n.toFixed(2)}`;
const ICON = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch {
    // Storage can be unavailable (private mode); the bag still works for this visit.
  }
}

function show(view) {
  for (const id of ["view-intro", "view-analyzing", "view-workspace"]) $(id).hidden = id !== view;
  window.scrollTo({ top: 0 });
}

function introError(message) {
  $("intro-error").textContent = message;
  $("intro-error").hidden = !message;
}

// ---------- the map ----------

// Concerns whose masks cover the whole face rather than spots.
const AREA = new Set(["moisture", "radiance"]);

// Draws concern masks over a photo, each tinted with its concern's color.
// Face-wide washes go underneath, spots on top.
function drawLayers(mapEl, layersEl, concerns, { stagger = 0 } = {}) {
  const ordered = concerns.filter((c) => c.maskUrl).sort((a, b) => AREA.has(b.id) - AREA.has(a.id));
  layersEl.replaceChildren(...ordered.map((c, i) => {
    const layer = el("span", { class: AREA.has(c.id) ? "layer area" : "layer", "data-concern": c.id });
    layer.style.setProperty("--mask", `url("${c.maskUrl}")`);
    if (stagger) layer.style.animationDelay = `${i * stagger}ms`;
    return layer;
  }));
  mapEl.classList.toggle("is-mapped", layersEl.childElementCount > 0);
}

// The concerns worth showing first: those that need work, topped up to three.
function headline(report, count = 3) {
  const needs = report.concerns.filter((c) => c.severity !== "low");
  return (needs.length >= count ? needs : report.concerns).slice(0, Math.max(count, Math.min(needs.length, 4)));
}

async function loadHero() {
  const photo = $("hero-photo");
  photo.addEventListener("error", () => {
    if (!photo.src.endsWith("/source")) photo.src = state.config.sampleImage;
  }, { once: true });
  try {
    const { report } = await api("/api/sample");
    if (!report) return;
    // The concerns that need work, plus two spot concerns so the hero shows more of the spectrum.
    const top = headline(report);
    top.push(...report.concerns.filter((c) => !AREA.has(c.id) && !top.includes(c)).slice(0, 2));
    const legend = $("hero-legend");
    legend.replaceChildren(...top.map((c) => el("li", { "data-concern": c.id }, el("i"), el("span", { text: c.label }), el("b", { text: String(c.score) }))));
    const draw = () => drawLayers($("btn-sample"), $("hero-layers"), top, { stagger: 450 });
    if (photo.complete) draw();
    else photo.addEventListener("load", draw, { once: true });
  } catch {
    // The hero still works as a plain photo.
  }
}

// ---------- photo capture ----------

let stream = null;

async function openCamera() {
  if (!$("consent").checked) return introError("Tick the box above to send your photo to YouCam first.");
  introError("");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
  } catch {
    return introError("The camera isn't available. Allow camera access in your browser, or upload a photo instead.");
  }
  const video = $("camera-video");
  video.srcObject = stream;
  await video.play();
  $("camera").showModal();
}

function closeCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if ($("camera").open) $("camera").close();
}

function capture() {
  const video = $("camera-video");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob((blob) => {
    closeCamera();
    if (blob) analyzePhoto(blob);
  }, "image/jpeg", 0.92);
}

// Resizes to at most 1600 px on the long side (YouCam try-on needs < 1920)
// and rejects photos too small for skin analysis (480 px short side).
async function preparePhoto(blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (Math.min(width, height) < 480) throw new Error("This photo is too small. Use one at least 480 pixels on its short side.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

const SCAN_STEPS = ["Mapping pores and texture", "Checking hydration and oil", "Looking at the under-eye area", "Measuring redness and dark spots", "Estimating skin type by zone"];
let scanTimer = null;

function startAnalyzing(src, status) {
  $("scan-photo").src = src;
  $("scan-status").textContent = status;
  show("view-analyzing");
}

function narrateScan() {
  let i = 0;
  $("scan-status").textContent = SCAN_STEPS[0];
  clearInterval(scanTimer);
  scanTimer = setInterval(() => ($("scan-status").textContent = SCAN_STEPS[++i % SCAN_STEPS.length]), 2800);
}

async function analyzePhoto(blob) {
  if (!$("consent").checked) return introError("Tick the box above to send your photo to YouCam first.");
  introError("");
  try {
    const photo = await preparePhoto(blob);
    state.photoUrl = URL.createObjectURL(photo);
    startAnalyzing(state.photoUrl, "Uploading your photo");
    const { fileId } = await api("/api/photo", { method: "POST", body: photo, headers: { "Content-Type": "image/jpeg" } });
    state.photo = { fileId };
    narrateScan();
    const { taskId } = await api("/api/analyze", { method: "POST", body: { fileId } });
    const { report } = await pollUntilDone(`/api/analyze/${encodeURIComponent(taskId)}`);
    openWorkspace(report);
  } catch (err) {
    show("view-intro");
    introError(err.message);
  } finally {
    clearInterval(scanTimer);
  }
}

async function analyzeSample() {
  introError("");
  state.photo = { sample: true };
  state.photoUrl = state.config.sampleImage;
  startAnalyzing(state.photoUrl, SCAN_STEPS[0]);
  try {
    const start = await api("/api/analyze", { method: "POST", body: { sample: true } });
    if (!start.report) narrateScan();
    const { report } = start.report ? start : await pollUntilDone(`/api/analyze/${encodeURIComponent(start.taskId)}?sample=1`);
    openWorkspace(report);
  } catch (err) {
    show("view-intro");
    introError(err.message);
  } finally {
    clearInterval(scanTimer);
  }
}

// ---------- workspace ----------

function setTab(tab) {
  $("view-workspace").dataset.tab = tab;
  $("tab-map").setAttribute("aria-selected", String(tab === "map"));
  $("tab-agent").setAttribute("aria-selected", String(tab === "agent"));
  if (tab === "agent") {
    $("agent-dot").hidden = true;
    scrollThread();
  }
}

function openWorkspace(report) {
  state.report = report;
  state.history = [];
  // Spot concerns start switched on; face-wide washes are opt-in.
  state.active = new Set(headline(report).filter((c) => !AREA.has(c.id)).map((c) => c.id));
  $("thread").replaceChildren();
  renderReport(report);
  setTab("map");
  show("view-workspace");
  greet(report);
}

function renderReport(report) {
  $("report-photo").src = report.imageUrl ?? state.photoUrl;
  $("overall-score").textContent = report.overall ?? "–";
  $("skin-age").textContent = report.skinAge ?? "–";
  $("skin-type").textContent = report.skinType.whole ?? "–";
  $("skin-zones").textContent = [report.skinType.tZone, report.skinType.uZone].filter(Boolean).join(" / ") || "–";

  $("concern-list").replaceChildren(...report.concerns.map((c) => {
    const button = el("button", { class: "concern", type: "button", "data-concern": c.id, "aria-pressed": String(state.active.has(c.id)), "aria-label": `${c.label}, ${c.score} out of 100. Show on map` },
      el("i"),
      el("span", { class: "name", text: c.label }, c.severity !== "low" ? el("span", { class: "flag", text: c.severity === "high" ? "needs care" : "worth a look" }) : null),
      el("span", { class: "score", text: String(c.score) }),
      el("span", { class: "switch", "aria-hidden": "true" }),
      el("span", { class: "bar-track" }, el("span", { style: `width:${c.score}%` })),
    );
    button.addEventListener("click", () => {
      if (state.active.has(c.id)) state.active.delete(c.id);
      else state.active.add(c.id);
      button.setAttribute("aria-pressed", String(state.active.has(c.id)));
      drawReportLayers();
    });
    return el("li", {}, button);
  }));
  drawReportLayers();
}

function drawReportLayers() {
  const map = $("report-photo").parentElement;
  drawLayers(map, $("report-layers"), state.report.concerns.filter((c) => state.active.has(c.id)));
}

// ---------- agent ----------

function greet(report) {
  const focus = report.concerns.filter((c) => c.severity !== "low").slice(0, 3);
  const strengths = report.concerns.filter((c) => c.severity === "low").slice(-2).map((c) => c.label.toLowerCase());
  let text = `I'm Glow. Your overall skin score is ${report.overall ?? "ready"}`;
  text += report.skinType.whole ? ` and your skin reads as ${report.skinType.whole.toLowerCase()}. ` : ". ";
  if (focus.length) text += `Worth working on: ${focus.map((c) => `${c.label.toLowerCase()} (${c.score})`).join(", ")}. `;
  if (strengths.length) text += `Your ${strengths.join(" and ")} look great. `;
  text += state.config.ai
    ? "Want a routine built around this, or should I match your foundation shade on your own photo?"
    : "Pick an option below to build a routine or match your foundation shade.";
  botSay(text);
  renderChips();
}

function renderChips() {
  const chips = state.config.ai
    ? ["Build my routine", "Keep it under $80", "Match my foundation shade", "Help my under-eyes"]
    : ["Build my routine", "Keep it under $80", "Match my foundation shade"];
  $("chips").replaceChildren(...chips.map((label) => el("button", { class: "chip", type: "button", text: label, onclick: () => onChip(label) })));
}

// Built-in versions of the suggestions, used without AI or when the AI is
// busy or out of its free quota, so a suggestion never dead-ends.
const LOCAL = {
  "Build my routine": (o) => localRoutine(null, [], o),
  "Keep it under $80": (o) => localRoutine(80, [], o),
  "Match my foundation shade": (o) => localShadeMatch(o),
  "Help my under-eyes": (o) => localRoutine(null, ["dark_circle_v2", "eye_bag"], o),
};

function onChip(label) {
  setTab("agent");
  if (state.config.ai) return send(label, { fallback: LOCAL[label] });
  LOCAL[label]?.();
}

function append(node) {
  $("thread").append(node);
  if ($("view-workspace").dataset.tab === "map" && MOBILE.matches) $("agent-dot").hidden = false;
  scrollThread();
  return node;
}

function botSay(text) {
  // The model is asked for plain text; strip any stray markdown emphasis.
  return append(el("div", { class: "msg bot", text: text.replace(/\*\*|__|`/g, "") }));
}

function userSay(text) {
  append(el("div", { class: "msg user", text }));
}

function scrollThread() {
  const t = $("thread");
  requestAnimationFrame(() => t.scrollTo({ top: t.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
}

function typing() {
  return append(el("div", { class: "msg bot typing", "aria-label": "Glow is typing" }, el("i"), el("i"), el("i")));
}

async function send(text, { fallback } = {}) {
  text = text.trim();
  if (!text || state.busy || !state.report) return;
  if (!state.config.ai) {
    userSay(text);
    botSay("Chat isn't switched on in this demo yet. Use the options below to build a routine or match your shade.");
    return;
  }
  state.busy = true;
  $("composer-send").disabled = true;
  userSay(text);
  state.history.push({ role: "user", content: text });
  const dots = typing();
  try {
    const result = await api("/api/agent", {
      method: "POST",
      body: { report: state.report, history: state.history, cart: state.cart, ...state.photo },
    });
    dots.remove();
    for (const event of result.ui ?? []) renderUi(event);
    if (result.cart) setCart(result.cart);
    botSay(result.reply);
    state.history.push({ role: "assistant", content: result.reply });
  } catch (err) {
    dots.remove();
    state.history.pop();
    if (fallback && (err.busy || err.status === 429)) {
      state.busy = false;
      $("composer-send").disabled = false;
      botSay("Glow's AI is busy right now, so here's the built-in version.");
      return fallback({ quiet: true });
    }
    botSay(err.message);
  } finally {
    state.busy = false;
    $("composer-send").disabled = false;
  }
}

function renderUi(event) {
  if (event.type === "routine") renderRoutine(event.routine, event.products);
  else if (event.type === "products") renderProducts(event.products, event.title);
  else if (event.type === "tryon") renderTryOn(event.product, event.renders);
  else if (event.type === "bag") setCart(event.cart);
  else if (event.type === "checkout") openBag();
}

// Used when no AI model is configured.
async function localRoutine(budget, focus = [], { quiet = false } = {}) {
  if (!quiet) userSay(budget ? `Build my routine, under $${budget}` : "Build my routine");
  try {
    const { routine, products } = await api("/api/routine", { method: "POST", body: { report: state.report, budget, focus } });
    renderRoutine(routine, products);
    botSay(`Built from your scores: ${products.length} products, ${usd(routine.total)} in total.`);
  } catch (err) {
    botSay(err.message);
  }
}

async function localShadeMatch({ quiet = false } = {}) {
  if (!quiet) userSay("Match my foundation shade");
  const tint = state.products.get("skin-tint");
  const mid = Math.floor(tint.shades.length / 2);
  // Same three the agent suggests by default (see shadeCandidates).
  const picks = tint.shades.slice(mid - 1, mid + 2);
  try {
    const renders = [];
    for (const shade of picks) {
      const { taskId } = await api("/api/tryon", { method: "POST", body: { productId: tint.id, shadeId: shade.id, ...state.photo } });
      renders.push({ shadeId: shade.id, shadeName: shade.name, hex: shade.hex, taskId });
    }
    renderTryOn(tint, renders);
    botSay("Three shades of the serum tint on your own photo. Pick the one that disappears into your skin.");
  } catch (err) {
    botSay(err.message);
  }
}

// ---------- cards ----------

function mini(product, color) {
  const node = el("span", { class: "mini", html: productArt(product, color) });
  node.style.setProperty("--tint", color ?? product.color);
  return node;
}

function remember(products) {
  for (const p of products) state.products.set(p.id, { ...state.products.get(p.id), ...p });
}

function renderRoutine(routine, products) {
  remember(products);
  const step = (s) => {
    const p = state.products.get(s.productId);
    return el("li", {}, mini(p), el("span", {}, el("b", { text: p.name }), el("small", { text: `${s.step}. ${s.why}` })));
  };
  const addAll = el("button", { class: "btn btn-ink btn-small", type: "button", text: `Add all ${routine.productIds.length} to bag` });
  addAll.addEventListener("click", () => {
    for (const id of routine.productIds) addToCart(id, null, 1, false);
    addAll.replaceChildren(el("span", { html: ICON.check }), "Added");
    addAll.disabled = true;
    openBag();
  });
  append(el("div", { class: "card" },
    el("h3", { text: "Your routine" }),
    el("p", { class: "sub", text: routine.budget ? `Built from your skin map, under $${routine.budget}.` : "Built from your skin map." }),
    el("div", { class: "routine" },
      el("div", {}, el("h4", { html: `${ICON.sun}Morning` }), el("ol", {}, routine.am.map(step))),
      el("div", {}, el("h4", { html: `${ICON.moon}Night` }), el("ol", {}, routine.pm.map(step))),
    ),
    routine.notes?.length ? el("ul", { class: "routine-notes" }, routine.notes.map((n) => el("li", { text: n }))) : null,
    el("div", { class: "card-foot" }, el("strong", { text: usd(routine.total) }), addAll),
  ));
}

function renderProducts(products, title) {
  append(el("div", { class: "card" },
    el("h3", { text: title ?? "Picked for you" }),
    el("p", { class: "sub", text: "Swipe to see more." }),
    el("div", { class: "shelf" }, products.map(productCard))));
}

function productCard(p) {
  remember([p]);
  const node = $("tpl-product").content.firstElementChild.cloneNode(true);
  const art = node.querySelector(".product-art");
  art.innerHTML = productArt(p);
  art.style.setProperty("--tint", p.color);
  node.querySelector("h3").textContent = p.name;
  node.querySelector(".product-meta").textContent = `${p.size}, with ${p.ingredients.slice(0, 2).join(" and ")}`;
  node.querySelector(".product-blurb").textContent = p.blurb;
  node.querySelector(".price").textContent = usd(p.price);
  let shadeId = null;
  if (p.shades) {
    const sw = node.querySelector(".swatches");
    sw.hidden = false;
    sw.setAttribute("aria-label", `${p.name} shades`);
    for (const s of p.shades) {
      const b = el("button", { class: "swatch", type: "button", style: `background:${s.hex}`, title: s.name, "aria-label": s.name, "aria-pressed": "false" });
      b.addEventListener("click", () => {
        shadeId = s.id;
        for (const x of sw.children) x.setAttribute("aria-pressed", String(x === b));
        art.innerHTML = productArt(p, s.hex);
        art.style.setProperty("--tint", s.hex);
      });
      sw.append(b);
    }
    const tryBtn = node.querySelector(".try");
    tryBtn.hidden = false;
    tryBtn.addEventListener("click", () => tryOnFromCard(p, shadeId));
  }
  const add = node.querySelector(".add");
  add.addEventListener("click", () => {
    if (p.shades && !shadeId) {
      add.textContent = "Pick a shade";
      return;
    }
    addToCart(p.id, shadeId, 1);
    add.replaceChildren(el("span", { html: ICON.check }), "Added");
  });
  return node;
}

async function tryOnFromCard(p, shadeId) {
  const shades = shadeId ? [p.shades.find((s) => s.id === shadeId)] : p.shades.slice(0, 3);
  try {
    const renders = [];
    for (const shade of shades) {
      const { taskId } = await api("/api/tryon", { method: "POST", body: { productId: p.id, shadeId: shade.id, ...state.photo } });
      renders.push({ shadeId: shade.id, shadeName: shade.name, hex: shade.hex, taskId });
    }
    renderTryOn(p, renders);
  } catch (err) {
    botSay(err.message);
  }
}

function renderTryOn(product, renders) {
  remember([product]);
  const row = el("div", { class: "compare" });
  for (const r of renders) {
    const shot = el("button", { class: "shot loading", type: "button", "aria-label": `Enlarge ${r.shadeName}`, disabled: true });
    const choose = el("button", { class: "btn btn-ink btn-small", type: "button", text: "Choose" });
    choose.addEventListener("click", () => {
      addToCart(product.id, r.shadeId, 1);
      choose.replaceChildren(el("span", { html: ICON.check }), "In bag");
      choose.disabled = true;
    });
    row.append(el("div", { class: "render" }, shot,
      el("footer", {}, el("i", { style: `background:${r.hex}` }), el("span", { text: r.shadeName }), choose)));
    pollUntilDone(`/api/tryon/${encodeURIComponent(r.taskId)}`, { interval: 2000, timeout: 90000 })
      .then(({ url }) => {
        const img = el("img", { src: url, alt: `${product.name} in ${r.shadeName} on your photo` });
        img.addEventListener("load", () => {
          shot.classList.remove("loading");
          shot.disabled = false;
        });
        shot.addEventListener("click", () => lightbox(url, img.alt));
        shot.append(img);
      })
      .catch((err) => {
        shot.classList.remove("loading");
        shot.append(el("p", { class: "err", text: err.message }));
      });
  }
  append(el("div", { class: "card" },
    el("h3", { text: `${product.name}, on you` }),
    el("p", { class: "sub", text: "Rendered on your photo by YouCam makeup try-on. Tap a photo to enlarge it." }),
    row));
}

function lightbox(src, alt) {
  const dialog = el("dialog", { class: "lightbox" }, el("img", { src, alt }));
  dialog.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

// ---------- bag ----------

function addToCart(productId, shadeId, qty, announce = true) {
  const line = state.cart.find((l) => l.productId === productId && l.shadeId === shadeId);
  if (line) line.qty = Math.min(5, line.qty + qty);
  else state.cart.push({ productId, shadeId, qty });
  setCart(state.cart);
  if (announce) $("bag-open").animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 260 });
}

function setCart(cart) {
  state.cart = cart.filter((l) => l.qty > 0 && state.products.has(l.productId));
  saveCart();
  renderBag();
}

function renderBag() {
  const count = state.cart.reduce((n, l) => n + l.qty, 0);
  const total = state.cart.reduce((sum, l) => sum + state.products.get(l.productId).price * l.qty, 0);
  $("bag-count").textContent = String(count);
  $("bag-count").hidden = count === 0;
  $("bag-open").setAttribute("aria-label", count ? `Bag, ${count} item${count === 1 ? "" : "s"}` : "Bag, empty");
  $("bag-empty").hidden = count > 0;
  $("bag-foot").hidden = count === 0;
  $("bag-total").textContent = usd(total);
  $("bag-lines").replaceChildren(...state.cart.map((l) => {
    const p = state.products.get(l.productId);
    const shade = p.shades?.find((s) => s.id === l.shadeId);
    const qty = (delta) => () => {
      l.qty = Math.max(0, Math.min(5, l.qty + delta));
      setCart(state.cart);
    };
    return el("li", { class: "bag-line" },
      mini(p, shade?.hex),
      el("div", {}, el("b", { text: p.name }),
        el("small", {}, shade ? el("i", { style: `background:${shade.hex}` }) : null, shade ? `${shade.name}, ${usd(p.price)}` : usd(p.price))),
      el("div", { class: "qty" },
        el("button", { type: "button", "aria-label": `One fewer ${p.name}`, text: "−", onclick: qty(-1) }),
        el("span", { text: String(l.qty) }),
        el("button", { type: "button", "aria-label": `One more ${p.name}`, text: "+", onclick: qty(1) })),
    );
  }));
}

let lastFocus = null;

function openBag() {
  lastFocus = document.activeElement;
  $("order-done").hidden = true;
  $("bag").hidden = false;
  $("scrim").hidden = false;
  renderBag();
  $("bag-close").focus({ focusVisible: false });
  if (state.cart.length) setupPayPal();
}

function closeBag() {
  $("bag").hidden = true;
  $("scrim").hidden = true;
  lastFocus?.focus?.();
}

function payError(message) {
  $("pay-error").textContent = message ?? "";
  $("pay-error").hidden = !message;
}

let paypalReady = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("PayPal didn't load. Check your connection and open the bag again."));
    document.head.append(s);
  });
}

// PayPal JS SDK v6: the button starts a one-time payment session; our server
// creates and captures the order.
function setupPayPal() {
  if (!state.config.paypalClientId) {
    payError("PayPal isn't set up in this demo.");
    return;
  }
  paypalReady ??= (async () => {
    await loadScript("https://www.sandbox.paypal.com/web-sdk/v6/core");
    const sdk = await window.paypal.createInstance({ clientId: state.config.paypalClientId, components: ["paypal-payments"] });
    const eligibility = await sdk.findEligibleMethods();
    if (!eligibility.isEligible("paypal")) throw new Error("PayPal isn't available in this browser.");
    const session = await sdk.createPayPalOneTimePaymentSession({
      onApprove: async ({ orderId }) => {
        try {
          orderPlaced(await api(`/api/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST" }));
        } catch (err) {
          payError(err.message);
        }
      },
      onCancel: () => payError("Payment cancelled. Your bag is still here."),
      onError: (err) => payError(err?.message ?? "PayPal couldn't finish the payment. Try again."),
    });
    const button = document.createElement("paypal-button");
    button.setAttribute("type", "pay");
    button.addEventListener("click", () => {
      payError("");
      const orderPromise = api("/api/orders", { method: "POST", body: { cart: state.cart } }).then(({ orderId }) => ({ orderId }));
      orderPromise.catch((err) => payError(err.message));
      session.start({ presentationMode: "auto" }, orderPromise).catch((err) => payError(err.message));
    });
    $("paypal-container").replaceChildren(button);
  })().catch((err) => {
    paypalReady = null;
    payError(err.message);
  });
}

function orderPlaced(order) {
  const items = state.cart.reduce((n, l) => n + l.qty, 0);
  setCart([]);
  $("bag-empty").hidden = true;
  $("order-done").hidden = false;
  $("order-done").replaceChildren(
    el("div", { class: "seal", html: ICON.check }),
    el("h3", { text: order.payerName ? `Paid. Thank you, ${order.payerName}.` : "Paid. Thank you." }),
    el("p", { text: `${items} item${items === 1 ? "" : "s"}${order.amount ? `, $${order.amount}` : ""}, paid with PayPal.` }),
    el("p", { class: "fine", text: `Order ${order.orderId}. This was a sandbox order, so nothing will ship.` }),
  );
  if (state.report) botSay(`Order ${order.orderId} is paid. Introduce new products one at a time, and give the routine 4 to 6 weeks. Come back for a fresh scan to see what changed.`);
}

// ---------- boot ----------

async function init() {
  try {
    const [config, products] = await Promise.all([api("/api/config"), api("/api/products")]);
    state.config = config;
    for (const p of products) state.products.set(p.id, p);
  } catch {
    introError("Glow Agent can't reach its server. Refresh the page to try again.");
  }
  $("agent-sub").textContent = state.config.ai ? "Shopping agent that knows your skin map" : "Routine builder. Chat is off in this demo.";
  setCart(state.cart);
  loadHero();

  $("btn-camera").addEventListener("click", openCamera);
  $("camera-cancel").addEventListener("click", closeCamera);
  $("camera").addEventListener("cancel", closeCamera);
  $("camera-shoot").addEventListener("click", capture);
  $("file-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) analyzePhoto(file);
  });
  $("btn-sample").addEventListener("click", analyzeSample);
  $("btn-restart").addEventListener("click", () => show("view-intro"));
  $("tab-map").addEventListener("click", () => setTab("map"));
  $("tab-agent").addEventListener("click", () => setTab("agent"));
  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("composer-input");
    send(input.value);
    input.value = "";
  });
  $("bag-open").addEventListener("click", openBag);
  $("bag-close").addEventListener("click", closeBag);
  $("scrim").addEventListener("click", closeBag);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("bag").hidden) closeBag();
  });
}

init();
