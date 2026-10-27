// The shopping agent: an AI model with tools over the skin report, the
// catalog, YouCam makeup try-on and the PayPal bag. Works with any
// OpenAI-compatible chat completions API that supports tool calling.
//
// Tools never move money. start_checkout only opens the PayPal button; the
// user approves the payment in PayPal's own window.

import { PRODUCTS, getProduct, getShade, summarize, CONCERNS } from "./catalog.js";
import { buildRoutine, searchProducts, shadeCandidates } from "./recommend.js";
import { describeReport } from "./report.js";
import { priceCart } from "./paypal.js";

const MAX_ROUNDS = 5;
const CONCERN_IDS = Object.keys(CONCERNS);

export const TOOLS = [
  {
    name: "build_routine",
    description: "Build a morning and night routine from the user's skin report using this shop's products. Call this first when the user wants a routine.",
    parameters: {
      type: "object",
      properties: {
        focus_concerns: { type: "array", items: { type: "string", enum: CONCERN_IDS }, description: "Concerns the user said they care about most." },
        budget: { type: "number", description: "Maximum total in USD, if the user gave one." },
      },
    },
  },
  {
    name: "search_products",
    description: "Search the catalog. Returns matching products with prices, ingredients and shades.",
    parameters: {
      type: "object",
      properties: {
        concern: { type: "string", enum: CONCERN_IDS },
        category: { type: "string", enum: ["cleanser", "toner", "serum", "treatment", "moisturizer", "sunscreen", "eye", "mask", "foundation", "concealer", "lip", "blush"] },
        max_price: { type: "number" },
        makeup: { type: "boolean", description: "true for makeup only, false for skincare only." },
      },
    },
  },
  {
    name: "show_products",
    description: "Show product cards to the user (with Add to bag buttons).",
    parameters: {
      type: "object",
      properties: {
        product_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        title: { type: "string" },
      },
      required: ["product_ids"],
    },
  },
  {
    name: "try_on",
    description: "Render makeup shades on the user's own selfie with YouCam virtual try-on so they can compare. Only for products that have shades. Pass up to 3 shade ids; omit shade_ids to try three suggested shades.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        shade_ids: { type: "array", items: { type: "string" }, maxItems: 3 },
      },
      required: ["product_id"],
    },
  },
  {
    name: "add_to_bag",
    description: "Add products to the user's bag. Only do this when the user asked to buy or add them. Products with shades need a shade_id.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: { product_id: { type: "string" }, shade_id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 5 } },
            required: ["product_id"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "start_checkout",
    description: "Open PayPal checkout for the current bag. The user approves the payment themselves in PayPal.",
    parameters: { type: "object", properties: {} },
  },
];

export function systemPrompt(report, cart) {
  return [
    "You are Glow, the shopping agent of Glow Agent, an online skincare and makeup shop.",
    "The user took a selfie and YouCam AI Skin Analysis scored their skin. Scores run 1-100 and higher means healthier skin; under 85 is worth working on.",
    "Ground every recommendation in their report and cite the relevant scores. Recommend only this shop's products, found through your tools; never invent products, prices or ingredients.",
    "Write plain text with no markdown, at most 3 short sentences, warm and specific. Tool results are shown to the user as cards, so never repeat product lists in text; say why they fit and what to do next.",
    "If a budget left a product out, mention what it would add and its price.",
    "For a routine, call build_routine, then explain it briefly. For foundation or concealer shade matching, call try_on so the user can compare shades on their own face, then ask which looks most natural.",
    "Only mention shades, products and prices that appear in a tool result or the catalog index below.",
    "Add to the bag only when the user asks. Call start_checkout when they want to pay; you cannot complete payment yourself.",
    "Only help with skin care, makeup, the user's skin report and this shop. If asked for anything else (code, homework, general chat), say in one sentence that you can only help with their skin and this shop.",
    "This is cosmetic guidance, not medical advice. If the user mentions severe or painful acne, a changing mole, or a skin condition, suggest seeing a dermatologist.",
    "Catalog index (id | name | category | price | shade ids):",
    ...PRODUCTS.map((p) => `${p.id} | ${p.name} | ${p.category} | $${p.price}${p.tryOn ? ` | ${p.tryOn.shades.map((s) => s.id).join(",")}` : ""}`),
    `Skin report: ${JSON.stringify(describeReport(report))}`,
    `Bag: ${cart.length ? JSON.stringify(cart) : "empty"}`,
  ].join("\n");
}

