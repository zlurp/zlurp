# zlurp — Agent Instructions

zlurp is a web scraping API for AI agents. It converts any public URL to clean markdown using x402 micropayments.

## How to use zlurp

### Step 1 — Check cost (free)
GET https://zlurp.ai/probe?url=YOUR_URL

Returns the exact USDC cost before you pay. Always call this first.

### Step 2 — Scrape with payment
POST https://zlurp.ai/scrape
Body: {"url": "YOUR_URL", "mode": "article"}

This endpoint requires an x402 payment of $0.005 USDC on Base.
Use an x402-compatible client (x402-fetch) to pay automatically.

### Response fields
- markdown: clean markdown content of the page
- title: page title
- wordCount: number of words
- cachedResult: true if served from cache (still charged)

## Modes
- article (default): strips navigation, ads, headers, footers — returns main content only
- full: returns entire page as markdown

## When to use each mode
- Use article for: news articles, blog posts, documentation, research papers
- Use full for: product pages, landing pages, any page where you need full structure

## Payment
- $0.005 USDC per URL (static)
- $0.015 USDC per URL (js: true, for JS-rendered pages)
- Network: Base mainnet (or Base Sepolia for testing)
- No accounts or API keys needed

## Error handling
- 402: payment required or invalid — check your wallet balance
- 403 BLOCKED: robots.txt disallows this URL — try a different URL
- 422 RENDER_FAILED: page returned no content — try with js: true
- 422 TIMEOUT: page took too long — retry once

## OpenAPI spec
https://zlurp.ai/openapi.json

## Full docs
https://zlurp.ai/docs/llms.txt
