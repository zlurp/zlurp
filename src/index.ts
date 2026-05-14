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
import { handleMcp } from './mcp.js'
import { getCache, setCache } from './cache.js'

const app = new Hono()

// Trust proxy headers so x402 sees https:// URLs
app.use('*', async (c, next) => {
  const proto = c.req.header('x-forwarded-proto')
  if (proto === 'https') {
    // Rewrite the URL to use https
    const url = new URL(c.req.url)
    url.protocol = 'https:'
    Object.defineProperty(c.req.raw, 'url', { value: url.toString(), writable: true })
  }
  await next()
})

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
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"zlurp","url":"https://zlurp.ai","description":"Web scraping API for AI agents. Convert any URL to clean markdown via x402 micropayments on Base. No accounts, no API keys, no subscriptions.","applicationCategory":"DeveloperApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"0.005","priceCurrency":"USDC"},"provider":{"@type":"Organization","name":"zlurp","url":"https://zlurp.ai","email":"hello@zlurp.ai"},"sameAs":["https://github.com/zlurp/zlurp"]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"zlurp","url":"https://zlurp.ai","email":"hello@zlurp.ai","contactPoint":{"@type":"ContactPoint","email":"hello@zlurp.ai","contactType":"technical support"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","speakable":{"@type":"SpeakableSpecification","cssSelector":["h1",".hero-sub"]},"url":"https://zlurp.ai"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How much does zlurp cost?","acceptedAnswer":{"@type":"Answer","text":"zlurp costs $0.005 USDC per URL for static scraping and $0.015 USDC per URL for JS-rendered pages."}},{"@type":"Question","name":"Do I need an account?","acceptedAnswer":{"@type":"Answer","text":"No. zlurp uses x402 micropayments on Base. Any wallet with USDC can call the API immediately with no account or API key required."}}]}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#1a6b3c;--green-mid:#2d9e60;--green-light:#e8f5ee;--green-bright:#3dbf74;--cream:#f7f4ee;--cream-dark:#ede9e0;--ink:#1a1a18;--ink-mid:#3d3d38;--ink-muted:#7a7870;--font-serif:'Instrument Serif',Georgia,serif;--font-mono:'DM Mono',monospace;--font-sans:'DM Sans',system-ui,sans-serif}
html{scroll-behavior:smooth}
body{font-family:var(--font-sans);background:var(--cream);color:var(--ink);line-height:1.6;overflow-x:hidden}
nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(247,244,238,0.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--cream-dark);padding:0 2rem;height:56px;display:flex;align-items:center;justify-content:space-between}
.nav-logo{display:flex;align-items:center;gap:10px;font-family:var(--font-serif);font-size:1.4rem;color:var(--ink);text-decoration:none}
.nav-links{display:flex;gap:2rem;align-items:center;list-style:none}
.nav-links a{font-size:0.875rem;color:var(--ink-muted);text-decoration:none;transition:color 0.2s}
.nav-links a:hover{color:var(--green)}
.nav-cta{background:var(--green)!important;color:white!important;padding:0.45rem 1.1rem;border-radius:6px;font-weight:500!important}
.ticker-wrap{overflow:hidden;background:var(--green);padding:0.65rem 0;white-space:nowrap;margin-top:56px}
.ticker{display:inline-block;animation:ticker 22s linear infinite}
.ticker-item{display:inline-block;color:rgba(255,255,255,0.75);font-family:var(--font-mono);font-size:0.75rem;padding:0 2.5rem}
.ticker-item span{color:rgba(255,255,255,0.4);margin:0 0.5rem}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.hero{max-width:1100px;margin:0 auto;padding:5rem 2rem 3rem;display:flex;gap:4rem;align-items:center;flex-wrap:wrap}
.hero-text{flex:1;min-width:280px;max-width:560px}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:var(--green-light);color:var(--green);font-size:0.8rem;font-weight:500;padding:0.35rem 0.85rem;border-radius:100px;margin-bottom:1.5rem;font-family:var(--font-mono)}
.hero-badge::before{content:'';width:7px;height:7px;background:var(--green-bright);border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.85)}}
h1{font-family:var(--font-serif);font-size:clamp(2.8rem,5vw,4.2rem);line-height:1.1;color:var(--ink);margin-bottom:1.25rem;font-weight:400}
h1 em{font-style:italic;color:var(--green)}
.hero-sub{font-size:1.1rem;color:var(--ink-mid);line-height:1.7;margin-bottom:2rem;font-weight:300;max-width:460px}
.hero-actions{display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
.btn-primary{background:var(--green);color:white;padding:0.75rem 1.75rem;border-radius:8px;font-size:0.95rem;font-weight:500;text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:background 0.2s}
.btn-primary:hover{background:#155230}
.btn-secondary{color:var(--ink-mid);font-size:0.9rem;text-decoration:none}
.hero-stats{display:flex;gap:2rem;margin-top:2.5rem;padding-top:2rem;border-top:1px solid var(--cream-dark)}
.stat-num{font-family:var(--font-serif);font-size:1.5rem;color:var(--ink);line-height:1;display:block}
.stat-label{font-size:0.78rem;color:var(--ink-muted)}
.hero-visual{flex:1;min-width:280px;max-width:520px}
.frog-svg{animation:float 4s ease-in-out infinite;filter:drop-shadow(0 12px 20px rgba(26,107,60,0.2));display:block;margin:0 auto 1.5rem}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.terminal-wrap{background:var(--ink);border-radius:12px;overflow:hidden;box-shadow:0 24px 60px rgba(26,26,24,0.2)}
.terminal-bar{background:#2a2a27;padding:0.75rem 1rem;display:flex;align-items:center;gap:0.5rem}
.td{width:11px;height:11px;border-radius:50%}
.td-r{background:#ff5f57}.td-y{background:#febc2e}.td-g{background:#28c840}
.terminal-title{font-family:var(--font-mono);font-size:0.75rem;color:#666;margin-left:0.5rem}
.terminal-body{padding:1.5rem;font-family:var(--font-mono);font-size:0.82rem;line-height:1.8}
.tc{color:#5c7a5c}.tcmd{color:#7ec8a4}.tf{color:#e8b86d}.ts{color:#f0a86e}.tk{color:#82aadc}.tv{color:#c3e88d}.tw{color:#cdd6cc}
.tcursor{display:inline-block;width:8px;height:15px;background:var(--green-bright);opacity:0.8;animation:blink 1.2s infinite;vertical-align:middle}
@keyframes blink{0%,100%{opacity:.8}50%{opacity:0}}
.divider{height:1px;background:var(--cream-dark);max-width:1100px;margin:0 auto}
section{max-width:1100px;margin:0 auto;padding:5rem 2rem}
.section-label{font-family:var(--font-mono);font-size:0.75rem;color:var(--green);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:0.75rem}
h2{font-family:var(--font-serif);font-size:clamp(2rem,3.5vw,2.8rem);font-weight:400;line-height:1.15;color:var(--ink);margin-bottom:1rem}
h2 em{font-style:italic;color:var(--green)}
.section-sub{font-size:1rem;color:var(--ink-muted);max-width:500px;line-height:1.7;margin-bottom:3rem}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));border:1px solid var(--cream-dark);border-radius:12px;overflow:hidden;background:white}
.step{padding:2rem 1.75rem;border-right:1px solid var(--cream-dark)}
.step:last-child{border-right:none}
.step-num{font-family:var(--font-mono);font-size:0.75rem;color:var(--ink-muted);margin-bottom:1rem}
.step-icon{font-size:1.75rem;margin-bottom:0.75rem}
.step h3{font-family:var(--font-serif);font-size:1.1rem;font-weight:400;margin-bottom:0.5rem}
.step p{font-size:0.875rem;color:var(--ink-muted);line-height:1.6}
.step code{font-family:var(--font-mono);font-size:0.78rem;background:var(--cream);padding:0.1rem 0.35rem;border-radius:3px}
.pricing-wrap{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start}
@media(max-width:700px){.pricing-wrap{grid-template-columns:1fr}}
.price-card{background:white;border:1px solid var(--cream-dark);border-radius:12px;padding:2rem}
.price-card.featured{background:var(--ink);border-color:var(--ink);color:white}
.price-label{font-family:var(--font-mono);font-size:0.75rem;color:var(--ink-muted);margin-bottom:0.5rem}
.price-card.featured .price-label{color:#888}
.price-amount{font-family:var(--font-serif);font-size:2.5rem;line-height:1;margin-bottom:0.25rem}
.price-unit{font-size:0.82rem;color:var(--ink-muted);margin-bottom:1.5rem}
.price-card.featured .price-unit,.price-card.featured .price-amount{color:white}
.price-features{list-style:none;display:flex;flex-direction:column;gap:0.6rem}
.price-features li{display:flex;align-items:center;gap:8px;font-size:0.875rem;color:var(--ink-mid)}
.price-card.featured .price-features li{color:#bbb}
.price-features li::before{content:'✓';color:var(--green-bright);font-weight:700}
.x402-callout{margin-top:1.5rem;padding:1.25rem;background:var(--green-light);border-radius:8px;font-size:0.875rem;color:var(--green);line-height:1.6}
.compare-table{width:100%;border-collapse:collapse;background:white;border:1px solid var(--cream-dark);border-radius:12px;overflow:hidden;font-size:0.875rem}
.compare-table th{background:var(--cream);padding:0.9rem 1.25rem;text-align:left;font-weight:500;font-size:0.82rem;color:var(--ink-muted);border-bottom:1px solid var(--cream-dark)}
.compare-table th.hl{color:var(--green)}
.compare-table td{padding:0.85rem 1.25rem;border-bottom:1px solid var(--cream-dark);color:var(--ink-mid)}
.compare-table tr:last-child td{border-bottom:none}
.compare-table td:first-child{font-weight:500;color:var(--ink)}
.chk{color:var(--green-bright)}.crs{color:#ccc}.thl{background:rgba(30,107,60,0.03)}
footer{border-top:1px solid var(--cream-dark);padding:2.5rem 2rem;max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem}
.footer-logo{font-family:var(--font-serif);font-size:1.1rem;color:var(--ink);display:flex;align-items:center;gap:8px;text-decoration:none}
.footer-links{display:flex;gap:1.5rem;list-style:none}
.footer-links a{font-size:0.82rem;color:var(--ink-muted);text-decoration:none;transition:color 0.2s}
.footer-links a:hover{color:var(--green)}
.orank-badge{font-family:var(--font-mono);font-size:0.72rem;color:var(--green);background:var(--green-light);padding:0.3rem 0.7rem;border-radius:4px;text-decoration:none}
</style>
</head>
<body>
<nav>
  <a href="#" class="nav-logo">
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <ellipse cx="16" cy="18" rx="11" ry="9" fill="#2d9e60"/>
      <ellipse cx="8" cy="10" rx="4.5" ry="4.5" fill="#2d9e60"/>
      <ellipse cx="24" cy="10" rx="4.5" ry="4.5" fill="#2d9e60"/>
      <ellipse cx="8" cy="10" rx="2.5" ry="2.5" fill="#1a6b3c"/>
      <ellipse cx="24" cy="10" rx="2.5" ry="2.5" fill="#1a6b3c"/>
      <ellipse cx="8" cy="10" rx="1.2" ry="1.2" fill="#0d3d22"/>
      <ellipse cx="24" cy="10" rx="1.2" ry="1.2" fill="#0d3d22"/>
      <path d="M11 21 Q16 24 21 21" stroke="#1a6b3c" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    </svg>
    zlurp
  </a>
  <ul class="nav-links">
    <li><a href="#how">How it works</a></li>
    <li><a href="#api">API</a></li>
    <li><a href="#pricing">Pricing</a></li>
    <li><a href="/compare">Compare</a></li>
    <li><a href="/openapi.json">Docs</a></li>
    <li><a href="/openapi.json" class="nav-cta">Read docs →</a></li>
  </ul>
</nav>
<div class="ticker-wrap">
  <div class="ticker">
    <span class="ticker-item">x402 native <span>·</span></span>
    <span class="ticker-item">no API keys required <span>·</span></span>
    <span class="ticker-item">agent-ready <span>·</span></span>
    <span class="ticker-item">USDC on Base <span>·</span></span>
    <span class="ticker-item">JS rendering available <span>·</span></span>
    <span class="ticker-item">robots.txt compliant <span>·</span></span>
    <span class="ticker-item">OpenAPI spec <span>·</span></span>
    <span class="ticker-item">llms.txt included <span>·</span></span>
    <span class="ticker-item">x402 native <span>·</span></span>
    <span class="ticker-item">no API keys required <span>·</span></span>
    <span class="ticker-item">agent-ready <span>·</span></span>
    <span class="ticker-item">USDC on Base <span>·</span></span>
    <span class="ticker-item">JS rendering available <span>·</span></span>
    <span class="ticker-item">robots.txt compliant <span>·</span></span>
    <span class="ticker-item">OpenAPI spec <span>·</span></span>
    <span class="ticker-item">llms.txt included <span>·</span></span>
  </div>
</div>
<div class="hero">
  <div class="hero-text">
    <div class="hero-badge">● Live — x402 v2</div>
    <h1>Any URL.<br><em>Clean markdown.</em><br>Instantly.</h1>
    <p class="hero-sub">A web scraping API built natively for AI agents. Send a URL, receive structured markdown. Pay $0.005 per scrape via USDC — no accounts, no subscriptions, no friction.</p>
    <div class="hero-actions">
      <a href="#api" class="btn-primary">Read the docs →</a>
      <a href="#how" class="btn-secondary">See how it works ↓</a>
    </div>
    <div class="hero-stats">
      <div><span class="stat-num">$0.005</span><span class="stat-label">per URL scraped</span></div>
      <div><span class="stat-num">~1.2s</span><span class="stat-label">avg response time</span></div>
      <div><span class="stat-num">0</span><span class="stat-label">accounts needed</span></div>
    </div>
  </div>
  <div class="hero-visual">
    <svg class="frog-svg" width="120" height="100" viewBox="0 0 120 100" fill="none">
      <ellipse cx="60" cy="65" rx="38" ry="28" fill="#2d9e60"/>
      <ellipse cx="36" cy="42" rx="14" ry="14" fill="#2d9e60"/>
      <ellipse cx="84" cy="42" rx="14" ry="14" fill="#2d9e60"/>
      <ellipse cx="36" cy="42" rx="9" ry="9" fill="#f7f4ee"/>
      <ellipse cx="84" cy="42" rx="9" ry="9" fill="#f7f4ee"/>
      <ellipse cx="37" cy="42" rx="5" ry="5" fill="#1a1a18"/>
      <ellipse cx="85" cy="42" rx="5" ry="5" fill="#1a1a18"/>
      <ellipse cx="39" cy="40" rx="2" ry="2" fill="white"/>
      <ellipse cx="87" cy="40" rx="2" ry="2" fill="white"/>
      <ellipse cx="60" cy="70" rx="24" ry="17" fill="#3dbf74" opacity="0.45"/>
      <path d="M44 72 Q60 82 76 72" stroke="#1a6b3c" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M60 76 Q80 68 98 58 Q104 54 108 58 Q112 62 106 66 Q100 70 82 76 Q70 80 60 76Z" fill="#e05555" opacity="0.9"/>
      <ellipse cx="107" cy="62" rx="5" ry="4" fill="#c03333" opacity="0.9" transform="rotate(-15 107 62)"/>
      <ellipse cx="30" cy="86" rx="12" ry="6" fill="#1a6b3c" transform="rotate(-20 30 86)"/>
      <ellipse cx="90" cy="86" rx="12" ry="6" fill="#1a6b3c" transform="rotate(20 90 86)"/>
    </svg>
    <div class="terminal-wrap">
      <div class="terminal-bar">
        <div class="td td-r"></div><div class="td td-y"></div><div class="td td-g"></div>
        <span class="terminal-title">zlurp API · agent client</span>
      </div>
      <div class="terminal-body">
        <div class="tc"># 1. Probe cost before paying</div>
        <div class="tcmd">curl <span class="ts">"https://zlurp.ai/probe?url=https://news.ycombinator.com"</span></div>
        <div style="margin-bottom:0.75rem"><span class="tc">→</span> <span class="tw">{ </span><span class="tk">"costUSDC"</span><span class="tw">: </span><span class="tv">"0.005000"</span><span class="tw"> }</span></div>
        <div class="tc"># 2. Scrape with x402 payment</div>
        <div class="tcmd">curl <span class="tf">-X POST</span> https://zlurp.ai/scrape \</div>
        <div style="padding-left:1.5rem" class="tcmd"><span class="tf">-d</span> <span class="ts">'{"url": "https://news.ycombinator.com"}'</span></div>
        <div style="margin-bottom:0.5rem"><span class="tc">→</span> <span class="tw">{ </span><span class="tk">"success"</span><span class="tw">: </span><span class="tv">true</span><span class="tw">,</span></div>
        <div style="padding-left:1.5rem"><span class="tk">"markdown"</span><span class="tw">: </span><span class="tv">"# Hacker News\n\n..."</span><span class="tw">,</span></div>
        <div style="padding-left:1.5rem"><span class="tk">"wordCount"</span><span class="tw">: </span><span class="tv">842</span><span class="tw"> }</span></div>
        <span class="tcursor"></span>
      </div>
    </div>
  </div>
</div>
<div class="divider"></div>
<section id="how">
  <p class="section-label">How it works</p>
  <h2>Three steps. <em>Zero setup.</em></h2>
  <p class="section-sub">No accounts to create. No API keys to manage. Any agent with a Base wallet can start scraping in minutes.</p>
  <div class="steps">
    <div class="step"><div class="step-num">01</div><div class="step-icon">🔍</div><h3>Probe the URL</h3><p>Call <code>/probe</code> with any URL. Get back the exact cost before committing payment. Always free.</p></div>
    <div class="step"><div class="step-num">02</div><div class="step-icon">⚡</div><h3>Pay via x402</h3><p>POST to <code>/scrape</code>. The x402 protocol settles $0.005 USDC on Base automatically — no human required.</p></div>
    <div class="step"><div class="step-num">03</div><div class="step-icon">📄</div><h3>Receive markdown</h3><p>Get clean, structured markdown back. Article mode strips nav and ads. Full mode returns the entire page.</p></div>
    <div class="step"><div class="step-num">04</div><div class="step-icon">🤖</div><h3>Agent-native</h3><p>No sessions, no credentials, no subscriptions. Any agent with a funded Base wallet can call zlurp autonomously at 3am.</p></div>
  </div>
</section>
<div class="divider"></div>
<section id="api">
  <p class="section-label">API reference</p>
  <h2>Simple endpoints. <em>Predictable responses.</em></h2>
  <p class="section-sub">Base URL: <code style="font-family:var(--font-mono)">https://zlurp.ai</code></p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
    <div style="background:white;border:1px solid var(--cream-dark);border-radius:10px;overflow:hidden"><div style="display:flex;align-items:center;gap:10px;padding:0.9rem 1.25rem;border-bottom:1px solid var(--cream-dark)"><span style="font-family:var(--font-mono);font-size:0.7rem;font-weight:500;padding:0.2rem 0.5rem;border-radius:4px;background:var(--green-light);color:var(--green)">GET</span><span style="font-family:var(--font-mono);font-size:0.82rem">/health</span><span style="margin-left:auto;font-family:var(--font-mono);font-size:0.68rem;color:var(--ink-muted);background:var(--cream);padding:0.15rem 0.5rem;border-radius:4px">no auth</span></div><div style="padding:1rem 1.25rem;font-size:0.82rem;color:var(--ink-muted)">Service status check. Required for AgentReady compliance.</div></div>
    <div style="background:white;border:1px solid var(--cream-dark);border-radius:10px;overflow:hidden"><div style="display:flex;align-items:center;gap:10px;padding:0.9rem 1.25rem;border-bottom:1px solid var(--cream-dark)"><span style="font-family:var(--font-mono);font-size:0.7rem;font-weight:500;padding:0.2rem 0.5rem;border-radius:4px;background:var(--green-light);color:var(--green)">GET</span><span style="font-family:var(--font-mono);font-size:0.82rem">/probe</span><span style="margin-left:auto;font-family:var(--font-mono);font-size:0.68rem;color:var(--ink-muted);background:var(--cream);padding:0.15rem 0.5rem;border-radius:4px">no auth</span></div><div style="padding:1rem 1.25rem;font-size:0.82rem;color:var(--ink-muted)">Cost estimate before payment. Pass <code style="font-family:var(--font-mono);font-size:0.78rem;background:var(--cream);padding:0.1rem 0.3rem;border-radius:3px">?url=</code> to get exact USDC cost.</div></div>
    <div style="background:white;border:1px solid var(--cream-dark);border-radius:10px;overflow:hidden"><div style="display:flex;align-items:center;gap:10px;padding:0.9rem 1.25rem;border-bottom:1px solid var(--cream-dark)"><span style="font-family:var(--font-mono);font-size:0.7rem;font-weight:500;padding:0.2rem 0.5rem;border-radius:4px;background:#fff3e0;color:#b45309">POST</span><span style="font-family:var(--font-mono);font-size:0.82rem">/scrape</span><span style="margin-left:auto;font-family:var(--font-mono);font-size:0.68rem;color:var(--ink-muted);background:var(--cream);padding:0.15rem 0.5rem;border-radius:4px">x402 payment</span></div><div style="padding:1rem 1.25rem;font-size:0.82rem;color:var(--ink-muted)">Scrape any URL to markdown. Body: <code style="font-family:var(--font-mono);font-size:0.78rem;background:var(--cream);padding:0.1rem 0.3rem;border-radius:3px">{"url":"...","mode":"article"}</code></div></div>
    <div style="background:white;border:1px solid var(--cream-dark);border-radius:10px;overflow:hidden"><div style="display:flex;align-items:center;gap:10px;padding:0.9rem 1.25rem;border-bottom:1px solid var(--cream-dark)"><span style="font-family:var(--font-mono);font-size:0.7rem;font-weight:500;padding:0.2rem 0.5rem;border-radius:4px;background:var(--green-light);color:var(--green)">GET</span><span style="font-family:var(--font-mono);font-size:0.82rem">/openapi.json</span><span style="margin-left:auto;font-family:var(--font-mono);font-size:0.68rem;color:var(--ink-muted);background:var(--cream);padding:0.15rem 0.5rem;border-radius:4px">no auth</span></div><div style="padding:1rem 1.25rem;font-size:0.82rem;color:var(--ink-muted)">Full OpenAPI 3.1 spec. Function-calling agents use this automatically.</div></div>
  </div>
</section>
<div class="divider"></div>
<section id="pricing">
  <p class="section-label">Pricing</p>
  <h2>Pay only for <em>what you use.</em></h2>
  <p class="section-sub">No subscriptions. No minimums. USDC on Base settles instantly via x402. The /probe endpoint is always free.</p>
  <div class="pricing-wrap">
    <div class="price-card featured">
      <div class="price-label">Static scraping</div>
      <div class="price-amount">$0.005</div>
      <div class="price-unit">per URL · Cheerio + Readability</div>
      <ul class="price-features"><li>No API keys or accounts</li><li>Pay per request via x402</li><li>USDC on Base mainnet</li><li>Article mode — strips ads &amp; nav</li><li>Full mode — entire page</li><li>Free /probe endpoint</li></ul>
    </div>
    <div>
      <div class="price-card" style="margin-bottom:1.5rem">
        <div class="price-label">JS rendering</div>
        <div class="price-amount">$0.015</div>
        <div class="price-unit">per URL · Playwright + Chromium</div>
        <ul class="price-features"><li>Handles SPAs and dynamic pages</li><li>Bot-detection bypass</li><li>Same x402 payment flow</li><li>~2–4s response time</li></ul>
      </div>
      <div class="x402-callout"><strong>How x402 works:</strong> The HTTP 402 status code requests micropayment. Your agent receives payment requirements, settles USDC on Base, and retries automatically.<br><br><a href="https://x402.org" style="color:var(--green);font-weight:500">Learn about x402 →</a></div>
    </div>
  </div>
</section>
<div class="divider"></div>
<section>
  <p class="section-label">Why zlurp</p>
  <h2>Unlike every other <em>scraping tool.</em></h2>
  <p class="section-sub">Firecrawl, Diffbot, and ScrapingBee all require accounts, API keys, or billing setup — none of which an AI agent can do autonomously.</p>
  <table class="compare-table">
    <thead><tr><th>Feature</th><th class="hl">zlurp</th><th>Firecrawl</th><th>Diffbot</th><th>ScrapingBee</th></tr></thead>
    <tbody>
      <tr><td>No account required</td><td class="chk thl">✓</td><td class="crs">✗</td><td class="crs">✗</td><td class="crs">✗</td></tr>
      <tr><td>No API key needed</td><td class="chk thl">✓</td><td class="crs">✗</td><td class="crs">✗</td><td class="crs">✗</td></tr>
      <tr><td>x402 micropayments</td><td class="chk thl">✓</td><td class="crs">✗</td><td class="crs">✗</td><td class="crs">✗</td></tr>
      <tr><td>Agent can start at 3am</td><td class="chk thl">✓</td><td class="crs">✗</td><td class="crs">✗</td><td class="crs">✗</td></tr>
      <tr><td>Markdown output</td><td class="chk thl">✓</td><td class="chk">✓</td><td class="crs">✗</td><td class="crs">✗</td></tr>
      <tr><td>JS rendering</td><td class="chk thl">✓</td><td class="chk">✓</td><td class="chk">✓</td><td class="chk">✓</td></tr>
      <tr><td>OpenAPI spec</td><td class="chk thl">✓</td><td class="chk">✓</td><td class="chk">✓</td><td class="crs">✗</td></tr>
      <tr><td>llms.txt</td><td class="chk thl">✓</td><td class="crs">✗</td><td class="crs">✗</td><td class="crs">✗</td></tr>
    </tbody>
  </table>
</section>
<div class="divider"></div>
<footer>
  <a href="#" class="footer-logo">
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <ellipse cx="16" cy="18" rx="11" ry="9" fill="#2d9e60"/>
      <ellipse cx="8" cy="10" rx="4.5" ry="4.5" fill="#2d9e60"/>
      <ellipse cx="24" cy="10" rx="4.5" ry="4.5" fill="#2d9e60"/>
      <ellipse cx="8" cy="10" rx="2.5" ry="2.5" fill="#1a6b3c"/>
      <ellipse cx="24" cy="10" rx="2.5" ry="2.5" fill="#1a6b3c"/>
      <path d="M11 21 Q16 24 21 21" stroke="#1a6b3c" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    </svg>
    zlurp.ai
  </a>
  <ul class="footer-links">
    <li><a href="/openapi.json">API Docs</a></li>
    <li><a href="/docs/llms.txt">llms.txt</a></li>
    <li><a href="#pricing">Pricing</a></li>
    <li><a href="/compare">Compare</a></li>
    <li><a href="/about">About</a></li>
    <li><a href="/privacy">Privacy</a></li>
    <li><a href="https://x402.org">x402</a></li>
    <li><a href="/contact">Contact</a></li>
  </ul>
  <a href="https://ora.run/score/zlurp.ai" class="orank-badge">orank · agent-ready</a>
</footer>
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
  return c.body(JSON.stringify({
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
  }))
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

MCP-Server: https://zlurp.ai/mcp
MCP-Transport: streamable-http

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

// ── Streaming scrape endpoint ─────────────────────────────────────
app.post('/scrape/stream', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any
  const url = body.url as string

  if (!url) {
    return c.json({ error: 'MISSING_URL', message: 'url is required', retryable: false }, 400)
  }

  // Stream SSE progress then proxy to /scrape
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send('status', { status: 'scraping', url })

        const scrapeRes = await fetch('https://zlurp.ai/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(c.req.raw.headers.entries()),
          },
          body: JSON.stringify(body),
        })

        const data = await scrapeRes.json() as any

        if (!scrapeRes.ok) {
          send('error', data)
        } else {
          send('result', data)
          send('done', { status: 'complete', wordCount: data.wordCount })
        }
      } catch (err: any) {
        send('error', { error: 'STREAM_FAILED', message: err.message })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    }
  })
})

