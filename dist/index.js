import { readFileSync } from "fs";
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { paymentMiddleware } from 'x402-hono';
import { isAllowed } from './robots.js';
import { getCache, setCache } from './cache.js';
const app = new Hono();
const PRICE_STATIC = 0.005;
const PRICE_JS = 0.015;
const RECEIVING_ADDRESS = process.env.RECEIVING_ADDRESS;
const NETWORK = (process.env.NETWORK || 'base-sepolia');
const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
});
app.get('/', (c) => {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>zlurp — Web Scraping API for AI Agents</title>
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
      <a href="/docs/llms.txt">llms.txt</a>
      <a href="/health">Health</a>
      <a href="https://x402.org">x402 Protocol</a>
    </div>
  </div>
</body>
</html>`);
});
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        service: 'zlurp',
        version: '0.1.0',
        network: NETWORK,
    });
});
app.get('/openapi.json', (c) => {
    try {
        const spec = readFileSync(new URL('../public/openapi.json', import.meta.url), 'utf-8');
        c.header('Content-Type', 'application/json');
        return c.body(spec);
    }
    catch {
        return c.json({ error: 'Not found' }, 404);
    }
});
app.get('/docs/llms.txt', (c) => {
    try {
        const txt = readFileSync(new URL('../public/docs/llms.txt', import.meta.url), 'utf-8');
        c.header('Content-Type', 'text/plain; charset=utf-8');
        return c.body(txt);
    }
    catch {
        return c.text('Not found', 404);
    }
});
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
    });
});
app.get('/.well-known/api-catalog', (c) => {
    return c.json({
        apis: [{ title: 'zlurp API', openapi: 'https://zlurp.ai/openapi.json' }],
    });
});
app.get('/probe', (c) => {
    const url = c.req.query('url');
    const mode = c.req.query('mode') || 'article';
    const js = c.req.query('js') === 'true';
    if (!url) {
        return c.json({ error: 'MISSING_URL', message: 'url query parameter is required' }, 400);
    }
    try {
        new URL(url);
    }
    catch {
        return c.json({ error: 'INVALID_URL', message: 'url must be a valid http/https URL' }, 400);
    }
    const costUSDC = js ? PRICE_JS : PRICE_STATIC;
    return c.json({
        url,
        mode,
        js,
        costUSDC: costUSDC.toFixed(6),
        pricePerRequest: `${costUSDC} USDC`,
        network: NETWORK,
    });
});
app.use('/scrape', paymentMiddleware(RECEIVING_ADDRESS, {
    'POST /scrape': {
        price: `$${PRICE_STATIC}`,
        network: NETWORK,
    },
}, {
    url: 'https://x402.org/facilitator',
}));
app.post('/scrape', async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: 'INVALID_BODY', message: 'Request body must be valid JSON' }, 400);
    }
    const { url, mode = 'article' } = body;
    if (!url) {
        return c.json({ error: 'MISSING_URL', message: 'url is required' }, 400);
    }
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('invalid protocol');
        }
    }
    catch {
        return c.json({ error: 'INVALID_URL', message: 'url must be a valid http/https URL' }, 400);
    }
    const allowed = await isAllowed(url);
    if (!allowed) {
        return c.json({
            error: 'BLOCKED',
            message: 'This URL is disallowed by robots.txt. zlurp respects robots.txt by default.',
            url,
        }, 403);
    }
    const cached = await getCache(url, mode);
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
        });
    }
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(12000),
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        if (!res.ok) {
            return c.json({ error: 'FETCH_FAILED', message: `Page returned HTTP ${res.status}` }, 422);
        }
        const html = await res.text();
        let markdown = '';
        let title = '';
        if (mode === 'article') {
            const dom = new JSDOM(html, { url });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            if (article && article.content) {
                markdown = td.turndown(article.content);
                title = article.title || '';
            }
            else {
                const $ = cheerio.load(html);
                $('script, style, noscript').remove();
                markdown = td.turndown($('body').html() || '');
                title = $('title').text().trim();
            }
        }
        else {
            const $ = cheerio.load(html);
            $('script, style, noscript').remove();
            markdown = td.turndown($('body').html() || '');
            title = $('title').text().trim();
        }
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
        if (!markdown || markdown.length < 20) {
            return c.json({ error: 'RENDER_FAILED', message: 'Page returned no extractable content' }, 422);
        }
        const scrapedAt = new Date().toISOString();
        await setCache(url, mode, {
            markdown,
            title,
            wordCount: markdown.trim().split(/\s+/).length,
            charCount: markdown.length,
            scrapedAt,
        });
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
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.includes('timeout')) {
            return c.json({ error: 'TIMEOUT', message: 'Request timed out' }, 422);
        }
        return c.json({ error: 'SCRAPE_FAILED', message: msg }, 422);
    }
});
const port = parseInt(process.env.PORT || '3000');
serve({ fetch: app.fetch, port }, () => {
    console.log(`🐸 zlurp running on port ${port}`);
    console.log(`   network:  ${NETWORK}`);
    console.log(`   payTo:    ${RECEIVING_ADDRESS}`);
    console.log(`   cache:    ${process.env.REDIS_URL ? 'Redis enabled' : 'disabled (no REDIS_URL)'}`);
});
export default app;
