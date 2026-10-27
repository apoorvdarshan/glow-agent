import { describe, expect, it, vi } from "vitest";
import { runAgent, sanitizeCart, systemPrompt, checkShadeNames } from "../src/agent.js";
import { normalizeReport } from "../src/report.js";
import { SKIN_OUTPUT } from "./fixtures.js";

const report = normalizeReport(SKIN_OUTPUT);
const call = (name, args = {}, id = name) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

// A scripted model: returns each message in turn.
function scripted(...messages) {
  const chat = vi.fn(async () => messages.shift() ?? { content: "ok" });
  return chat;
}

const user = (content) => [{ role: "user", content }];

describe("runAgent", () => {
  it("builds a routine and returns a routine card plus the model's reply", async () => {
    const chat = scripted({ tool_calls: [call("build_routine", { budget: 100 })] }, { content: "Here you go." });
    const result = await runAgent({ report, history: user("routine please"), cart: [] }, { chat });
    expect(result.reply).toBe("Here you go.");
    expect(result.ui).toHaveLength(1);
    expect(result.ui[0].type).toBe("routine");
    expect(result.ui[0].routine.total).toBeLessThanOrEqual(100);
    const toolMessage = chat.mock.calls[1][0].at(-1);
    expect(toolMessage.role).toBe("tool");
    expect(JSON.parse(toolMessage.content).left_out_for_budget.length).toBeGreaterThan(0);
  });

  it("starts one try-on per shade and shows them together", async () => {
    const startTryOn = vi.fn(async (product, shade) => `task-${shade.id}`);
    const chat = scripted({ tool_calls: [call("try_on", { product_id: "skin-tint" })] }, { content: "Which looks best?" });
    const result = await runAgent({ report, history: user("match my shade"), cart: [] }, { chat, startTryOn });
    expect(startTryOn).toHaveBeenCalledTimes(3);
    expect(result.ui[0]).toMatchObject({ type: "tryon", renders: [{ taskId: "task-medium" }, { taskId: "task-medium-tan" }, { taskId: "task-tan" }] });
  });

  it("adds to the bag with shades and opens checkout without paying", async () => {
    const chat = scripted(
      { tool_calls: [call("add_to_bag", { items: [{ product_id: "skin-tint", shade_id: "medium" }, { product_id: "spf50", qty: 2 }] })] },
      { tool_calls: [call("start_checkout")] },
      { content: "Approve it in PayPal." },
    );
    const result = await runAgent({ report, history: user("buy"), cart: [] }, { chat });
    expect(result.cart).toEqual([
      { productId: "skin-tint", shadeId: "medium", qty: 1 },
      { productId: "spf50", shadeId: null, qty: 2 },
    ]);
    expect(result.ui.map((e) => e.type)).toEqual(["bag", "checkout"]);
  });

  it("asks for a shade instead of adding a shadeless foundation", async () => {
    const chat = scripted({ tool_calls: [call("add_to_bag", { items: [{ product_id: "skin-tint" }] })] }, { content: "Which shade?" });
    const result = await runAgent({ report, history: user("add tint"), cart: [] }, { chat });
    expect(result.cart).toEqual([]);
    expect(JSON.parse(chat.mock.calls[1][0].at(-1).content).error).toMatch(/needs a shade_id/);
  });

  it("does not repeat an identical tool call and then forces a reply", async () => {
    const startTryOn = vi.fn(async () => "task");
    const chat = scripted(
      { tool_calls: [call("try_on", { product_id: "lip-tint", shade_ids: ["l-berry"] }, "a")] },
      { tool_calls: [call("try_on", { product_id: "lip-tint", shade_ids: ["l-berry"] }, "b")] },
      { content: "Berry it is." },
    );
    const result = await runAgent({ report, history: user("lips"), cart: [] }, { chat, startTryOn });
    expect(startTryOn).toHaveBeenCalledTimes(1);
    expect(result.ui).toHaveLength(1);
    expect(chat.mock.calls[2][2]).toEqual({ toolChoice: "none" });
    expect(result.reply).toBe("Berry it is.");
  });

  it("keeps finished cards when the model fails mid-turn", async () => {
    let n = 0;
    const chat = vi.fn(async () => {
      if (n++ === 0) return { tool_calls: [call("show_products", { product_ids: ["spf50"] })] };
      throw new Error("provider down");
    });
    const result = await runAgent({ report, history: user("spf?"), cart: [] }, { chat });
    expect(result.ui[0].type).toBe("products");
  });

  it("stops after a bounded number of rounds", async () => {
    let i = 0;
    const chat = vi.fn(async () => ({ tool_calls: [call("search_products", { max_price: ++i })] }));
    const result = await runAgent({ report, history: user("loop"), cart: [] }, { chat });
    expect(chat).toHaveBeenCalledTimes(5);
    expect(result.reply).toMatch(/next/);
  });
});

describe("sanitizeCart", () => {
  it("drops unknown products, bad quantities and missing shades", () => {
    expect(sanitizeCart([
      { productId: "spf50", qty: 1 },
      { productId: "ghost", qty: 1 },
      { productId: "spf50", qty: 9 },
      { productId: "skin-tint", qty: 1 },
      { productId: "skin-tint", shadeId: "deep", qty: 2 },
    ])).toEqual([{ productId: "spf50", shadeId: null, qty: 1 }, { productId: "skin-tint", shadeId: "deep", qty: 2 }]);
    expect(sanitizeCart("nope")).toEqual([]);
  });
});

describe("systemPrompt", () => {
  it("includes the report, catalog index and bag", () => {
    const prompt = systemPrompt(report, [{ productId: "spf50", shadeId: null, qty: 1 }]);
    expect(prompt).toContain("Dark circles (dark_circle_v2): 78/100");
    expect(prompt).toContain("skin-tint | Second-Skin Serum Tint | foundation | $32 | porcelain,");
    expect(prompt).toContain('"productId":"spf50"');
  });
});

describe("checkShadeNames", () => {
  const ui = [{ type: "tryon", product: { id: "skin-tint" }, renders: [{ shadeName: "Medium" }, { shadeName: "Medium Tan" }, { shadeName: "Tan" }] }];

  it("replaces a reply that names shades that weren't rendered", () => {
    expect(checkShadeNames("I loaded the porcelain, ivory, and light shades for you.", ui)).toBe(
      "Here are Medium, Medium Tan and Tan on your own photo. Which one looks most natural on you?",
    );
  });

  it("keeps an accurate reply, including ordinary words like light", () => {
    const ok = "Here are Medium, Medium Tan and Tan. The tint gives light coverage.";
    expect(checkShadeNames(ok, ui)).toBe(ok);
  });

  it("leaves replies alone when nothing was rendered", () => {
    expect(checkShadeNames("Porcelain is a lovely shade.", [])).toBe("Porcelain is a lovely shade.");
  });
});
