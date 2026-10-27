import { productArt } from "./product-art.js";

const $ = (id) => document.getElementById(id);
const CART_KEY = "glow-agent-bag";

const state = {
  config: { ai: false, paypalClientId: null, sampleImage: "/api/sample/asset/source" },
  products: new Map(),
  photo: null, // { fileId } or { sample: true }
  photoUrl: null,
  report: null,
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
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
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
  throw new Error("This is taking too long. Please try again.");
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c) node.append(c);
  return node;
}

const usd = (n) => `$${n.toFixed(2)}`;

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
    // Storage may be unavailable (private mode); the bag still works for this visit.
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

// ---------- photo capture ----------

let stream = null;

async function openCamera() {
  if (!$("consent").checked) return introError("Please tick the consent box first.");
  introError("");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
  } catch {
    return introError("Couldn't open the camera. Allow camera access, or upload a photo instead.");
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
  if (Math.min(width, height) < 480) throw new Error("That photo is too small. Use one at least 480 pixels on the short side.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

async function analyzePhoto(blob) {
  if (!$("consent").checked) return introError("Please tick the consent box first.");
  introError("");
  try {
    const photo = await preparePhoto(blob);
    state.photoUrl = URL.createObjectURL(photo);
    startAnalyzing(state.photoUrl, "Uploading your photo…");
    const { fileId } = await api("/api/photo", { method: "POST", body: photo, headers: { "Content-Type": "image/jpeg" } });
    state.photo = { fileId };
    $("scan-status").textContent = "YouCam is scanning 11 skin concerns…";
    const { taskId } = await api("/api/analyze", { method: "POST", body: { fileId } });
    const { report } = await pollUntilDone(`/api/analyze/${encodeURIComponent(taskId)}`);
    openWorkspace(report);
  } catch (err) {
    show("view-intro");
    introError(err.message);
  }
}

async function analyzeSample() {
  introError("");
  state.photo = { sample: true };
  state.photoUrl = state.config.sampleImage;
  startAnalyzing(state.photoUrl, "YouCam is scanning 11 skin concerns…");
  try {
    const start = await api("/api/analyze", { method: "POST", body: { sample: true } });
    const { report } = start.report ? start : await pollUntilDone(`/api/analyze/${encodeURIComponent(start.taskId)}?sample=1`);
    openWorkspace(report);
  } catch (err) {
    show("view-intro");
    introError(err.message);
  }
}

function startAnalyzing(src, status) {
  $("scan-photo").src = src;
  $("scan-status").textContent = status;
  show("view-analyzing");
}

// ---------- report ----------

function openWorkspace(report) {
  state.report = report;
  state.history = [];
  $("thread").replaceChildren();
  renderReport(report);
  show("view-workspace");
  greet(report);
}

function renderReport(report) {
  $("report-photo").src = report.imageUrl ?? state.photoUrl;
  $("report-mask").hidden = true;
  $("report-mask").parentElement.classList.remove("masked");
  $("mask-label").hidden = true;
  $("overall-score").textContent = report.overall ?? "–";
  $("overall-ring").style.setProperty("--value", report.overall ?? 0);
  $("skin-age").textContent = report.skinAge ?? "–";
  $("skin-type").textContent = report.skinType.whole ?? "–";
  $("skin-zones").textContent = [report.skinType.tZone, report.skinType.uZone].filter(Boolean).join(" / ") || "–";

  const list = $("concern-list");
  list.replaceChildren();
  for (const c of report.concerns) {
    const button = el("button", { class: `concern sev-${c.severity}`, type: "button", "aria-pressed": "false" },
      el("span", { class: "name", text: c.label }),
      el("span", { class: "score", text: String(c.score) }),
      el("span", { class: "bar" }, el("i", { style: `width:${c.score}%` })),
    );
    button.addEventListener("click", () => toggleMask(c, button));
    list.append(el("li", {}, button));
  }
}

function toggleMask(concern, button) {
  const pressed = button.getAttribute("aria-pressed") === "true";
  for (const b of $("concern-list").querySelectorAll(".concern")) b.setAttribute("aria-pressed", "false");
  const stage = $("report-mask").parentElement;
  if (pressed || !concern.maskUrl) {
    $("report-mask").hidden = true;
    $("mask-label").hidden = true;
    stage.classList.remove("masked");
    return;
  }
  button.setAttribute("aria-pressed", "true");
  $("report-mask").style.setProperty("--mask", `url("${concern.maskUrl}")`);
  $("report-mask").hidden = false;
  stage.classList.add("masked");
  $("mask-label").textContent = `${concern.label}: ${concern.score}/100`;
  $("mask-label").hidden = false;
}

// ---------- agent ----------

function greet(report) {
  const focus = report.concerns.filter((c) => c.severity !== "low").slice(0, 3);
  const strengths = report.concerns.filter((c) => c.severity === "low").slice(-2).map((c) => c.label.toLowerCase());
  let text = `Hi, I'm Glow. Your overall skin score is ${report.overall ?? "in"}`;
  text += report.skinType.whole ? ` and your skin reads as ${report.skinType.whole.toLowerCase()}. ` : ". ";
  if (focus.length) text += `The areas worth working on: ${focus.map((c) => `${c.label.toLowerCase()} (${c.score})`).join(", ")}. `;
  if (strengths.length) text += `Your ${strengths.join(" and ")} look great. `;
  text += state.config.ai
    ? "Want me to build a routine around this, or match your foundation shade on your own face?"
    : "Tap below to build a routine or match your foundation shade.";
  botSay(text);
  renderChips();
}

function renderChips() {
  const chips = state.config.ai
    ? ["Build my routine", "Routine under $80", "Match my foundation shade", "Brighten my under-eyes"]
    : ["Build my routine", "Routine under $80", "Match my foundation shade"];
  $("chips").replaceChildren(...chips.map((label) => el("button", { class: "chip", type: "button", text: label, onclick: () => onChip(label) })));
}

function onChip(label) {
  if (state.config.ai) return send(label);
  if (label === "Build my routine") return localRoutine(null);
  if (label === "Routine under $80") return localRoutine(80);
  if (label === "Match my foundation shade") return localShadeMatch();
}

function botSay(text) {
  // The model is asked for plain text; strip any stray markdown emphasis.
  const node = el("div", { class: "msg bot", text: text.replace(/\*\*|__|`/g, "") });
  $("thread").append(node);
  scrollThread();
  return node;
}

function userSay(text) {
  $("thread").append(el("div", { class: "msg user", text }));
  scrollThread();
}

function scrollThread() {
  const t = $("thread");
  requestAnimationFrame(() => (t.scrollTop = t.scrollHeight));
  t.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function send(text) {
  text = text.trim();
  if (!text || state.busy || !state.report) return;
  if (!state.config.ai) {
    userSay(text);
    botSay("The chat agent isn't switched on in this demo yet. Use the buttons below to build a routine or match your shade.");
    return;
  }
  state.busy = true;
  $("composer-send").disabled = true;
  userSay(text);
  state.history.push({ role: "user", content: text });
  const typing = el("div", { class: "msg bot typing", text: "Thinking" });
  $("thread").append(typing);
  scrollThread();
  try {
    const result = await api("/api/agent", {
      method: "POST",
      body: { report: state.report, history: state.history, cart: state.cart, ...state.photo },
    });
    typing.remove();
    for (const event of result.ui ?? []) renderUi(event);
    if (result.cart) setCart(result.cart);
    botSay(result.reply);
    state.history.push({ role: "assistant", content: result.reply });
  } catch (err) {
    typing.remove();
    botSay(err.message);
    state.history.pop();
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

// Fallbacks used when no AI model is configured.
async function localRoutine(budget) {
  userSay(budget ? `Build my routine under $${budget}` : "Build my routine");
  try {
    const { routine, products } = await api("/api/routine", { method: "POST", body: { report: state.report, budget } });
    renderRoutine(routine, products);
    botSay(`Here's a routine built from your scores: ${usd(routine.total)} for ${products.length} products.`);
  } catch (err) {
    botSay(err.message);
  }
}

async function localShadeMatch() {
  userSay("Match my foundation shade");
  const tint = state.products.get("skin-tint");
  const shades = tint.shades;
  // Same three the agent suggests by default (see shadeCandidates).
  const mid = Math.floor(shades.length / 2);
  const picks = shades.slice(mid - 1, mid + 2);
  try {
    const renders = [];
    for (const shade of picks) {
      const { taskId } = await api("/api/tryon", { method: "POST", body: { productId: tint.id, shadeId: shade.id, ...state.photo } });
      renders.push({ shadeId: shade.id, shadeName: shade.name, hex: shade.hex, taskId });
    }
    renderTryOn(tint, renders);
    botSay("Here are three shades of our Serum Tint on your own face. Pick the one that disappears into your skin.");
  } catch (err) {
    botSay(err.message);
  }
}

// ---------- cards ----------

function mini(product, color) {
  return el("span", { class: "mini", html: productArt(product, color) });
}

function renderRoutine(routine, products) {
  for (const p of products) state.products.set(p.id, { ...state.products.get(p.id), ...p });
  const step = (s) => {
    const p = state.products.get(s.productId);
    return el("li", {}, mini(p), el("span", {}, el("b", { text: `${s.step} · ${p.name}` }), el("small", { text: s.why })));
  };
  const addAll = el("button", { class: "btn small primary", type: "button", text: `Add all ${routine.productIds.length} to bag` });
  addAll.addEventListener("click", () => {
    for (const id of routine.productIds) addToCart(id, null, 1, false);
    addAll.textContent = "Added ✓";
    addAll.disabled = true;
    openBag();
  });
  const card = el("div", { class: "card" },
    el("h3", { text: "Your routine" }),
    el("p", { class: "sub", text: routine.budget ? `Built from your skin report, under $${routine.budget}.` : "Built from your skin report." }),
    el("div", { class: "routine-cols" },
      el("div", {}, el("h4", { text: "Morning" }), el("ol", {}, routine.am.map(step))),
      el("div", {}, el("h4", { text: "Night" }), el("ol", {}, routine.pm.map(step))),
    ),
    routine.notes?.length ? el("ul", { class: "routine-notes" }, routine.notes.map((n) => el("li", { text: n }))) : null,
    el("div", { class: "routine-foot" }, el("strong", { text: `Total ${usd(routine.total)}` }), addAll),
  );
  $("thread").append(card);
  scrollThread();
}

function renderProducts(products, title) {
  const grid = el("div", { class: "products" }, products.map(productCard));
  $("thread").append(el("div", { class: "card" }, title ? el("h3", { text: title }) : null, grid));
  scrollThread();
}

function productCard(p) {
  state.products.set(p.id, { ...state.products.get(p.id), ...p });
  const node = $("tpl-product").content.firstElementChild.cloneNode(true);
  const art = node.querySelector(".product-art");
  art.innerHTML = productArt(p);
  node.querySelector("h3").textContent = p.name;
  node.querySelector(".product-meta").textContent = `${p.size} · ${p.ingredients.slice(0, 2).join(", ")}`;
  node.querySelector(".product-blurb").textContent = p.blurb;
  node.querySelector(".price").textContent = usd(p.price);
  let shadeId = null;
  if (p.shades) {
    const sw = node.querySelector(".swatches");
    sw.hidden = false;
    for (const s of p.shades) {
      const b = el("button", { class: "swatch", type: "button", style: `background:${s.hex}`, title: s.name, "aria-label": s.name, "aria-pressed": "false" });
      b.addEventListener("click", () => {
        shadeId = s.id;
        for (const x of sw.children) x.setAttribute("aria-pressed", String(x === b));
        art.innerHTML = productArt(p, s.hex);
      });
      sw.append(b);
    }
    const tryBtn = node.querySelector(".try");
    tryBtn.hidden = false;
    tryBtn.addEventListener("click", () => tryOnFromCard(p, shadeId));
  }
  node.querySelector(".add").addEventListener("click", (e) => {
    if (p.shades && !shadeId) {
      e.target.textContent = "Pick a shade";
      return;
    }
    addToCart(p.id, shadeId, 1);
    e.target.textContent = "Added ✓";
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
  state.products.set(product.id, { ...state.products.get(product.id), ...product });
  const grid = el("div", { class: "tryon-grid" });
  for (const r of renders) {
    const shot = el("div", { class: "shot loading" });
    const choose = el("button", { class: "btn small primary", type: "button", text: "Choose" });
    choose.addEventListener("click", () => {
      addToCart(product.id, r.shadeId, 1);
      choose.textContent = "In bag ✓";
      choose.disabled = true;
    });
    grid.append(el("div", { class: "render" }, shot,
      el("footer", {}, el("i", { style: `background:${r.hex}` }), el("span", { text: r.shadeName }), choose)));
    pollUntilDone(`/api/tryon/${encodeURIComponent(r.taskId)}`, { interval: 2000, timeout: 90000 })
      .then(({ url }) => {
        const img = el("img", { src: url, alt: `${product.name} in ${r.shadeName} on your photo` });
        img.addEventListener("load", () => shot.classList.remove("loading"));
        shot.addEventListener("click", () => lightbox(url, img.alt));
        shot.append(img);
      })
      .catch((err) => {
        shot.classList.remove("loading");
        shot.append(el("p", { class: "fine", style: "padding:12px", text: err.message }));
      });
  }
  $("thread").append(el("div", { class: "card" },
    el("h3", { text: `${product.name}: try-on` }),
    el("p", { class: "sub", text: "Rendered on your photo by YouCam makeup try-on. Tap to enlarge." }),
    grid));
  scrollThread();
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
  if (announce) bumpBag();
}

function setCart(cart) {
  state.cart = cart.filter((l) => l.qty > 0 && state.products.has(l.productId));
  saveCart();
  renderBag();
}

function bumpBag() {
  $("bag-open").animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 300 });
}

function cartTotal() {
  return state.cart.reduce((sum, l) => sum + state.products.get(l.productId).price * l.qty, 0);
}

function renderBag() {
  const count = state.cart.reduce((n, l) => n + l.qty, 0);
  $("bag-count").textContent = String(count);
  $("bag-count").hidden = count === 0;
  $("bag-empty").hidden = count > 0;
  $("bag-foot").hidden = count === 0;
  $("bag-total").textContent = usd(cartTotal());
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
        el("small", {}, shade ? el("i", { style: `background:${shade.hex}` }) : null, shade ? shade.name : usd(p.price))),
      el("div", { class: "qty" },
        el("button", { type: "button", "aria-label": `Remove one ${p.name}`, text: "−", onclick: qty(-1) }),
        el("span", { text: String(l.qty) }),
        el("button", { type: "button", "aria-label": `Add one ${p.name}`, text: "+", onclick: qty(1) })),
    );
  }));
}

