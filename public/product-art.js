// Draws a simple packaging illustration for each product, tinted with its color.

const SHAPES = {
  // Squeeze tube, cap down.
  tube: (c) => `
    <path d="M38 8h44l-6 74H44Z" fill="${c}"/>
    <rect x="44" y="82" width="32" height="20" rx="3" fill="#2A211C"/>
    <rect x="46" y="22" width="28" height="30" rx="2" fill="#fff" opacity=".55"/>`,
  // Dropper bottle.
  dropper: (c) => `
    <rect x="50" y="6" width="20" height="16" rx="8" fill="#2A211C"/>
    <rect x="52" y="22" width="16" height="10" fill="#3B302A"/>
    <rect x="36" y="32" width="48" height="70" rx="10" fill="${c}"/>
    <rect x="44" y="50" width="32" height="30" rx="3" fill="#fff" opacity=".55"/>`,
  // Pump bottle.
  pump: (c) => `
    <path d="M56 4h22v6H64v8h-8Z" fill="#2A211C"/>
    <rect x="54" y="18" width="12" height="10" fill="#3B302A"/>
    <rect x="34" y="28" width="52" height="76" rx="12" fill="${c}"/>
    <rect x="42" y="48" width="36" height="34" rx="3" fill="#fff" opacity=".55"/>`,
  // Wide jar.
  jar: (c) => `
    <rect x="26" y="40" width="68" height="14" rx="4" fill="#2A211C"/>
    <rect x="28" y="54" width="64" height="46" rx="10" fill="${c}"/>
    <rect x="40" y="64" width="40" height="22" rx="3" fill="#fff" opacity=".55"/>`,
  // Tall toner bottle.
  bottle: (c) => `
    <rect x="50" y="4" width="20" height="16" rx="3" fill="#2A211C"/>
    <rect x="40" y="20" width="40" height="84" rx="8" fill="${c}"/>
    <rect x="46" y="44" width="28" height="36" rx="2" fill="#fff" opacity=".55"/>`,
  // Slim eye cream tube with applicator.
  slim: (c) => `
    <rect x="50" y="6" width="20" height="12" rx="6" fill="#C9C1BA"/>
    <path d="M46 18h28l-3 70H49Z" fill="${c}"/>
    <rect x="50" y="88" width="20" height="14" rx="3" fill="#2A211C"/>`,
  // Lip tint wand.
  wand: (c) => `
    <rect x="50" y="4" width="20" height="46" rx="6" fill="#2A211C"/>
    <rect x="47" y="50" width="26" height="54" rx="8" fill="${c}"/>
    <rect x="52" y="58" width="16" height="38" rx="5" fill="#fff" opacity=".25"/>`,
  // Round compact.
  compact: (c) => `
    <ellipse cx="60" cy="74" rx="38" ry="14" fill="#2A211C"/>
    <rect x="22" y="56" width="76" height="18" fill="#2A211C"/>
    <ellipse cx="60" cy="56" rx="38" ry="14" fill="#3B302A"/>
    <ellipse cx="60" cy="56" rx="28" ry="9" fill="${c}"/>`,
  // Patch tin.
  tin: (c) => `
    <rect x="24" y="50" width="72" height="44" rx="12" fill="${c}"/>
    <circle cx="44" cy="72" r="8" fill="#fff" opacity=".6"/>
    <circle cx="62" cy="72" r="6" fill="#fff" opacity=".6"/>
    <circle cx="77" cy="72" r="4" fill="#fff" opacity=".6"/>`,
};

const CATEGORY_SHAPE = {
  cleanser: "tube", toner: "bottle", serum: "dropper", treatment: "dropper", moisturizer: "jar",
  sunscreen: "tube", eye: "slim", mask: "jar", foundation: "pump", concealer: "slim", lip: "wand", blush: "compact",
};

export function productArt(product, color = product.color) {
  const shape = product.id === "spot-patches" ? "tin" : CATEGORY_SHAPE[product.category] ?? "bottle";
  return `<svg viewBox="0 0 120 108" role="img" aria-label="${product.name}">${SHAPES[shape](color)}</svg>`;
}
