# Glow Agent

**Your skin, read in seconds. Your routine, bought in one chat.**

Glow Agent is an AI skin-care shopping agent. You take a selfie. YouCam AI Skin Analysis scores 11 skin concerns and highlights where it found each one on your face. Glow, the shopping agent, builds a morning and night routine around your actual scores. It lets you compare foundation, concealer, lip and blush shades rendered on your own photo with YouCam makeup virtual try-on, and checks out with PayPal.

Live demo: https://glow.apoorvdarshan.com

## The problem

People wonder about their skin at the moment of purchase: in front of a shelf of serums or a page of 40 foundation shades. Generic quizzes ask you to self-diagnose ("Is your skin oily?"), and shade finders ask you to guess your undertone. Most people guess wrong, buy the wrong thing, and return it or give up.

Glow Agent replaces the guessing with measurement and a try-on, then carries you to checkout in the same conversation.

## What it does

1. **Skin analysis (YouCam AI Skin Analysis).** One selfie returns scores for breakouts, pores, texture, fine lines, redness, oil balance, hydration, radiance, dark spots, dark circles and under-eye puffiness. It also returns skin type by zone (whole face, T-zone, U-zone), an overall score and a skin age. Tap any concern to light up the exact areas YouCam detected, using YouCam's detection masks.
2. **A routine built from your scores.** A deterministic recommender ranks the shop's products by how much each one helps the concerns that need work, filtered by skin type. It never pairs two strong night actives, keeps vitamin C in the morning, and always includes SPF. With a budget, it keeps the combination of optional steps worth the most that still fits.
3. **Shade matching on your own face (YouCam makeup VTO).** Glow renders three neighbouring shades of the serum tint, concealer, lip tint or blush on your photo, side by side. You pick the one that disappears into your skin.
4. **An agent that can act.** Glow is an AI model with tools: `build_routine`, `search_products`, `show_products`, `try_on`, `add_to_bag` and `start_checkout`. It answers from your report, cites your scores, and shows results as cards rather than walls of text.
5. **PayPal checkout.** The agent can fill the bag and open checkout, but it can't pay. You approve the payment yourself in PayPal (JS SDK v6). The server creates and captures the order with PayPal Orders v2, pricing every line from its own catalog, never from the browser.

Without an AI key, the app still works end to end. The routine builder and shade matching run from buttons instead of chat. The live demo's agent runs on Gemini's free tier (`gemini-3.5-flash-lite`) through Gemini's OpenAI-compatible endpoint.

## How it uses YouCam

| Feature | API | Units |
|---|---|---|
| Skin report and detection masks | `POST /s2s/v2.0/task/skin-analysis` (SD, 12 actions incl. `skin_type`) | 14 per photo |
| Shade try-on | `POST /s2s/v2.0/task/makeup-vto` with `foundation`, `concealer`, `lip_color` or `blush` effects using each product's exact hex | 1 per render |
| Photo upload | `POST /s2s/v2.0/file`, then a PUT to the pre-signed URL | free |

Tasks are polled until `success`, and units are only charged on success. YouCam's result URLs expire after two hours. The worker therefore re-polls the task, which is free, to serve masks same-origin, so the page can use them as CSS `mask-image`s and tint them over any skin tone.

## How it uses PayPal

- **Orders v2:** `POST /v2/checkout/orders` (intent `CAPTURE`, itemized `purchase_units` with a matching `item_total`), then `POST /v2/checkout/orders/{id}/capture`.
- **JavaScript SDK v6:** `createInstance`, `findEligibleMethods`, `createPayPalOneTimePaymentSession` and the `<paypal-button>` element.
- **Sandbox only:** no real money moves. Test with a sandbox personal account from developer.paypal.com.

## Architecture

```
public/            static app (vanilla JS, no build step)
  app.js           camera/upload, report view, agent chat, bag, PayPal v6
  product-art.js   SVG packaging drawn from each product's color
src/               Cloudflare Worker (serves /api/*)
  worker.js        routes, sample-face cache, same-origin image proxy
  youcam.js        YouCam file upload, skin analysis, makeup VTO, error messages
  report.js        normalizes YouCam output, sanitizes reports sent back by the browser
  recommend.js     routine builder, budget fitting, product search, shade candidates
  agent.js         tool-calling agent loop (any OpenAI-compatible chat API)
  paypal.js        cart pricing, Orders v2 create/capture
  limits.js        daily per-IP and global quotas in KV
  catalog.js       the demo shop's fictional house products
tests/             vitest unit tests
```

**Safety and cost controls:**
- Daily per-IP and global quotas protect YouCam units and AI spend.
- The sample face's analysis and try-ons are cached in KV, so demos spend nothing.
- Reports and bags from the browser are rebuilt from known fields before they reach the model or PayPal.
- Repeated identical tool calls within a turn are not re-run.
- The agent runs on Gemini's free tier, so it can't run up a bill. If the free quota runs out, the suggestion buttons fall back to the built-in routine builder and shade try-on.
- Glow declines requests unrelated to skin care or the shop.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in your keys
npm run dev                      # http://localhost:8787
npm test
```

`.dev.vars` needs:
- `YOUCAM_API_KEY`
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (sandbox app)
- optionally `AI_API_KEY`, `AI_BASE_URL` and `AI_MODEL`, for any OpenAI-compatible endpoint with tool calling

YouCam accounts in India use the `makeupar.com` host (the default `YOUCAM_BASE`). Set `YOUCAM_BASE=https://yce-api-01.perfectcorp.com` for other regions.

## Deploy

```bash
npx wrangler kv namespace create GLOW_KV     # put the id in wrangler.jsonc
npx wrangler secret put YOUCAM_API_KEY
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put AI_API_KEY           # optional, with AI_BASE_URL and AI_MODEL
npm run deploy
```

Quotas can be tuned with `LIMIT_<KIND>_PER_IP` and `LIMIT_<KIND>_DAILY` vars, where the kinds are `UPLOAD`, `ANALYZE`, `TRYON` and `AGENT`.

## Notes

- Products are fictional "Glow Agent" house products created for this demo, so no real brands appear.
- The sample face is YouCam's own sample image from the YouCam API documentation.
- Cosmetic guidance, not medical advice. Glow suggests a dermatologist for anything that sounds medical.
- Photos go to YouCam (Perfect Corp) for analysis. Glow Agent doesn't store them.

## License

[MIT](LICENSE)
