import { readFileSync } from "fs"
import { facilitator as cdpFacilitator } from '@coinbase/x402'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { JSDOM } from 'jsdom'
import { paymentMiddleware } from '@x402/hono'
// @ts-ignore
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server'
// @ts-ignore
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { bazaarResourceServerExtension, declareDiscoveryExtension, withBazaar } from '@x402/extensions/bazaar'
import { isAllowed } from './robots.js'
import { getCache, setCache } from './cache.js'

const app = new Hono()

const PRICE_STATIC = 0.005
const PRICE_JS = 0.015
const RECEIVING_ADDRESS = process.env.RECEIVING_ADDRESS as `0x${string}`
const NETWORK = (process.env.NETWORK || 'base-sepolia') as 'base' | 'base-sepolia'
const CHAIN_ID = NETWORK === 'base' ? '8453' : '84532'

// @ts-ignore
const facilitatorClient = new HTTPFacilitatorClient(cdpFacilitator)

// @ts-ignore
const bazaarClient = withBazaar(facilitatorClient)
// @ts-ignore
const resourceServer = new x402ResourceServer(bazaarClient)
  .register(`eip155:${CHAIN_ID}`, new ExactEvmScheme())



// Bazaar discovery extension for /scrape
const scrapeDiscovery = (declareDiscoveryExtension as any)({
  bodyType: 'json',
  method: 'POST',
  input: { url: 'https://example.com', mode: 'article', js: false },
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The public URL to scrape' },
      mode: { type: 'string', enum: ['article', 'full'], default: 'article' },
      js: { type: 'boolean', default: false },
    },
    required: ['url'],
  },
  output: {
    example: { success: true, title: 'Example Domain', markdown: '# Example', wordCount: 17 },
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        title: { type: 'string' },
        markdown: { type: 'string' },
        wordCount: { type: 'integer' },
      },
    },
  },
})

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

