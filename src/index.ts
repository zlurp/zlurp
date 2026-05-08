import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { JSDOM } from 'jsdom'
import { paymentMiddleware } from 'x402-hono'
import { isAllowed } from './robots.js'

const app = new Hono()

const PRICE_STATIC = 0.005
const PRICE_JS = 0.015
const RECEIVING_ADDRESS = process.env.RECEIVING_ADDRESS as `0x${string}`
const NETWORK = (process.env.NETWORK || 'base-sepolia') as 'base' | 'base-sepolia'

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'zlurp',
    version: '0.1.0',
    network: NETWORK,
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
    RECEIVING_ADDRESS,
    {
      'POST /scrape': {
        price: `$${PRICE_STATIC}`,
        network: NETWORK,
      },
    },
    {
      url: 'https://x402.org/facilitator',
    },
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

  // robots.txt check
  const allowed = await isAllowed(url)
  if (!allowed) {
    return c.json({
      error: 'BLOCKED',
      message: 'This URL is disallowed by robots.txt. zlurp respects robots.txt by default.',
      url,
    }, 403)
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
      scrapedAt: new Date().toISOString(),
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
  console.log(`   cache:    ${process.env.REDIS_URL ? "Redis enabled" : "disabled (no REDIS_URL)"}`)
})

export default app
