import { PRODUCTS, CONCERNS, getProduct, suitsSkinType } from "./catalog.js";

const MAKEUP = new Set(["foundation", "concealer", "lip", "blush"]);

// How much each concern needs work: 0 when the score is 90 or better.
export function needsFrom(report) {
  const needs = {};
  for (const c of report.concerns) needs[c.id] = Math.max(0, 90 - c.score) / 10;
  return needs;
}

function score(product, needs, skinType) {
  if (!suitsSkinType(product, skinType)) return -Infinity;
  return product.concerns.reduce((sum, c) => sum + (needs[c] ?? 0), 0);
}

function best(category, needs, skinType, when) {
  const options = PRODUCTS.filter(
    (p) => p.category === category && (when === undefined || p.when === when || p.when === "both"),
  );
  let top = null;
  let topScore = -Infinity;
  for (const p of options) {
    const s = score(p, needs, skinType);
    if (s > topScore) [top, topScore] = [p, s];
  }
  return top ? { product: top, score: topScore } : null;
}

function why(product, needs) {
  const hits = product.concerns.filter((c) => (needs[c] ?? 0) > 0).sort((a, b) => needs[b] - needs[a]);
  if (hits.length === 0) return product.blurb;
  return `Targets ${hits.slice(0, 2).map((c) => CONCERNS[c].toLowerCase()).join(" and ")}.`;
}

// Builds an AM/PM routine from the skin report. Deterministic, so it works
// without the AI model and gives the agent a grounded starting point.
// focus: optional concern ids the user cares about most (weighted up).
// budget: optional max total in USD; optional steps are dropped to fit.
export function buildRoutine(report, { focus = [], budget = null } = {}) {
  const skinType = report.skinType.whole;
  const needs = needsFrom(report);
  for (const c of focus) if (CONCERNS[c]) needs[c] = (needs[c] ?? 0) + 1.5;

  const am = [];
  const pm = [];
  const add = (list, step, pick, required = false) => {
    if (pick) list.push({ step, productId: pick.product.id, why: why(pick.product, needs), required, value: pick.score });
  };

  const cleanser = best("cleanser", needs, skinType, "both") ?? best("cleanser", needs, null, "both");
  add(am, "Cleanse", cleanser, true);
  add(pm, "Cleanse", cleanser, true);

  const amSerum = best("serum", needs, skinType, "am");
  if (amSerum?.score > 0) add(am, "Treat", amSerum);

  const pmTreatment = best("treatment", needs, skinType, "pm");
  if (pmTreatment?.score > 0) add(pm, "Treat", pmTreatment);

  // Night serum: repeat the morning one when it's made for both, otherwise
  // the best serum that can be used at night.
  const pmSerum = amSerum?.product.when === "both" ? amSerum : best("serum", needs, skinType, "both");
  if (pmSerum?.score > 0) add(pm, "Treat", pmSerum);

  const eyeNeed = (needs.dark_circle_v2 ?? 0) + (needs.eye_bag ?? 0);
  if (eyeNeed > 0.5) {
    const eye = best("eye", needs, skinType);
    add(am, "Eyes", eye);
    add(pm, "Eyes", eye);
  }

  const moisturizer = best("moisturizer", needs, skinType) ?? best("moisturizer", needs, null);
  add(am, "Moisturize", moisturizer, true);
  add(pm, "Moisturize", moisturizer, true);

  add(am, "Protect", best("sunscreen", needs, null, "am"), true);

  let routine = finalize(am, pm);
  if (budget !== null) routine = fitBudget(routine, budget);
  return routine;
}

function finalize(am, pm) {
  const ids = [...new Set([...am, ...pm].map((s) => s.productId))];
  const total = ids.reduce((sum, id) => sum + getProduct(id).price, 0);
  const notes = [];
  if (ids.includes("retinal-serum")) notes.push("Start retinal 3 nights a week and never skip SPF the next morning.");
  if (ids.includes("vitamin-c-serum")) notes.push("Vitamin C goes on in the morning, under sunscreen.");
  return { am, pm, productIds: ids, total, notes };
}

// Keeps the set of optional products with the most value that fits the
// budget. There are at most a handful of optional products, so trying every
// subset is cheap.
function fitBudget(routine, budget) {
  if (routine.total <= budget) return { ...routine, budget };
  const steps = [...routine.am, ...routine.pm];
  const optional = [...new Set(steps.filter((s) => !s.required).map((s) => s.productId))];
  const value = (id) => Math.max(...steps.filter((s) => s.productId === id).map((s) => s.value));
  let keep = [];
  let keepValue = -1;
  for (let mask = 0; mask < 1 << optional.length; mask++) {
    const ids = optional.filter((_, i) => mask & (1 << i));
    const kept = new Set(ids);
    const candidate = finalize(...[routine.am, routine.pm].map((list) => list.filter((s) => s.required || kept.has(s.productId))));
    const v = ids.reduce((sum, id) => sum + value(id), 0);
    if (candidate.total <= budget && v > keepValue) [keep, keepValue] = [ids, v];
  }
  const kept = new Set(keep);
  const result = finalize(...[routine.am, routine.pm].map((list) => list.filter((s) => s.required || kept.has(s.productId))));
  const dropped = optional.filter((id) => !kept.has(id));
  return { ...result, budget, dropped, ...(result.total > budget && { overBudget: true }) };
}

// Search used by the agent's search_products tool.
export function searchProducts({ concern, category, skinType, maxPrice, makeup } = {}) {
  return PRODUCTS.filter((p) =>
    (!concern || p.concerns.includes(concern)) &&
    (!category || p.category === category) &&
    (!maxPrice || p.price <= maxPrice) &&
    (makeup === undefined || MAKEUP.has(p.category) === makeup) &&
    suitsSkinType(p, skinType),
  );
}

// Suggests foundation/concealer shades to compare on the user's face: the
// middle of the range plus its neighbours, or around a depth the user picked.
export function shadeCandidates(product, depth = null) {
  const shades = product.tryOn?.shades ?? [];
  if (shades.length <= 3) return shades;
  const center = depth === null ? Math.floor(shades.length / 2) : nearestIndex(shades, depth);
  const start = Math.min(Math.max(center - 1, 0), shades.length - 3);
  return shades.slice(start, start + 3);
}

function nearestIndex(shades, depth) {
  let best = 0;
  for (let i = 1; i < shades.length; i++) {
    if (Math.abs((shades[i].depth ?? i) - depth) < Math.abs((shades[best].depth ?? best) - depth)) best = i;
  }
  return best;
}