// ── MCP Server ────────────────────────────────────────────────────
app.all('/mcp', async (c) => {
  // Add required Accept header if missing for compatibility with agents that don't send it
  const accept = c.req.header('Accept') || ''
  if (!accept.includes('text/event-stream')) {
    const newReq = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: new Headers({
        ...Object.fromEntries(c.req.raw.headers.entries()),
        'Accept': 'application/json, text/event-stream',
      }),
      body: c.req.raw.body,
    })
    const newContext = { ...c, req: { ...c.req, raw: newReq } }
    return handleMcp({ ...c, req: { ...c.req, raw: newReq } } as any)
  }
  return handleMcp(c)
})

app.all('/.well-known/mcp', async (c) => {
  if (c.req.method === 'POST') {
    const accept = c.req.header('Accept') || ''
    if (!accept.includes('text/event-stream')) {
      const newReq = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: new Headers({
          ...Object.fromEntries(c.req.raw.headers.entries()),
          'Accept': 'application/json, text/event-stream',
        }),
        body: c.req.raw.body,
      })
      return handleMcp({ ...c, req: { ...c.req, raw: newReq } } as any)
    }
    return handleMcp(c)
  }
  return c.json({
    mcp_version: '2025-06-18',
    name: 'zlurp',
    description: 'Web scraping for AI agents. Convert any URL to clean markdown via x402 micropayments on Base.',
    endpoint: 'https://zlurp.ai/mcp',
    transport: 'http',
    capabilities: ['tools'],
    categories: ['data', 'web-scraping', 'ai-agents'],
    contact: 'hello@zlurp.ai',
    docs: 'https://zlurp.ai/docs/llms.txt',
    server_card: 'https://zlurp.ai/.well-known/mcp/server-card.json',
    payment_required: true,
    auth: { required: false },
    last_updated: '2026-05-13T00:00:00Z',
    crawl: true,
  })
})

