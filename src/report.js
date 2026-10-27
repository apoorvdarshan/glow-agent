import { CONCERNS, SKIN_TYPES } from "./catalog.js";

// SD skin-analysis concerns we request: 12 concerns cost 14 units per photo.
export const ANALYSIS_ACTIONS = [
  "acne", "pore", "texture", "wrinkle", "redness", "oiliness",
  "moisture", "radiance", "age_spot", "dark_circle_v2", "eye_bag", "skin_type",
];

// YouCam's ui_score runs 1..100 where higher means healthier skin. It is
// calibrated generously, so anything under 85 is worth working on.
export function severityOf(score) {
  if (score < 70) return "high";
  if (score < 85) return "medium";
  return "low";
}

// Turns YouCam's `results.output` list into the report the app and the agent use.
export function normalizeReport(output) {
  const concerns = [];
  const skinType = {};
  let overall = null;
  let skinAge = null;
  let imageUrl = null;

  for (const item of output ?? []) {
    if (item.type === "all") overall = Math.round(item.score);
    else if (item.type === "skin_age") skinAge = Math.round(item.score);
    else if (item.type === "resize_image") imageUrl = item.mask_urls?.[0] ?? item.url ?? null;
    else if (item.type === "skin_type") skinType[item.region ?? "whole"] = item.skin_type;
    else if (CONCERNS[item.type] && typeof item.ui_score === "number") {
      concerns.push({
        id: item.type,
        label: CONCERNS[item.type],
        score: item.ui_score,
        severity: severityOf(item.ui_score),
        maskUrl: item.mask_urls?.[0] ?? null,
      });
    }
  }

  concerns.sort((a, b) => a.score - b.score);
  return {
    overall,
    skinAge,
    skinType: { whole: skinType.whole ?? null, tZone: skinType.t_zone ?? null, uZone: skinType.u_zone ?? null },
    concerns,
    imageUrl,
  };
}

// Rebuilds a report sent back by the browser, keeping only known fields, so
// nothing else from the request reaches the AI model's prompt.
export function sanitizeReport(input) {
  const skinType = (v) => (SKIN_TYPES.includes(v) ? v : null);
  const num = (v) => (typeof v === "number" && v >= 0 && v <= 150 ? Math.round(v) : null);
  const concerns = (Array.isArray(input?.concerns) ? input.concerns : [])
    .filter((c) => CONCERNS[c?.id] && typeof c.score === "number" && c.score >= 0 && c.score <= 100)
    .map((c) => ({ id: c.id, label: CONCERNS[c.id], score: Math.round(c.score), severity: severityOf(c.score), maskUrl: null }));
  if (concerns.length === 0) return null;
  return {
    overall: num(input.overall),
    skinAge: num(input.skinAge),
    skinType: { whole: skinType(input.skinType?.whole), tZone: skinType(input.skinType?.tZone), uZone: skinType(input.skinType?.uZone) },
    concerns: concerns.sort((a, b) => a.score - b.score),
    imageUrl: null,
  };
}

// The plain-language version given to the AI model.
export function describeReport(report) {
  const focus = report.concerns.filter((c) => c.severity !== "low");
  return {
    overall_score: report.overall,
    skin_age: report.skinAge,
    skin_type: report.skinType.whole,
    t_zone: report.skinType.tZone,
    u_zone: report.skinType.uZone,
    needs_attention: focus.map((c) => `${c.label} (${c.id}): ${c.score}/100, ${c.severity}`),
    doing_well: report.concerns.filter((c) => c.severity === "low").map((c) => `${c.label}: ${c.score}/100`),
  };
}
