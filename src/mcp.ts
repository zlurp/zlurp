import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Context } from 'hono'

function createMcpServer() {
  const server = new McpServer({
    name: 'zlurp',
    version: '1.0.0',
    description: 'Web scraping for AI agents. Convert any URL to clean markdown via x402 micropayments on Base. No accounts or API keys required.',
  })

  server.tool(
    'probe_url',
    'Get the cost estimate for scraping a URL. Always free — call this before scrape_url to check the price.',
    {
      url: z.string().url().describe('The public URL to get a cost estimate for'),
      js: z.boolean().optional().default(false).describe('Whether JS rendering is needed (costs 3x more)'),
    },
    async ({ url, js }) => {
      const params = new URLSearchParams({ url })
      if (js) params.set('js', 'true')
      const res = await fetch(`https://zlurp.ai/probe?${params}`)
      const data = await res.json() as any
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      }
    }
  )

  server.tool(
    'scrape_url',
    'Scrape any public URL and return clean markdown. Costs $0.005 USDC per scrape via x402 on Base. Requires an x402-compatible client with a funded Base wallet.',
    {
      url: z.string().url().describe('The public URL to scrape'),
      mode: z.enum(['article', 'full']).optional().default('article').describe('article strips nav/ads, full returns entire page'),
      js: z.boolean().optional().default(false).describe('Enable JS rendering for SPAs ($0.015 instead of $0.005)'),
    },
    async ({ url, mode, js }) => {
      const res = await fetch('https://zlurp.ai/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode, js }),
      })

      if (res.status === 402) {
        return {
          content: [{ type: 'text', text: 'Payment required. Configure an x402 client with a funded Base wallet to use this tool. See https://zlurp.ai/docs/llms.txt for setup.' }],
          isError: true,
        }
      }

      if (!res.ok) {
        const err = await res.json() as any
        return {
          content: [{ type: 'text', text: `Error: ${err.error || res.statusText}` }],
          isError: true,
        }
      }

      const data = await res.json() as any
      return {
        content: [{
          type: 'text',
          text: `# ${data.title || 'Scraped Content'}\n\nURL: ${url}\nWords: ${data.wordCount}\nCached: ${data.cachedResult}\n\n---\n\n${data.markdown}`,
        }],
      }
    }
  )

  return server
}

// Use WebStandardStreamableHTTPServerTransport for native Fetch API support
export async function handleMcp(c: Context): Promise<Response> {
  // @ts-ignore
  const { WebStandardStreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js')
  
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)

  return transport.handleRequest(c.req.raw)
}