app.get('/.well-known/mcp/server-card.json', (c) => {
  return c.json({
    name: 'zlurp',
    description: 'Web scraping API for AI agents. Convert any URL to clean markdown via x402 micropayments on Base.',
    version: '1.0.0',
    serverUrl: 'https://zlurp.ai/mcp',
    transport: 'streamable-http',
    tools: [
      {
        name: 'probe_url',
        description: 'Get cost estimate for scraping a URL. Always free.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to get a cost estimate for' },
            js: { type: 'boolean', description: 'Whether JS rendering is needed' },
          },
          required: ['url'],
        },
      },
      {
        name: 'scrape_url',
        description: 'Scrape any public URL and return clean markdown. Costs $0.005 USDC via x402 on Base.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to scrape' },
            mode: { type: 'string', enum: ['article', 'full'], description: 'article strips nav/ads, full returns entire page' },
            js: { type: 'boolean', description: 'Enable JS rendering for SPAs' },
          },
          required: ['url'],
        },
      },
    ],
    pricing: {
      probe_url: 'free',
      scrape_url: '$0.005 USDC per URL (static), $0.015 USDC (JS rendering)',
    },
    payment: {
      protocol: 'x402',
      network: 'base',
      asset: 'USDC',
    },
  })
})


app.notFound((c) => {
  return c.json({
    error: 'NOT_FOUND',
    message: `Route ${c.req.method} ${c.req.path} not found`,
    status: 404,
  }, 404)
})

