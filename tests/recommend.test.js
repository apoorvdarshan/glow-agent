import { describe, expect, it } from "vitest";
import { buildRoutine, searchProducts, shadeCandidates } from "../src/recommend.js";
import { normalizeReport } from "../src/report.js";
import { getProduct, PRODUCTS } from "../src/catalog.js";
import { SKIN_OUTPUT, OILY_ACNE_REPORT } from "./fixtures.js";

const ids = (steps) => steps.map((s) => s.productId);

describe("buildRoutine", () => {
  it("always includes cleanser, moisturizer and morning SPF", () => {
    for (const report of [OILY_ACNE_REPORT, normalizeReport(SKIN_OUTPUT)]) {
      const r = buildRoutine(report);
      expect(r.am[0].step).toBe("Cleanse");
      expect(r.pm[0].step).toBe("Cleanse");
      expect(ids(r.am)).toContain("spf50");
      expect(r.am.some((s) => s.step === "Moisturize")).toBe(true);
      expect(r.pm.some((s) => s.step === "Moisturize")).toBe(true);
    }
  });

  it("targets breakouts and oil for oily, acne-prone skin", () => {
    const r = buildRoutine(OILY_ACNE_REPORT);
    expect(ids(r.am)).toContain("gel-cleanser");
    expect(ids(r.am)).toContain("gel-moisturizer");
    expect(r.productIds).toContain("niacinamide-serum");
    const pmTreat = r.pm.find((s) => s.step === "Treat" && getProduct(s.productId).category === "treatment");
    expect(pmTreat).toBeTruthy();
    expect(getProduct(pmTreat.productId).concerns).toContain("acne");
  });

  it("adds eye cream when dark circles or puffiness need work", () => {
    expect(buildRoutine(normalizeReport(SKIN_OUTPUT)).productIds).toContain("eye-cream");
    expect(buildRoutine(OILY_ACNE_REPORT).productIds).not.toContain("eye-cream");
  });

  it("never pairs two strong night actives", () => {
    for (const report of [OILY_ACNE_REPORT, normalizeReport(SKIN_OUTPUT)]) {
      const strong = buildRoutine(report).pm.filter((s) => getProduct(s.productId).strongActive);
      expect(strong.length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps vitamin C out of the night routine", () => {
    const report = { ...OILY_ACNE_REPORT, concerns: [{ id: "radiance", score: 60 }, { id: "age_spot", score: 62 }] };
    const r = buildRoutine(report);
    expect(ids(r.pm)).not.toContain("vitamin-c-serum");
  });

  it("totals unique products only", () => {
    const r = buildRoutine(normalizeReport(SKIN_OUTPUT));
    expect(r.total).toBe(r.productIds.reduce((sum, id) => sum + getProduct(id).price, 0));
    expect(new Set(r.productIds).size).toBe(r.productIds.length);
  });

  it("fits a budget by keeping the most valuable optional steps", () => {
    const full = buildRoutine(normalizeReport(SKIN_OUTPUT));
    const r = buildRoutine(normalizeReport(SKIN_OUTPUT), { budget: 100 });
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.budget).toBe(100);
    expect(r.dropped.length).toBeGreaterThan(0);
    expect([...r.productIds, ...r.dropped].sort()).toEqual([...full.productIds].sort());
  });

  it("flags a budget below the essentials", () => {
    const r = buildRoutine(OILY_ACNE_REPORT, { budget: 20 });
    expect(r.overBudget).toBe(true);
    expect(ids(r.am)).toContain("spf50");
  });

  it("weights up concerns the user focuses on", () => {
    const report = { ...OILY_ACNE_REPORT, concerns: [...OILY_ACNE_REPORT.concerns, { id: "dark_circle_v2", score: 86 }] };
    expect(buildRoutine(report).productIds).not.toContain("eye-cream");
    expect(buildRoutine(report, { focus: ["dark_circle_v2"] }).productIds).toContain("eye-cream");
  });
});

describe("searchProducts", () => {
  it("filters by concern, category, price and makeup", () => {
    expect(searchProducts({ concern: "acne" }).every((p) => p.concerns.includes("acne"))).toBe(true);
    expect(searchProducts({ category: "sunscreen" }).map((p) => p.id)).toEqual(["spf50"]);
    expect(searchProducts({ maxPrice: 20 }).every((p) => p.price <= 20)).toBe(true);
    expect(searchProducts({ makeup: true }).map((p) => p.id).sort()).toEqual(["concealer", "cream-blush", "lip-tint", "skin-tint"]);
  });

  it("hides products that don't suit the skin type", () => {
    expect(searchProducts({ skinType: "Dry" }).map((p) => p.id)).not.toContain("gel-moisturizer");
  });
});

describe("shadeCandidates", () => {
  const tint = getProduct("skin-tint");
  it("offers three neighbouring shades", () => {
    expect(shadeCandidates(tint).map((s) => s.id)).toEqual(["medium", "medium-tan", "tan"]);
    expect(shadeCandidates(tint, 1).map((s) => s.id)).toEqual(["porcelain", "ivory", "light"]);
    expect(shadeCandidates(tint, 10).map((s) => s.id)).toEqual(["deep", "rich", "espresso"]);
  });
});

describe("catalog", () => {
  it("has unique ids, positive prices and valid shade hex colors", () => {
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      expect(p.price).toBeGreaterThan(0);
      for (const s of p.tryOn?.shades ?? []) expect(s.hex).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