app.get('/', (c) => {
  // Support markdown content negotiation
  const accept = c.req.header('Accept') || ''
  if (accept.includes('text/markdown')) {
    c.header('Content-Type', 'text/markdown; charset=utf-8')
    c.header('Vary', 'Accept')
    return c.body(`# zlurp — Web Scraping API for AI Agents

Any URL → clean markdown. Pay per scrape via x402 micropayments on Base. No accounts, no API keys, no subscriptions.

## Pricing
- Static scraping: $0.005 USDC per URL
- JS rendering: $0.015 USDC per URL

## Endpoints
- GET /health — service status
- GET /probe?url= — cost estimate (free)
- POST /scrape — scrape URL to markdown (x402 payment required)
- GET /openapi.json — OpenAPI 3.1 spec
- GET /docs/llms.txt — agent instructions
`)
  }

  // Agent mode view
  const mode = c.req.query('mode')
  if (mode === 'agent') {
    c.header('Content-Type', 'application/json')
    return c.json({
      name: 'zlurp',
      description: 'Web scraping API for AI agents. Convert any URL to clean markdown via x402 micropayments.',
      baseUrl: 'https://zlurp.ai',
      version: '1.0.0',
      pricing: { static: '$0.005 USDC per URL', js: '$0.015 USDC per URL' },
      auth: { type: 'x402', description: 'Pay per request via USDC on Base. No API keys needed.' },
      endpoints: [
        { method: 'GET', path: '/health', auth: false, description: 'Service status' },
        { method: 'GET', path: '/probe', auth: false, description: 'Cost estimate for scraping a URL' },
        { method: 'POST', path: '/scrape', auth: 'x402', description: 'Scrape URL to markdown' },
      ],
      links: {
        openapi: 'https://zlurp.ai/openapi.json',
        llms: 'https://zlurp.ai/llms.txt',
        agentCard: 'https://zlurp.ai/.well-known/agent-card.json',
      },
    })
  }

  c.header('Link', '</sitemap.xml>; rel="sitemap", </index.md>; rel="alternate"; type="text/markdown", </openapi.json>; rel="service-desc"; type="application/json"')
  c.header('Vary', 'Accept')

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>zlurp — Web Scraping API for AI Agents</title>
  <meta name="description" content="Any URL to clean markdown. Web scraping API for AI agents. Pay $0.005 per scrape via USDC on Base. No accounts, no API keys, no subscriptions.">
  <meta property="og:title" content="zlurp — Web Scraping API for AI Agents">
  <meta property="og:description" content="Any URL to clean markdown. Pay per scrape via x402 micropayments. No accounts needed.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://zlurp.ai">
  <meta property="og:image" content="https://zlurp.ai/og.png">
  <link rel="canonical" href="https://zlurp.ai">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "zlurp",
    "url": "https://zlurp.ai",
    "description": "Web scraping API for AI agents. Convert any URL to clean markdown via x402 micropayments on Base. No accounts, no API keys, no subscriptions.",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0.005",
      "priceCurrency": "USDC",
      "description": "Pay per scrape via x402 micropayments"
    },
    "provider": {
      "@type": "Organization",
      "name": "zlurp",
      "url": "https://zlurp.ai",
      "email": "hello@zlurp.ai"
    },
    "featureList": [
      "URL to markdown conversion",
      "x402 micropayments",
      "No API keys required",
      "Article extraction mode",
      "Full page mode",
      "robots.txt compliant",
      "Redis caching"
    ],
    "sameAs": [
      "https://github.com/zlurp/zlurp"
    ]
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "zlurp",
    "url": "https://zlurp.ai",
    "email": "hello@zlurp.ai",
    "description": "Web scraping API for AI agents",
    "contactPoint": {
      "@type": "ContactPoint",
      "email": "hello@zlurp.ai",
      "contactType": "technical support"
    },
    "sameAs": ["https://github.com/zlurp/zlurp"]
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How much does zlurp cost?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "zlurp costs $0.005 USDC per URL for static scraping and $0.015 USDC per URL for JS-rendered pages."
        }
      },
      {
        "@type": "Question",
        "name": "Do I need an account to use zlurp?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. zlurp uses x402 micropayments on Base. Any wallet with USDC can call the API immediately with no account or API key required."
        }
      },
      {
        "@type": "Question",
        "name": "What is the x402 payment protocol?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "x402 is an HTTP payment protocol that uses the 402 Payment Required status code. Agents pay USDC on Base automatically using an x402-compatible client like x402-fetch."
        }
      }
    ]
  }
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7f4ee; color: #1a1a18; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .wrap { max-width: 560px; padding: 3rem 2rem; text-align: center; }
    .frog { font-size: 4rem; margin-bottom: 1.5rem; }
    h1 { font-size: 2.5rem; font-weight: 400; margin-bottom: 0.75rem; font-family: Georgia, serif; }
    h1 em { color: #1a6b3c; font-style: italic; }
    p { color: #7a7870; font-size: 1.05rem; line-height: 1.7; margin-bottom: 2rem; }
    .endpoints { background: #1a1a18; border-radius: 10px; padding: 1.5rem; text-align: left; font-family: monospace; font-size: 0.85rem; margin-bottom: 2rem; }
    .endpoint { margin-bottom: 0.5rem; }
    .method-get { color: #3dbf74; }
    .method-post { color: #e8b86d; }
    .path { color: #cdd6cc; }
    .desc { color: #555; margin-left: 1rem; }
    .price { display: inline-block; background: #e8f5ee; color: #1a6b3c; padding: 0.4rem 1rem; border-radius: 100px; font-size: 0.85rem; font-weight: 500; margin-right: 0.5rem; }
    .links { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-top: 1.5rem; }
    .links a { color: #1a6b3c; font-size: 0.9rem; text-decoration: none; border-bottom: 1px solid #1a6b3c; padding-bottom: 1px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="frog">🐸</div>
    <h1>Any URL. <em>Clean markdown.</em></h1>
    <p>Web scraping API for AI agents. Pay $0.005 per scrape via USDC on Base. No accounts, no API keys, no subscriptions.</p>
    <div class="endpoints">
      <div class="endpoint"><span class="method-get">GET</span>  <span class="path">/health</span><span class="desc"># service status</span></div>
      <div class="endpoint"><span class="method-get">GET</span>  <span class="path">/probe?url=</span><span class="desc"># cost estimate (free)</span></div>
      <div class="endpoint"><span class="method-post">POST</span> <span class="path">/scrape</span><span class="desc"># scrape url → markdown</span></div>
      <div class="endpoint"><span class="method-get">GET</span>  <span class="path">/openapi.json</span><span class="desc"># api spec</span></div>
      <div class="endpoint"><span class="method-get">GET</span>  <span class="path">/docs/llms.txt</span><span class="desc"># for agents</span></div>
    </div>
    <div>
      <span class="price">$0.005 static</span>
      <span class="price">$0.015 JS rendering</span>
    </div>
    <div class="links">
      <a href="/openapi.json">OpenAPI Spec</a>
      <a href="/llms.txt">llms.txt</a>
      <a href="/pricing.md">Pricing</a>
      <a href="/about">About</a>
      <a href="/privacy">Privacy</a>
      <a href="/health">Health</a>
      <a href="https://x402.org">x402 Protocol</a>
    </div>
  </div>
</body>
</html>`)
})


app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'zlurp',
    version: '0.1.0',
    network: NETWORK,
  })
})


app.get('/openapi.json', (c) => {
  try {
    const spec = readFileSync(new URL('../public/openapi.json', import.meta.url), 'utf-8')
    c.header('Content-Type', 'application/json')
    return c.body(spec)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

app.get('/docs/llms.txt', (c) => {
  try {
    const txt = readFileSync(new URL('../public/docs/llms.txt', import.meta.url), 'utf-8')
    c.header('Content-Type', 'text/plain; charset=utf-8')
    return c.body(txt)
  } catch {
    return c.text('Not found', 404)
  }
})

app.get('/.well-known/agent-card.json', (c) => {
  return c.json({
    name: 'zlurp',
    description: 'Web scraping API for AI agents. Convert any URL to clean markdown. Pay per scrape via x402 — no accounts or API keys required.',
    url: 'https://zlurp.ai',
    version: '1.0.0',
    skills: [
      {
        id: 'scrape-url',
        name: 'Scrape URL to markdown',
        description: 'Convert any public URL to clean structured markdown.',
        tags: ['scraping', 'markdown', 'web', 'x402'],
      },
    ],
  })
})

app.get('/.well-known/api-catalog', (c) => {
  c.header('Content-Type', 'application/linkset+json;profile="https://www.rfc-editor.org/info/rfc9727"')
  return c.json({
    linkset: [
      {
        anchor: 'https://zlurp.ai',
        item: [
          {
            href: 'https://zlurp.ai/openapi.json',
            type: 'application/json',
            title: 'zlurp OpenAPI 3.1 Spec',
          },
        ],
      },
    ],
  })
})

app.get('/probe', (c) => {
  const url = c.req.query('url')
  const mode = c.req.query('mode') || 'article'
  const js = c.req.query('js') === 'true'

  if (!url) {
    return c.json({ error: 'MISSING_URL', message: 'url query parameter is required' }, 400)
  }

  try {
    new URL(url)
  } catch {
    return c.json({ error: 'INVALID_URL', message: 'url must be a valid http/https URL' }, 400)
  }

  const costUSDC = js ? PRICE_JS : PRICE_STATIC

  return c.json({
    url,
    mode,
    js,
    costUSDC: costUSDC.toFixed(6),
    pricePerRequest: `${costUSDC} USDC`,
    network: NETWORK,
  })
})

app.use(
  '/scrape',
  paymentMiddleware(
    {
      'POST /scrape': {
        accepts: {
          scheme: 'exact',
          price: `$${PRICE_STATIC}`,
          network: `eip155:${CHAIN_ID}` as `eip155:${string}`,
          payTo: RECEIVING_ADDRESS,
          maxTimeoutSeconds: 300,
          resource: 'https://zlurp.ai/scrape',
        },
        description: 'Scrape any public URL to clean markdown',
        mimeType: 'application/json',
        extensions: scrapeDiscovery,
      },
    },
    resourceServer,
  ),
)

app.post('/scrape', async (c) => {
  let body: { url?: string; mode?: string; js?: boolean }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'INVALID_BODY', message: 'Request body must be valid JSON' }, 400)
  }

  const { url, mode = 'article' } = body

  if (!url) {
    return c.json({ error: 'MISSING_URL', message: 'url is required' }, 400)
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol')
    }
  } catch {
    return c.json({ error: 'INVALID_URL', message: 'url must be a valid http/https URL' }, 400)
  }

  const allowed = await isAllowed(url)
  if (!allowed) {
    return c.json({
      error: 'BLOCKED',
      message: 'This URL is disallowed by robots.txt. zlurp respects robots.txt by default.',
      url,
    }, 403)
  }

  const cached = await getCache(url, mode)
  if (cached) {
    return c.json({
      success: true,
      url,
      mode,
      title: cached.title,
      markdown: cached.markdown,
      wordCount: cached.wordCount,
      charCount: cached.charCount,
      jsRendered: false,
      cachedResult: true,
      scrapedAt: cached.scrapedAt,
    })
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!res.ok) {
      return c.json({ error: 'FETCH_FAILED', message: `Page returned HTTP ${res.status}` }, 422)
    }

    const html = await res.text()
    let markdown = ''
    let title = ''

    if (mode === 'article') {
      const dom = new JSDOM(html, { url })
      const reader = new Readability(dom.window.document)
      const article = reader.parse()

      if (article && article.content) {
        markdown = td.turndown(article.content)
        title = article.title || ''
      } else {
        const $ = cheerio.load(html)
        $('script, style, noscript').remove()
        markdown = td.turndown($('body').html() || '')
        title = $('title').text().trim()
      }
    } else {
      const $ = cheerio.load(html)
      $('script, style, noscript').remove()
      markdown = td.turndown($('body').html() || '')
      title = $('title').text().trim()
    }

    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim()

    if (!markdown || markdown.length < 20) {
      return c.json({ error: 'RENDER_FAILED', message: 'Page returned no extractable content' }, 422)
    }

    const scrapedAt = new Date().toISOString()

    await setCache(url, mode, {
      markdown,
      title,
      wordCount: markdown.trim().split(/\s+/).length,
      charCount: markdown.length,
      scrapedAt,
    })

    return c.json({
      success: true,
      url,
      mode,
      title,
      markdown,
      wordCount: markdown.trim().split(/\s+/).length,
      charCount: markdown.length,
      jsRendered: false,
      cachedResult: false,
      scrapedAt,
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('timeout')) {
      return c.json({ error: 'TIMEOUT', message: 'Request timed out' }, 422)
    }
    return c.json({ error: 'SCRAPE_FAILED', message: msg }, 422)
  }
})

const port = parseInt(process.env.PORT || '3000')

serve({ fetch: app.fetch, port }, () => {
  console.log(`🐸 zlurp running on port ${port}`)
  console.log(`   network:  ${NETWORK}`)
  console.log(`   payTo:    ${RECEIVING_ADDRESS}`)
  console.log(`   cache:    ${process.env.REDIS_URL ? 'Redis enabled' : 'disabled (no REDIS_URL)'}`)
})


app.get('/llms.txt', (c) => {
  try {
    const txt = readFileSync(new URL('../public/docs/llms.txt', import.meta.url), 'utf-8')
    c.header('Content-Type', 'text/plain; charset=utf-8')
    return c.body(txt)
  } catch {
    return c.text('Not found', 404)
  }
})

app.get('/.well-known/llms.txt', (c) => {
  try {
    const txt = readFileSync(new URL('../public/docs/llms.txt', import.meta.url), 'utf-8')
    c.header('Content-Type', 'text/plain; charset=utf-8')
    return c.body(txt)
  } catch {
    return c.text('Not found', 404)
  }
})

app.get('/robots.txt', (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8')
  return c.body(`User-agent: *
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Disallow: /

User-agent: ByteSpider
Disallow: /

Sitemap: https://zlurp.ai/sitemap.xml

Content-Signal: search=yes, ai-input=yes, ai-train=no
`)
})

app.get('/sitemap.xml', (c) => {
  const today = new Date().toISOString().split('T')[0]
  c.header('Content-Type', 'application/xml')
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://zlurp.ai/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
  <url><loc>https://zlurp.ai/openapi.json</loc><lastmod>${today}</lastmod><priority>0.9</priority></url>
  <url><loc>https://zlurp.ai/docs/llms.txt</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>
  <url><loc>https://zlurp.ai/pricing.md</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>
</urlset>`)
})

app.get('/index.md', (c) => {
  c.header('Content-Type', 'text/markdown; charset=utf-8')
  return c.body(`# zlurp — Web Scraping API for AI Agents

Any URL to clean markdown. Pay per scrape via x402 micropayments on Base. No accounts, no API keys, no subscriptions.

## Pricing
- Static scraping: $0.005 USDC per URL
- JS rendering: $0.015 USDC per URL

## Endpoints
- GET /health — service status
- GET /probe?url= — cost estimate (free)
- POST /scrape — scrape URL to markdown (x402 payment required)
- GET /openapi.json — OpenAPI 3.1 spec
- GET /docs/llms.txt — agent instructions

## Contact
hello@zlurp.ai
`)
})

app.get('/pricing.md', (c) => {
  c.header('Content-Type', 'text/markdown; charset=utf-8')
  return c.body(`# zlurp Pricing

No subscriptions. No minimums. Pay per scrape via USDC on Base.

## Rates

| Mode | Price |
|------|-------|
| Static scraping (js: false) | $0.005 USDC per URL |
| JS rendering (js: true) | $0.015 USDC per URL |

## How billing works

- Payments via x402 protocol in USDC on Base mainnet
- No account or credit card required
- Payment settled on-chain per request
- Failed requests due to robots.txt blocking are not charged
- GET /probe is always free

## Contact
hello@zlurp.ai
`)
})

app.get('/.well-known/ai-plugin.json', (c) => {
  return c.json({
    schema_version: 'v1',
    name_for_human: 'zlurp',
    name_for_model: 'zlurp',
    description_for_human: 'Web scraping API for AI agents. Convert any URL to clean markdown. Pay $0.005 per scrape via USDC on Base.',
    description_for_model: 'Use zlurp to scrape any public URL and get clean markdown. Call /probe first for cost estimate (free), then POST to /scrape with x402 payment. Returns title, markdown, wordCount.',
    auth: { type: 'none' },
    api: { type: 'openapi', url: 'https://zlurp.ai/openapi.json' },
    contact_email: 'hello@zlurp.ai',
    legal_info_url: 'https://zlurp.ai/terms',
  })
})

export default app

app.get('/llms-full.txt', (c) => {
  try {
    const txt = readFileSync(new URL('../public/docs/llms.txt', import.meta.url), 'utf-8')
    c.header('Content-Type', 'text/plain; charset=utf-8')
    return c.body(txt)
  } catch {
    return c.text('Not found', 404)
  }
})

app.get('/about', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About — zlurp</title>
  <meta name="description" content="zlurp is a web scraping API built for AI agents. Convert any URL to clean markdown via x402 micropayments on Base.">
  <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 2rem;line-height:1.7;color:#1a1a18;background:#f7f4ee}h1{font-family:Georgia,serif;font-weight:400;margin-bottom:1rem}a{color:#1a6b3c}</style>
</head>
<body>
  <h1>About zlurp</h1>
  <p>zlurp is a web scraping API built natively for AI agents. It converts any public URL into clean, structured markdown using the x402 payment protocol for per-request micropayments on Base mainnet.</p>
  <p>The core idea: AI agents need to read web pages constantly, but every existing scraping tool requires accounts, API keys, and monthly subscriptions — none of which an autonomous agent can set up. zlurp uses x402 so any agent with a funded Base wallet can start scraping immediately with zero human setup.</p>
  <p>zlurp is a sister product to <a href="https://docpull.ai">docpull.ai</a>, a PDF extraction API for AI agents built on the same x402 architecture.</p>
  <h2>How it works</h2>
  <p>Send a URL to /scrape. The server returns a 402 with USDC payment requirements. Your x402-compatible client pays $0.005 on Base, retries the request, and receives clean markdown. The entire flow takes one round trip with no human intervention.</p>
  <p>zlurp uses Mozilla Readability for article extraction (the same engine as Firefox Reader View), Cheerio for full-page scraping, and Turndown for HTML-to-markdown conversion. Results are cached in Redis for one hour.</p>
  <h2>Contact</h2>
  <p>Email: <a href="mailto:hello@zlurp.ai">hello@zlurp.ai</a></p>
  <p><a href="/">← Home</a></p>
</body>
</html>`)
})

app.get('/privacy', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — zlurp</title>
  <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 2rem;line-height:1.7;color:#1a1a18;background:#f7f4ee}h1,h2{font-family:Georgia,serif;font-weight:400}a{color:#1a6b3c}</style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>Last updated: May 2026</p>
  <h2>What we collect</h2>
  <p>zlurp collects minimal data. When you call the /scrape endpoint, we temporarily process the URL you submit and cache the scraped result for up to one hour to serve repeated requests efficiently. We do not store URLs or scraped content permanently.</p>
  <p>Payments are processed via the x402 protocol on the Base blockchain. Payment transactions are publicly visible on-chain by nature of blockchain technology. We receive the USDC payment amount and the sending wallet address as part of each transaction.</p>
  <h2>What we do not collect</h2>
  <p>We do not collect names, email addresses, or any personal identifying information. We do not require account creation. We do not use cookies or tracking pixels. We do not sell data to third parties.</p>
  <h2>Infrastructure</h2>
  <p>zlurp is hosted on Railway. Caching is provided by Upstash Redis. Both services may retain logs for operational purposes according to their own privacy policies.</p>
  <h2>Contact</h2>
  <p>For privacy questions, contact <a href="mailto:hello@zlurp.ai">hello@zlurp.ai</a>.</p>
  <p><a href="/">← Home</a></p>
</body>
</html>`)
})

app.get('/terms', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service — zlurp</title>
  <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 2rem;line-height:1.7;color:#1a1a18;background:#f7f4ee}h1,h2{font-family:Georgia,serif;font-weight:400}a{color:#1a6b3c}</style>
</head>
<body>
  <h1>Terms of Service</h1>
  <p>Last updated: May 2026</p>
  <h2>Service description</h2>
  <p>zlurp provides a web scraping API that converts public URLs to markdown. The service is provided on a pay-per-request basis via the x402 payment protocol using USDC on Base mainnet.</p>
  <h2>Acceptable use</h2>
  <p>You may use zlurp to scrape publicly accessible web pages that you have permission to access. You are responsible for ensuring your use complies with the terms of service of websites you scrape and applicable laws including copyright law.</p>
  <p>zlurp respects robots.txt by default. URLs disallowed by robots.txt will return a 403 error and will not be charged. You must not use zlurp to scrape websites in violation of their terms of service.</p>
  <p>You may not use zlurp for illegal purposes, to harvest personal data without consent, or to conduct denial-of-service attacks against third-party websites.</p>
  <h2>Payment</h2>
  <p>Payments are non-refundable once settled on-chain. Cached results served within one hour of the original scrape are still charged at the standard rate. Failed requests due to robots.txt blocking are not charged.</p>
  <h2>Disclaimer</h2>
  <p>zlurp is provided as-is without warranty. We are not responsible for the content of scraped pages or for any damages arising from your use of the service.</p>
  <h2>Contact</h2>
  <p><a href="mailto:hello@zlurp.ai">hello@zlurp.ai</a></p>
  <p><a href="/">← Home</a></p>
</body>
</html>`)
})


app.get('/docs', (c) => {
  return c.redirect('/docs/llms.txt', 301)
})

app.get('/.well-known/x402', (c) => {
  return c.json({
    x402Version: 1,
    resources: [
      {
        resource: 'https://zlurp.ai/scrape',
        type: 'http',
        description: 'Scrape any public URL to clean markdown. Returns title, markdown content, and word count.',
        category: 'data',
        pricing: '$0.005 USDC per URL (static), $0.015 USDC per URL (JS rendering)',
        network: 'eip155:8453',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        schema: {
          input: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'The public URL to scrape' },
              mode: { type: 'string', enum: ['article', 'full'], default: 'article', description: 'article strips nav/ads, full returns entire page' },
              js: { type: 'boolean', default: false, description: 'Enable JS rendering for SPAs (costs 3x more)' }
            },
            required: ['url']
          },
          output: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              title: { type: 'string' },
              markdown: { type: 'string' },
              wordCount: { type: 'integer' },
              charCount: { type: 'integer' },
              cachedResult: { type: 'boolean' },
              scrapedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    ]
  })
})