app.onError((err, c) => {
  console.error('Error:', err.message)
  return c.json({
    error: 'INTERNAL_ERROR',
    message: err.message || 'An unexpected error occurred',
    status: 500,
  }, 500)
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

app.get('/compare', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>zlurp vs Firecrawl vs Diffbot vs ScrapingBee</title>
  <meta name="description" content="Compare zlurp vs Firecrawl, Diffbot, and ScrapingBee for AI agent web scraping. zlurp uses x402 micropayments — no accounts, no API keys required.">
  <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:4rem auto;padding:0 2rem;line-height:1.7;color:#1a1a18;background:#f7f4ee}h1,h2{font-family:Georgia,serif;font-weight:400}table{width:100%;border-collapse:collapse;margin:2rem 0}th,td{padding:0.75rem 1rem;text-align:left;border-bottom:1px solid #ede9e0}th{background:#e8f5ee;color:#1a6b3c}a{color:#1a6b3c}.check{color:#1a6b3c}.cross{color:#ccc}</style>
</head>
<body>
  <h1>zlurp vs Competitors</h1>
  <p>How zlurp compares to Firecrawl, Diffbot, and ScrapingBee for AI agent web scraping.</p>

  <table>
    <thead>
      <tr><th>Feature</th><th>zlurp</th><th>Firecrawl</th><th>Diffbot</th><th>ScrapingBee</th></tr>
    </thead>
    <tbody>
      <tr><td>No account required</td><td class="check">✓</td><td class="cross">✗</td><td class="cross">✗</td><td class="cross">✗</td></tr>
      <tr><td>No API key needed</td><td class="check">✓</td><td class="cross">✗</td><td class="cross">✗</td><td class="cross">✗</td></tr>
      <tr><td>x402 micropayments</td><td class="check">✓</td><td class="cross">✗</td><td class="cross">✗</td><td class="cross">✗</td></tr>
      <tr><td>Agent can start at 3am</td><td class="check">✓</td><td class="cross">✗</td><td class="cross">✗</td><td class="cross">✗</td></tr>
      <tr><td>Pay per request (no minimum)</td><td class="check">✓</td><td class="cross">✗</td><td class="cross">✗</td><td class="cross">✗</td></tr>
      <tr><td>Markdown output</td><td class="check">✓</td><td class="check">✓</td><td class="cross">✗</td><td class="cross">✗</td></tr>
      <tr><td>Article extraction mode</td><td class="check">✓</td><td class="check">✓</td><td class="check">✓</td><td class="cross">✗</td></tr>
      <tr><td>JS rendering</td><td class="check">✓</td><td class="check">✓</td><td class="check">✓</td><td class="check">✓</td></tr>
      <tr><td>robots.txt compliant</td><td class="check">✓</td><td class="cross">✗</td><td class="cross">✗</td><td class="cross">✗</td></tr>
      <tr><td>OpenAPI spec</td><td class="check">✓</td><td class="check">✓</td><td class="check">✓</td><td class="cross">✗</td></tr>
      <tr><td>llms.txt</td><td class="check">✓</td><td class="cross">✗</td><td class="cross">✗</td><td class="cross">✗</td></tr>
      <tr><td>Price per URL</td><td>$0.005</td><td>~$0.003–0.01</td><td>~$0.01–0.05</td><td>~$0.002–0.01</td></tr>
    </tbody>
  </table>

  <h2>The key difference</h2>
  <p>Every other scraping tool requires a human to create an account, enter a credit card, and generate an API key. An AI agent can't do any of that autonomously. zlurp uses x402 — any agent with a funded Base wallet can call it immediately at 3am without any human intervention.</p>
  <p><a href="/">← Back to zlurp</a></p>
</body>
</html>`)
})

app.get('/api/llms.txt', (c) => {
  try {
    const txt = readFileSync(new URL('../public/docs/llms.txt', import.meta.url), 'utf-8')
    c.header('Content-Type', 'text/plain; charset=utf-8')
    return c.body(txt)
  } catch {
    return c.text('Not found', 404)
  }
})

app.get('/contact', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact — zlurp</title>
  <meta name="description" content="Contact zlurp — web scraping API for AI agents.">
  <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 2rem;line-height:1.7;color:#1a1a18;background:#f7f4ee}h1{font-family:Georgia,serif;font-weight:400;margin-bottom:1rem}a{color:#1a6b3c}</style>
</head>
<body>
  <h1>Contact zlurp</h1>
  <p>zlurp is a web scraping API built for AI agents. We're happy to help with integration questions, bug reports, or general feedback.</p>
  <h2>Email</h2>
  <p>The best way to reach us is by email: <a href="mailto:hello@zlurp.ai">hello@zlurp.ai</a></p>
  <p>We typically respond within 24 hours on business days.</p>
  <h2>GitHub</h2>
  <p>For bug reports or feature requests, open an issue on GitHub: <a href="https://github.com/zlurp/zlurp">github.com/zlurp/zlurp</a></p>
  <h2>Support</h2>
  <p>For API integration help, please include:</p>
  <ul style="margin:0.5rem 0 1rem 1.5rem">
    <li>The URL you were trying to scrape</li>
    <li>The error response you received</li>
    <li>Your x402 client version</li>
  </ul>
  <h2>MCP Server</h2>
  <p>The zlurp MCP server is listed on Smithery: <a href="https://smithery.ai/servers/zlurp/zlurp">smithery.ai/servers/zlurp/zlurp</a>. For MCP-specific issues, open a GitHub issue.</p>
  <p style="margin-top:2rem"><a href="/">← Home</a></p>
</body>
</html>`)
})

