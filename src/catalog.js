// The demo shop's catalog. Products are fictional "Glow Agent" house products,
// so no third-party brands appear in the app or the demo video. Prices are USD.
//
// concerns: YouCam skin-analysis concern ids the product helps with.
// skinTypes: YouCam skin types it suits ("any" matches every type).
// when: "am", "pm" or "both"; frequency notes go in `use`.
// tryOn: present on makeup that YouCam's makeup VTO can render; each shade
// carries the exact hex the try-on applies.

export const CONCERNS = {
  acne: "Breakouts",
  pore: "Pores",
  texture: "Texture",
  wrinkle: "Fine lines",
  redness: "Redness",
  oiliness: "Oil balance",
  moisture: "Hydration",
  radiance: "Radiance",
  age_spot: "Dark spots",
  dark_circle_v2: "Dark circles",
  eye_bag: "Under-eye puffiness",
};

export const SKIN_TYPES = ["Normal", "Oily", "Dry", "Combination", "Redness", "Dry & Redness", "Oily & Redness", "Combination & Redness"];

const FOUNDATION_SHADES = [
  { id: "porcelain", name: "Porcelain", hex: "#F1D7C3", depth: 1 },
  { id: "ivory", name: "Ivory", hex: "#EBCDB0", depth: 2 },
  { id: "light", name: "Light", hex: "#E2BD9C", depth: 3 },
  { id: "light-medium", name: "Light Medium", hex: "#D6AA86", depth: 4 },
  { id: "medium", name: "Medium", hex: "#C79872", depth: 5 },
  { id: "medium-tan", name: "Medium Tan", hex: "#B5845D", depth: 6 },
  { id: "tan", name: "Tan", hex: "#A1704A", depth: 7 },
  { id: "deep", name: "Deep", hex: "#86583A", depth: 8 },
  { id: "rich", name: "Rich", hex: "#6B432C", depth: 9 },
  { id: "espresso", name: "Espresso", hex: "#4C2F1F", depth: 10 },
];

