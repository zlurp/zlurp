import robotsParser from 'robots-parser'

const cache = new Map<string, { allowed: boolean; ts: number }>()
const TTL = 10 * 60 * 1000 // 10 minutes

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function isAllowed(url: string): Promise<boolean> {
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return false
  }

  const cached = cache.get(origin)
  if (cached && Date.now() - cached.ts < TTL) {
    return cached.allowed
  }

  try {
    const robotsUrl = `${origin}/robots.txt`
    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': UA },
    })

    if (!res.ok) {
      cache.set(origin, { allowed: true, ts: Date.now() })
      return true
    }

    const text = await res.text()
    const robots = robotsParser(robotsUrl, text)
    const allowed = robots.isAllowed(url, '*') ?? true

    cache.set(origin, { allowed, ts: Date.now() })
    return allowed
  } catch {
    cache.set(origin, { allowed: true, ts: Date.now() })
    return true
  }
}
