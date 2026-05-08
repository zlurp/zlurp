import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'zlurp',
    version: '0.1.0',
  })
})

const port = parseInt(process.env.PORT || '3000')

serve({ fetch: app.fetch, port }, () => {
  console.log(`🐸 zlurp running on port ${port}`)
})

export default app