// Runs one user turn. deps: { chat(messages, tools), startTryOn(product, shade) }.
// Returns { reply, ui: [...events], cart }.
export async function runAgent({ report, history, cart }, deps) {
  const ui = [];
  let bag = sanitizeCart(cart);
  const messages = [{ role: "system", content: systemPrompt(report, bag) }, ...history];

  // Identical tool calls within a turn reuse the first result, so a model that
  // repeats itself can't render the same card twice or spend extra units.
  const seen = new Map();
  let forceReply = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    let message;
    try {
      message = await deps.chat(messages, TOOLS, { toolChoice: forceReply || lastRound ? "none" : "auto" });
    } catch (err) {
      // Keep whatever the tools already did (cards, bag changes) if the model
      // fails partway through a turn.
      if (ui.length > 0) return { reply: "Done. Take a look above and tell me what you'd like next.", ui, cart: bag };
      throw err;
    }
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) return { reply: checkShadeNames(message.content?.trim() || "Done. What would you like to do next?", ui), ui, cart: bag };

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    for (const call of calls) {
      const key = `${call.function.name}:${call.function.arguments ?? ""}`;
      let result;
      if (seen.has(key)) {
        result = { ...seen.get(key), note: "Already done and shown to the user. Reply to the user now." };
        forceReply = true;
      } else {
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          result = await runTool(call.function.name, args, { report, ui, deps, getBag: () => bag, setBag: (b) => { bag = b; } });
        } catch (err) {
          result = { error: err.message };
        }
        seen.set(key, result);
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "Here's what I put together. What would you like to do next?", ui, cart: bag };
}