export const PRODUCTS = [
  {
    id: "gel-cleanser", name: "Balancing Gel Cleanser", category: "cleanser", price: 16, size: "150 ml",
    ingredients: ["Glycerin", "Panthenol", "Zinc PCA"], concerns: ["oiliness", "pore", "acne"],
    skinTypes: ["Oily", "Combination", "Normal", "Oily & Redness", "Combination & Redness"], when: "both",
    use: "Morning and night on damp skin.", blurb: "A low-foam gel that lifts oil without stripping.", color: "#9DD9C9",
  },
  {
    id: "cream-cleanser", name: "Cushion Cream Cleanser", category: "cleanser", price: 18, size: "150 ml",
    ingredients: ["Ceramide NP", "Oat lipids", "Glycerin"], concerns: ["moisture", "redness"],
    skinTypes: ["Dry", "Normal", "Redness", "Dry & Redness"], when: "both",
    use: "Morning and night; rinse with lukewarm water.", blurb: "Milky cleanser that leaves the barrier intact.", color: "#F3E3CF",
  },
  {
    id: "bha-cleanser", name: "Clear Pore BHA Cleanser", category: "cleanser", price: 19, size: "150 ml",
    ingredients: ["Salicylic acid 2%", "Green tea"], concerns: ["acne", "pore", "oiliness", "texture"],
    skinTypes: ["Oily", "Combination", "Oily & Redness"], when: "pm",
    use: "Evenings, leave on for 60 seconds before rinsing.", blurb: "Oil-soluble exfoliant that clears congested pores.", color: "#B9D7F0",
  },
  {
    id: "niacinamide-serum", name: "10% Niacinamide Serum", category: "serum", price: 24, size: "30 ml",
    ingredients: ["Niacinamide 10%", "Zinc 1%"], concerns: ["pore", "oiliness", "redness", "age_spot", "texture"],
    skinTypes: ["any"], when: "both",
    use: "Morning and night before moisturizer.", blurb: "Refines pores, calms redness and evens tone.", color: "#E7E1F7",
  },
  {
    id: "vitamin-c-serum", name: "15% Vitamin C Glow Serum", category: "serum", price: 34, size: "30 ml",
    ingredients: ["L-ascorbic acid 15%", "Vitamin E", "Ferulic acid"], concerns: ["radiance", "age_spot", "wrinkle"],
    skinTypes: ["any"], when: "am",
    use: "Mornings, under sunscreen.", blurb: "Antioxidant brightener for dull skin and dark spots.", color: "#F7C873",
  },
  {
    id: "hyaluronic-serum", name: "Multi-Weight Hyaluronic Serum", category: "serum", price: 22, size: "30 ml",
    ingredients: ["Hyaluronic acid (5 weights)", "Panthenol"], concerns: ["moisture", "wrinkle"],
    skinTypes: ["any"], when: "both",
    use: "On damp skin, morning and night.", blurb: "Layers of hydration that plump fine dehydration lines.", color: "#CFE8F7",
  },
  {
    id: "retinal-serum", name: "0.05% Retinal Night Serum", category: "treatment", price: 42, size: "30 ml",
    ingredients: ["Retinaldehyde 0.05%", "Squalane"], concerns: ["wrinkle", "texture", "age_spot", "acne"],
    skinTypes: ["Normal", "Oily", "Combination", "Dry"], when: "pm", strongActive: true,
    use: "Nights, 3 times a week to start. Always wear SPF the next day.", blurb: "Fast-acting retinoid for lines, texture and spots.", color: "#F2B8A0",
  },
  {
    id: "azelaic-gel", name: "10% Azelaic Calming Gel", category: "treatment", price: 28, size: "30 ml",
    ingredients: ["Azelaic acid 10%", "Allantoin"], concerns: ["redness", "acne", "age_spot"],
    skinTypes: ["any"], when: "pm",
    use: "Nights on clean skin.", blurb: "Gentle treatment for redness, breakouts and marks.", color: "#F6D1D6",
  },
  {
    id: "aha-toner", name: "7% Glycolic Resurfacing Toner", category: "toner", price: 26, size: "200 ml",
    ingredients: ["Glycolic acid 7%", "Aloe"], concerns: ["texture", "radiance", "age_spot"],
    skinTypes: ["Normal", "Oily", "Combination"], when: "pm", strongActive: true,
    use: "Nights, 2 to 3 times a week, on nights without retinal.", blurb: "Smooths rough texture and revives glow.", color: "#FBE7A1",
  },
  {
    id: "cica-toner", name: "Cica Soothing Toner", category: "toner", price: 20, size: "200 ml",
    ingredients: ["Centella asiatica", "Madecassoside", "Panthenol"], concerns: ["redness", "moisture"],
    skinTypes: ["any"], when: "both",
    use: "Pat in after cleansing.", blurb: "Calms visible redness and preps skin.", color: "#C8E6C2",
  },
  {
    id: "gel-moisturizer", name: "Oil-Free Water Gel", category: "moisturizer", price: 25, size: "50 ml",
    ingredients: ["Squalane", "Niacinamide", "Glycerin"], concerns: ["oiliness", "moisture"],
    skinTypes: ["Oily", "Combination", "Normal", "Oily & Redness", "Combination & Redness"], when: "both",
    use: "Morning and night.", blurb: "Weightless hydration with a matte finish.", color: "#D4EEF2",
  },
  {
    id: "barrier-cream", name: "Ceramide Barrier Cream", category: "moisturizer", price: 29, size: "50 ml",
    ingredients: ["Ceramides 1, 3, 6-II", "Cholesterol", "Fatty acids"], concerns: ["moisture", "redness", "wrinkle"],
    skinTypes: ["Dry", "Normal", "Redness", "Dry & Redness", "Combination & Redness"], when: "both",
    use: "Morning and night as the last step before SPF.", blurb: "Rebuilds a dry, reactive skin barrier.", color: "#F5EDE3",
  },
  {
    id: "spf50", name: "Invisible Fluid SPF 50", category: "sunscreen", price: 27, size: "50 ml",
    ingredients: ["Broad-spectrum filters", "Vitamin E"], concerns: ["age_spot", "wrinkle", "redness", "radiance"],
    skinTypes: ["any"], when: "am",
    use: "Every morning as the last step; reapply every 2 hours outdoors.", blurb: "Weightless, no white cast. The best anti-aging step there is.", color: "#FFF1C9",
  },
  {
    id: "eye-cream", name: "Caffeine Depuff Eye Cream", category: "eye", price: 31, size: "15 ml",
    ingredients: ["Caffeine 5%", "Peptides", "Vitamin K"], concerns: ["eye_bag", "dark_circle_v2"],
    skinTypes: ["any"], when: "both",
    use: "Tap a rice-grain amount around the orbital bone.", blurb: "Cooling cream for puffiness and shadows.", color: "#E2D6F2",
  },
  {
    id: "spot-patches", name: "Overnight Spot Patches", category: "treatment", price: 12, size: "36 patches",
    ingredients: ["Hydrocolloid", "Tea tree"], concerns: ["acne"],
    skinTypes: ["any"], when: "pm",
    use: "Apply on a clean, dry blemish overnight.", blurb: "Flattens active breakouts while you sleep.", color: "#EBDCCB",
  },
  {
    id: "clay-mask", name: "Pore Detox Clay Mask", category: "mask", price: 22, size: "75 ml",
    ingredients: ["Kaolin", "Bentonite", "Niacinamide"], concerns: ["pore", "oiliness"],
    skinTypes: ["Oily", "Combination", "Oily & Redness"], when: "pm",
    use: "Once a week for 10 minutes.", blurb: "Weekly reset for shiny, congested zones.", color: "#D9CBB8",
  },
  {
    id: "skin-tint", name: "Second-Skin Serum Tint", category: "foundation", price: 32, size: "30 ml",
    ingredients: ["Niacinamide", "Hyaluronic acid"], concerns: ["redness", "age_spot", "radiance"],
    skinTypes: ["any"], when: "am",
    use: "After SPF; build with fingertips.", blurb: "Light coverage that evens tone and lets skin show through.", color: "#D6AA86",
    tryOn: { category: "foundation", shades: FOUNDATION_SHADES },
  },
  {
    id: "concealer", name: "Brightening Under-Eye Concealer", category: "concealer", price: 24, size: "6 ml",
    ingredients: ["Caffeine", "Light-reflecting pigments"], concerns: ["dark_circle_v2", "eye_bag"],
    skinTypes: ["any"], when: "am",
    use: "Dot under the eyes and blend outward.", blurb: "Peach-corrected brightener for tired eyes.", color: "#E9C3A6",
    tryOn: {
      category: "concealer",
      shades: [
        { id: "c-fair", name: "Fair Peach", hex: "#F0CDB4", depth: 2 },
        { id: "c-light", name: "Light Peach", hex: "#E4B896", depth: 4 },
        { id: "c-medium", name: "Medium Apricot", hex: "#C9966E", depth: 6 },
        { id: "c-deep", name: "Deep Bisque", hex: "#94613F", depth: 8 },
        { id: "c-rich", name: "Rich Amber", hex: "#6A402A", depth: 10 },
      ],
    },
  },
  {
    id: "lip-tint", name: "Hydra Lip Tint", category: "lip", price: 18, size: "4 ml",
    ingredients: ["Squalane", "Hyaluronic acid"], concerns: ["moisture"],
    skinTypes: ["any"], when: "am",
    use: "Dab on and blend with a fingertip.", blurb: "Sheer, glossy color that hydrates.", color: "#C9506B",
    tryOn: {
      category: "lip_color",
      shades: [
        { id: "l-petal", name: "Petal", hex: "#D98A8F", texture: "gloss" },
        { id: "l-rosewood", name: "Rosewood", hex: "#A8505A", texture: "satin" },
        { id: "l-berry", name: "Berry", hex: "#8E2846", texture: "gloss" },
        { id: "l-coral", name: "Coral", hex: "#E3664F", texture: "gloss" },
        { id: "l-brick", name: "Brick", hex: "#9C3B2B", texture: "matte" },
        { id: "l-cherry", name: "Cherry", hex: "#B3112E", texture: "satin" },
      ],
    },
  },
  {
    id: "cream-blush", name: "Cheek Flush Cream Blush", category: "blush", price: 20, size: "6 g",
    ingredients: ["Jojoba oil", "Vitamin E"], concerns: ["radiance"],
    skinTypes: ["any"], when: "am",
    use: "Tap onto the apples of the cheeks.", blurb: "Dewy flush that wakes up the face.", color: "#E99A8C",
    tryOn: {
      category: "blush",
      shades: [
        { id: "b-peony", name: "Peony", hex: "#E98A9A" },
        { id: "b-apricot", name: "Apricot", hex: "#EE9A72" },
        { id: "b-mauve", name: "Mauve", hex: "#B9707E" },
        { id: "b-terracotta", name: "Terracotta", hex: "#B85A3E" },
      ],
    },
  },
];

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id) {
  return byId.get(id) ?? null;
}

export function getShade(product, shadeId) {
  return product?.tryOn?.shades.find((s) => s.id === shadeId) ?? null;
}

export function suitsSkinType(product, skinType) {
  return !skinType || product.skinTypes.includes("any") || product.skinTypes.includes(skinType);
}

// Compact view sent to the AI model and the browser.
export function summarize(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    size: product.size,
    ingredients: product.ingredients,
    helps_with: product.concerns.map((c) => CONCERNS[c]),
    concern_ids: product.concerns,
    skin_types: product.skinTypes,
    when: product.when,
    use: product.use,
    blurb: product.blurb,
    color: product.color,
    shades: product.tryOn?.shades.map((s) => ({ id: s.id, name: s.name, hex: s.hex })) ?? null,
  };
}