app.get('/.well-known/agent.json', (c) => {
  return c.json({
    name: 'zlurp',
    description: 'Web scraping API for AI agents. Convert any URL to clean markdown via x402 micropayments on Base.',
    url: 'https://zlurp.ai',
    version: '1.0.0',
    capabilities: ['web-scraping', 'markdown-conversion', 'x402-payments'],
    endpoints: [
      { path: '/probe', method: 'GET', auth: false, description: 'Cost estimate' },
      { path: '/scrape', method: 'POST', auth: 'x402', description: 'Scrape URL to markdown' },
    ],
    payment: { protocol: 'x402', network: 'base', asset: 'USDC' },
    mcp: 'https://zlurp.ai/mcp',
    openapi: 'https://zlurp.ai/openapi.json',
    contact: 'hello@zlurp.ai',
  })
})

app.get('/discovery/resources', (c) => {
  return c.json({
    resources: [
      {
        url: 'https://zlurp.ai/scrape',
        method: 'POST',
        description: 'Scrape any public URL to clean markdown',
        payment: {
          protocol: 'x402',
          version: 2,
          network: 'eip155:8453',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          amount: '5000',
          currency: 'USDC',
        },
        schema: {
          input: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'The public URL to scrape' },
              mode: { type: 'string', enum: ['article', 'full'], default: 'article' },
              js: { type: 'boolean', default: false },
            },
            required: ['url'],
          },
        },
      },
    ],
  })
})

app.get('/status', (c) => {
  return c.json({
    status: 'operational',
    service: 'zlurp',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})