async function runTool(name, args, ctx) {
  const { report, ui, deps } = ctx;
  switch (name) {
    case "build_routine": {
      const focus = (args.focus_concerns ?? []).filter((c) => CONCERNS[c]);
      const budget = typeof args.budget === "number" && args.budget > 0 ? args.budget : null;
      const routine = buildRoutine(report, { focus, budget });
      ui.push({ type: "routine", routine, products: routine.productIds.map((id) => summarize(getProduct(id))) });
      return {
        am: routine.am.map((s) => `${s.step}: ${getProduct(s.productId).name} - ${s.why}`),
        pm: routine.pm.map((s) => `${s.step}: ${getProduct(s.productId).name} - ${s.why}`),
        total_usd: routine.total,
        notes: routine.notes,
        over_budget: routine.overBudget ?? false,
        left_out_for_budget: (routine.dropped ?? []).map((id) => `${getProduct(id).name} ($${getProduct(id).price})`),
        shown_to_user: "The user sees this routine as a card. Don't list its steps again.",
      };
    }
    case "search_products": {
      const found = searchProducts({
        concern: args.concern,
        category: args.category,
        maxPrice: args.max_price,
        makeup: args.makeup,
        skinType: report.skinType.whole,
      });
      return found.map(summarize);
    }
    case "show_products": {
      const products = (args.product_ids ?? []).map(getProduct).filter(Boolean).slice(0, 6);
      if (products.length === 0) return { error: "None of those product ids exist." };
      ui.push({ type: "products", title: args.title ?? null, products: products.map(summarize) });
      return { shown: products.map((p) => p.id) };
    }
    case "try_on": {
      const product = getProduct(args.product_id);
      if (!product?.tryOn) return { error: "That product has no shades to try on." };
      const shades = (args.shade_ids?.length ? args.shade_ids.map((id) => getShade(product, id)).filter(Boolean) : shadeCandidates(product)).slice(0, 3);
      if (shades.length === 0) return { error: "Unknown shade ids." };
      const started = [];
      for (const shade of shades) started.push({ shade, taskId: await deps.startTryOn(product, shade) });
      ui.push({ type: "tryon", product: summarize(product), renders: started.map(({ shade, taskId }) => ({ shadeId: shade.id, shadeName: shade.name, hex: shade.hex, taskId })) });
      const names = shades.map((s) => s.name).join(", ");
      return { rendered_shades: names, note: `The user now sees exactly these shades on their own face: ${names}. Name only these, never other shades.` };
    }
    case "add_to_bag": {
      const next = [...ctx.getBag()];
      for (const item of args.items ?? []) {
        const product = getProduct(item.product_id);
        if (!product) return { error: `Unknown product ${item.product_id}` };
        if (product.tryOn && !getShade(product, item.shade_id)) {
          return { error: `${product.name} needs a shade_id. Options: ${product.tryOn.shades.map((s) => s.id).join(", ")}` };
        }
        const shadeId = product.tryOn ? item.shade_id : null;
        const existing = next.find((l) => l.productId === product.id && l.shadeId === shadeId);
        if (existing) existing.qty = Math.min(5, existing.qty + (item.qty ?? 1));
        else next.push({ productId: product.id, shadeId, qty: Math.min(5, Math.max(1, item.qty ?? 1)) });
      }
      ctx.setBag(next);
      ui.push({ type: "bag", cart: next });
      return { bag: next, total_usd: priceCart(next).total };
    }
    case "start_checkout": {
      const bag = ctx.getBag();
      if (bag.length === 0) return { error: "The bag is empty." };
      ui.push({ type: "checkout" });
      return { opened: true, total_usd: priceCart(bag).total, note: "The user approves payment in PayPal." };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// Shade names that are ordinary words ("light coverage", "rich texture") and
// can't be told apart from prose, so they aren't checked.
const COMMON_WORDS = new Set(["light", "medium", "deep", "rich", "tan"]);

// Small models sometimes name shades they didn't render. If this turn rendered
// try-ons and the reply names any other shade of those products, replace the
// reply with an accurate one.
export function checkShadeNames(reply, ui) {
  const renders = ui.filter((e) => e.type === "tryon");
  if (renders.length === 0) return reply;
  const shown = new Set(renders.flatMap((e) => e.renders.map((r) => r.shadeName.toLowerCase())));
  const others = renders
    .flatMap((e) => getProduct(e.product.id).tryOn.shades.map((s) => s.name.toLowerCase()))
    .filter((name) => !shown.has(name) && !COMMON_WORDS.has(name));
  const text = reply.toLowerCase();
  if (!others.some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text))) return reply;
  const names = renders.flatMap((e) => e.renders.map((r) => r.shadeName));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `Here are ${list} on your own photo. Which one looks most natural on you?`;
}

// Keeps only valid lines from the browser's bag.
export function sanitizeCart(cart) {
  if (!Array.isArray(cart)) return [];
  return cart
    .map((l) => ({ productId: String(l?.productId ?? ""), shadeId: l?.shadeId ?? null, qty: Number(l?.qty) }))
    .filter((l) => {
      const p = getProduct(l.productId);
      return p && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 5 && (!p.tryOn || getShade(p, l.shadeId));
    })
    .slice(0, 20);
}

// OpenAI-compatible chat completions client.
export function createChat(env, fetcher = fetch) {
  return async function chat(messages, tools, { toolChoice = "auto" } = {}) {
    const res = await fetcher(`${env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AI_API_KEY}`, "Content-Type": "application/json" },
      // To force a final text reply, send no tools at all: some providers
      // reject tool_choice "none" when the model still tries to call one.
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages,
        ...(toolChoice !== "none" && { tools: tools.map((t) => ({ type: "function", function: t })), tool_choice: toolChoice }),
        temperature: 0.4,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429) throw Object.assign(new Error("Glow's AI has reached its free limit for now. Try again in a minute."), { busy: true });
    if (!res.ok) throw new Error(json.error?.message ?? `AI request failed (${res.status})`);
    return json.choices?.[0]?.message ?? { content: "" };
  };
}
