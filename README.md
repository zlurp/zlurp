# zlurp.ai

Web scraping API for AI agents. Any URL → clean markdown. Pay per scrape via x402 micropayments on Base.

**No accounts. No API keys. No subscriptions.**

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Service status |
| GET | `/probe?url=` | None | Cost estimate (free) |
| POST | `/scrape` | x402 USDC | Scrape URL → markdown |
| GET | `/openapi.json` | None | OpenAPI 3.1 spec |
| GET | `/docs/llms.txt` | None | LLM-friendly description |
| GET | `/.well-known/agent-card.json` | None | A2A agent card |

## Pricing

| Mode | Price |
|------|-------|
| Static (js: false) | $0.005 USDC |
| JS rendering (js: true) | $0.015 USDC |

## Quick start

```typescript
import { wrapFetchWithPayment } from "x402-fetch";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain: base, transport: http() });
const fetch402 = wrapFetchWithPayment(fetch, wallet);

const res = await fetch402("https://zlurp.ai/scrape", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com" }),
});
const { markdown, title, wordCount } = await res.json();
```

## Local dev

```bash
cp .env.example .env   # fill in RECEIVING_ADDRESS, NETWORK, REDIS_URL
npm install
npm run dev
```

## Stack

- Hono + Node.js
- Cheerio + Mozilla Readability + Turndown
- x402-hono payment middleware
- Upstash Redis cache
- Railway deployment

## Contact

hello@zlurp.ai

[![smithery badge](https://smithery.ai/badge/zlurp/zlurp)](https://smithery.ai/servers/zlurp/zlurp)
