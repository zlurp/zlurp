import { wrapFetchWithPayment } from 'x402-fetch'
import { createWalletClient, http } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY

if (!PRIVATE_KEY) {
  console.error('Set WALLET_PRIVATE_KEY env var')
  process.exit(1)
}

const account = privateKeyToAccount(PRIVATE_KEY)
const wallet = createWalletClient({ account, chain: base, transport: http() })
const fetch402 = wrapFetchWithPayment(fetch, wallet)

console.log('🐸 Testing zlurp.ai payment...')
console.log('   wallet:', account.address)
console.log('   url:   https://example.com')
console.log('')

// Step 1 — probe cost
const probe = await fetch('https://zlurp.ai/probe?url=https://example.com')
const probeData = await probe.json()
console.log('📋 Probe result:', probeData.costUSDC, 'USDC')

// Step 2 — scrape with payment
console.log('💸 Paying and scraping...')
const res = await fetch402('https://zlurp.ai/scrape', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com' }),
})

if (!res.ok) {
  const err = await res.json()
  console.error('❌ Failed:', err)
  process.exit(1)
}

const data = await res.json()
console.log('')
console.log('✅ Success!')
console.log('   title:    ', data.title)
console.log('   wordCount:', data.wordCount)
console.log('   cached:   ', data.cachedResult)
console.log('')
console.log('📄 Markdown preview:')
console.log(data.markdown.slice(0, 200))
