import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

// Pricing config
const PRICE_STATIC = 0.005  // $0.005 per URL (no JS)
const PRICE_JS = 0.015      // $0.015 per URL (JS rendering)

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'zlurp',
    version: '0.1.0',
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
    network: process.env.NETWORK || 'base',
  })
})

const port = parseInt(process.env.PORT || '3000')

serve({ fetch: app.fetch, port }, () => {
  console.log(`🐸 zlurp running on port ${port}`)
})

export default app
