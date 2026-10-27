// A YouCam skin-analysis `results.output` list shaped like a real response.
export const SKIN_OUTPUT = [
  { type: "eye_bag", ui_score: 81, raw_score: 80.6, mask_urls: ["https://s3.example/eye_bag.png"] },
  { type: "texture", ui_score: 98, raw_score: 99.4, mask_urls: ["https://s3.example/texture.png"] },
  { type: "oiliness", ui_score: 98, raw_score: 99.5, mask_urls: ["https://s3.example/oiliness.png"] },
  { type: "pore", ui_score: 97, raw_score: 98.7, mask_urls: ["https://s3.example/pore.png"] },
  { type: "redness", ui_score: 94, raw_score: 96.2, mask_urls: ["https://s3.example/redness.png"] },
  { type: "dark_circle_v2", ui_score: 78, raw_score: 83.5, mask_urls: ["https://s3.example/dark_circle.png"] },
  { type: "radiance", ui_score: 94, raw_score: 96.2, mask_urls: ["https://s3.example/radiance.png"] },
  { type: "age_spot", ui_score: 97, raw_score: 98.7, mask_urls: ["https://s3.example/age_spot.png"] },
  { type: "acne", ui_score: 96, raw_score: 97.9, mask_urls: ["https://s3.example/acne.png"] },
  { type: "wrinkle", ui_score: 96, raw_score: 98.2, mask_urls: ["https://s3.example/wrinkle.png"] },
  { type: "moisture", ui_score: 82, raw_score: 80.7, mask_urls: ["https://s3.example/moisture.png"] },
  { type: "skin_type", region: "whole", skin_type: "Normal", mask_urls: ["https://s3.example/st.png"] },
  { type: "skin_type", region: "t_zone", skin_type: "Oily", mask_urls: ["https://s3.example/st_t.png"] },
  { type: "skin_type", region: "u_zone", skin_type: "Normal", mask_urls: ["https://s3.example/st_u.png"] },
  { type: "all", score: 91.9 },
  { type: "skin_age", score: 28 },
  { type: "resize_image", mask_urls: ["https://s3.example/resized.jpg"] },
];

// An oily, breakout-prone report for routine tests.
export const OILY_ACNE_REPORT = {
  overall: 70,
  skinAge: 30,
  skinType: { whole: "Oily", tZone: "Oily", uZone: "Combination" },
  concerns: [
    { id: "acne", label: "Breakouts", score: 58, severity: "high" },
    { id: "pore", label: "Pores", score: 64, severity: "high" },
    { id: "oiliness", label: "Oil balance", score: 66, severity: "high" },
    { id: "texture", label: "Texture", score: 80, severity: "medium" },
    { id: "moisture", label: "Hydration", score: 92, severity: "low" },
    { id: "wrinkle", label: "Fine lines", score: 95, severity: "low" },
  ],
};