function openBag() {
  $("order-done").hidden = true;
  $("bag").hidden = false;
  $("scrim").hidden = false;
  renderBag();
  if (state.cart.length) setupPayPal();
}

function closeBag() {
  $("bag").hidden = true;
  $("scrim").hidden = true;
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
    s.onerror = () => reject(new Error("Couldn't load PayPal."));
    document.head.append(s);
  });
}

// PayPal JS SDK v6: the button starts a one-time payment session; the order
// is created and captured by our server.
function setupPayPal() {
  if (!state.config.paypalClientId) {
    payError("PayPal isn't configured in this demo.");
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
          const order = await api(`/api/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST" });
          orderPlaced(order);
        } catch (err) {
          payError(err.message);
        }
      },
      onCancel: () => payError("Payment cancelled. Your bag is still here."),
      onError: (err) => payError(err?.message ?? "PayPal ran into a problem."),
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
    el("div", { class: "check", text: "✓" }),
    el("h3", { text: order.payerName ? `Thank you, ${order.payerName}!` : "Order placed!" }),
    el("p", { text: `${items} item${items === 1 ? "" : "s"}, ${order.amount ? `$${order.amount}` : ""} paid with PayPal.` }),
    el("p", { class: "fine", text: `Order ${order.orderId} · ${order.status}. Sandbox order: nothing will ship.` }),
  );
  if (state.report) botSay(`Your order ${order.orderId} is confirmed. Start the routine slowly and give it 4 to 6 weeks before judging results. Come back for a fresh scan to track progress!`);
}

// ---------- boot ----------

async function init() {
  try {
    const [config, products] = await Promise.all([api("/api/config"), api("/api/products")]);
    state.config = config;
    for (const p of products) state.products.set(p.id, p);
  } catch {
    introError("Couldn't reach the server. Refresh to try again.");
  }
  $("agent-sub").textContent = state.config.ai ? "AI shopping agent · knows your skin report" : "Routine builder (AI chat offline)";
  setCart(state.cart);

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
