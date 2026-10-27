import { describe, expect, it, vi } from "vitest";
import { priceCart, orderBody, createPayPal } from "../src/paypal.js";

describe("priceCart", () => {
  it("prices lines from the catalog, ignoring any client price", () => {
    const { total, lines } = priceCart([
      { productId: "spf50", qty: 2, price: 0.01 },
      { productId: "skin-tint", shadeId: "medium", qty: 1 },
    ]);
    expect(total).toBe(27 * 2 + 32);
    expect(lines[1].shade.name).toBe("Medium");
  });

  it("rejects empty bags, unknown products, bad quantities and missing shades", () => {
    expect(() => priceCart([])).toThrow(/empty/);
    expect(() => priceCart([{ productId: "nope", qty: 1 }])).toThrow(/Unknown/);
    expect(() => priceCart([{ productId: "spf50", qty: 0 }])).toThrow(/Quantity/);
    expect(() => priceCart([{ productId: "spf50", qty: 1.5 }])).toThrow(/Quantity/);
    expect(() => priceCart([{ productId: "spf50", qty: 6 }])).toThrow(/Quantity/);
    expect(() => priceCart([{ productId: "skin-tint", qty: 1 }])).toThrow(/shade/);
  });
});

describe("orderBody", () => {
  it("builds a CAPTURE order whose item total matches the amount", () => {
    const body = orderBody(priceCart([{ productId: "skin-tint", shadeId: "tan", qty: 2 }, { productId: "eye-cream", qty: 1 }]));
    const unit = body.purchase_units[0];
    expect(body.intent).toBe("CAPTURE");
    expect(unit.amount).toEqual({ currency_code: "USD", value: "95.00", breakdown: { item_total: { currency_code: "USD", value: "95.00" } } });
    expect(unit.items[0]).toMatchObject({ name: "Second-Skin Serum Tint - Tan", sku: "skin-tint:tan", quantity: "2", unit_amount: { value: "32.00" } });
  });
});

describe("createPayPal", () => {
  const env = { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_BASE: "https://pp.test" };
  const reply = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("authenticates once and creates an order", async () => {
    const fetcher = vi.fn((url) => (url.endsWith("/oauth2/token")
      ? reply({ access_token: "tok", expires_in: 3600 })
      : reply({ id: "ORDER1234567" })));
    const paypal = createPayPal(env, fetcher);
    await paypal.createOrder([{ productId: "spf50", qty: 1 }]);
    const result = await paypal.createOrder([{ productId: "spf50", qty: 1 }]);
    expect(result).toEqual({ orderId: "ORDER1234567", total: 27 });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/oauth2/token"))).toHaveLength(1);
    const [, init] = fetcher.mock.calls.find(([url]) => url.endsWith("/v2/checkout/orders"));
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("refuses malformed order ids before calling PayPal", async () => {
    const fetcher = vi.fn();
    await expect(createPayPal(env, fetcher).captureOrder("../../v1/x")).rejects.toThrow(/Invalid order id/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("summarizes a capture", async () => {
    const fetcher = vi.fn((url) => (url.endsWith("/oauth2/token")
      ? reply({ access_token: "tok", expires_in: 3600 })
      : reply({
          id: "ORDER1234567", status: "COMPLETED", payer: { name: { given_name: "Ana" } },
          purchase_units: [{ payments: { captures: [{ id: "CAP1", amount: { value: "27.00" } }] }, shipping: { address: { admin_area_2: "San Jose" } } }],
        })));
    expect(await createPayPal(env, fetcher).captureOrder("ORDER1234567")).toEqual({
      orderId: "ORDER1234567", status: "COMPLETED", captureId: "CAP1", amount: "27.00", payerName: "Ana", shipTo: "San Jose",
    });
  });
});
