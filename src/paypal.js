// PayPal Orders v2 against the sandbox. Prices always come from the server's
// catalog; the browser only says which products and how many.

import { getProduct, getShade } from "./catalog.js";

export class PayPalError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const MAX_QTY = 5;

// Validates a cart from the browser and prices it from the catalog.
export function priceCart(items) {
  if (!Array.isArray(items) || items.length === 0) throw new PayPalError("Your bag is empty.", 400);
  if (items.length > 20) throw new PayPalError("Too many items in the bag.", 400);
  const lines = items.map((item) => {
    const product = getProduct(item?.productId);
    if (!product) throw new PayPalError(`Unknown product ${item?.productId}`, 400);
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new PayPalError(`Quantity for ${product.name} must be 1 to ${MAX_QTY}.`, 400);
    let shade = null;
    if (product.tryOn) {
      shade = getShade(product, item.shadeId);
      if (!shade) throw new PayPalError(`Pick a shade for ${product.name}.`, 400);
    }
    return { product, shade, qty };
  });
  const total = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  return { lines, total };
}

const money = (n) => ({ currency_code: "USD", value: n.toFixed(2) });

export function orderBody({ lines, total }) {
  return {
    intent: "CAPTURE",
    purchase_units: [{
      description: "Glow Agent routine",
      amount: { ...money(total), breakdown: { item_total: money(total) } },
      items: lines.map(({ product, shade, qty }) => ({
        name: shade ? `${product.name} - ${shade.name}` : product.name,
        sku: shade ? `${product.id}:${shade.id}` : product.id,
        quantity: String(qty),
        unit_amount: money(product.price),
        category: "PHYSICAL_GOODS",
      })),
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Glow Agent",
          shipping_preference: "GET_FROM_FILE",
          user_action: "PAY_NOW",
        },
      },
    },
  };
}

export function createPayPal(env, fetcher = fetch) {
  const base = env.PAYPAL_BASE ?? "https://api-m.sandbox.paypal.com";
  let token = null;
  let tokenExpires = 0;

  async function accessToken() {
    if (token && Date.now() < tokenExpires) return token;
    const res = await fetcher(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new PayPalError("PayPal sign-in failed", 502);
    token = json.access_token;
    tokenExpires = Date.now() + (json.expires_in - 60) * 1000;
    return token;
  }

  async function call(method, path, body) {
    const res = await fetcher(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new PayPalError(json.details?.[0]?.description ?? json.message ?? "PayPal request failed", res.status, json.details);
    return json;
  }

  return {
    async createOrder(items) {
      const priced = priceCart(items);
      const order = await call("POST", "/v2/checkout/orders", orderBody(priced));
      return { orderId: order.id, total: priced.total };
    },

    async captureOrder(orderId) {
      if (!/^[A-Z0-9]{10,30}$/.test(orderId ?? "")) throw new PayPalError("Invalid order id", 400);
      const order = await call("POST", `/v2/checkout/orders/${orderId}/capture`);
      const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
      return {
        orderId: order.id,
        status: order.status,
        captureId: capture?.id ?? null,
        amount: capture?.amount?.value ?? null,
        payerName: order.payer?.name?.given_name ?? null,
        shipTo: order.purchase_units?.[0]?.shipping?.address?.admin_area_2 ?? null,
      };
    },
  };
}
