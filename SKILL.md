---
name: zlurp
description: Scrape any public URL to clean markdown using zlurp.ai. Costs $0.005 USDC per scrape via x402 micropayments on Base. No accounts or API keys needed — just a funded Base wallet.
---

# zlurp — Web Scraping for AI Agents

zlurp converts any public URL to clean markdown via x402 micropayments. Use this skill when you need to read a webpage, extract article content, or scrape a URL as part of an agent workflow.

## When to use this skill

- Reading a specific webpage or article
- Extracting content from a URL for RAG or research
- Scraping web pages in an autonomous agent workflow
- Checking cost before committing to a scrape

## Quick Start

### 1. Check cost (free)
```bash
curl "https://zlurp.ai/probe?url=https://example.com"
# Returns: { "costUSDC": "0.005000" }
```

### 2. Scrape with x402 payment
```javascript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const client = new x402Client().register("eip155:*", new ExactEvmScheme(signer));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const res = await fetchWithPayment("https://zlurp.ai/scrape", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com", mode: "article" }),
});
const { markdown, title, wordCount } = await res.json();
```

## API Reference

### GET /probe?url=
Check cost before scraping. Always free.
- Returns: `{ url, costUSDC, mode, js, network }`

### POST /scrape
Scrape a URL to clean markdown. Costs $0.005 USDC via x402.
- Body: `{ url: string, mode?: "article"|"full", js?: boolean }`
- Returns: `{ markdown, title, wordCount, cachedResult }`

## Pricing
- Static scraping: $0.005 USDC per URL
- JS rendering: $0.015 USDC per URL
- Payment: USDC on Base mainnet via x402 protocol
- No accounts, no API keys, no subscriptions

## Requirements
- A funded Base wallet with USDC
- `@x402/fetch` and `@x402/evm` npm packages
- Node.js 18+

## Links
- Homepage: https://zlurp.ai
- OpenAPI spec: https://zlurp.ai/openapi.json
- MCP server: https://zlurp.ai/mcp
- Smithery: https://smithery.ai/servers/zlurp/zlurp
- Docs: https://zlurp.ai/docs/llms.txt
