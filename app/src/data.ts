import { useEffect, useRef, useState } from 'react'

export type Asset = { sym: string; name: string; chain: string; price: number; color: string; vol: number }

// Prices are demo values in CHF. They drift every 1.5 s to make the dashboard feel live.
export const ASSETS: Asset[] = [
  { sym: 'BTC', name: 'Bitcoin', chain: 'Bitcoin', price: 61200, color: '#C9811F', vol: 0.0012 },
  { sym: 'ETH', name: 'Ether', chain: 'Ethereum', price: 2890, color: '#4B63B8', vol: 0.0016 },
  { sym: 'SOL', name: 'Solana', chain: 'Solana', price: 147, color: '#2E8F6B', vol: 0.0022 },
  { sym: 'USDC', name: 'USD Coin', chain: 'Ethereum', price: 0.89, color: '#7A8A94', vol: 0.00002 },
]

export const START_QTY: Record<string, number> = { BTC: 42.18, ETH: 880.5, SOL: 12400, USDC: 3250000 }

export type Row = {
  id: string
  ts: number
  kind: 'Deposit' | 'Withdrawal' | 'Swap' | 'Fee' | 'Transfer'
  sym: string
  qty: number
  note: string
  status: 'Settled' | 'Pending' | 'In review'
  hash: string
}

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomHex(len: number) {
  const bytes = new Uint8Array(Math.ceil(len / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, len)
}

const NOTES = [
  'Treasury rebalance',
  'OTC desk, Zürich',
  'Staking rewards',
  'Custody top-up',
  'Counterparty settlement',
  'Quarterly distribution',
  'Collateral return',
]

export function seedRows(): Row[] {
  const r = rng(7)
  const kinds = ['Deposit', 'Withdrawal', 'Swap', 'Fee', 'Transfer'] as const
  const now = Date.now()
  const out: Row[] = []
  for (let i = 0; i < 36; i++) {
    const kind = kinds[Math.floor(r() * kinds.length)]
    const a = ASSETS[Math.floor(r() * ASSETS.length)]
    const base =
      a.sym === 'USDC' ? 20000 + r() * 400000 : a.sym === 'SOL' ? 50 + r() * 900 : a.sym === 'ETH' ? 1 + r() * 40 : 0.05 + r() * 2
    const sign = kind === 'Deposit' ? 1 : kind === 'Swap' ? (r() > 0.5 ? 1 : -1) : -1
    const qty = kind === 'Fee' ? -(base * 0.001) : sign * base
    let h = '0x'
    for (let k = 0; k < 64; k++) h += Math.floor(r() * 16).toString(16)
    out.push({
      id: `TX-${4821 - i}`,
      ts: now - i * 3600000 * (3 + r() * 9),
      kind,
      sym: a.sym,
      qty,
      note: kind === 'Fee' ? 'Network fee' : NOTES[Math.floor(r() * NOTES.length)],
      status: i < 2 ? 'Pending' : i === 5 ? 'In review' : 'Settled',
      hash: h,
    })
  }
  return out
}

const chfF = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const chf = (n: number) => chfF.format(n)
export const qtyFmt = (n: number, sym: string) =>
  n.toLocaleString('de-CH', { maximumFractionDigits: sym === 'USDC' ? 0 : sym === 'BTC' ? 4 : 2 })
export const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)
export const when = (ts: number) =>
  new Date(ts).toLocaleString('de-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function useLive(qty: Record<string, number>) {
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(ASSETS.map((a) => [a.sym, a.price])),
  )
  const total = ASSETS.reduce((s, a) => s + qty[a.sym] * prices[a.sym], 0)

  const [hist, setHist] = useState<number[]>(() => {
    const t0 = ASSETS.reduce((s, a) => s + START_QTY[a.sym] * a.price, 0)
    const r = rng(3)
    let v = t0
    const arr = Array.from({ length: 60 }, () => {
      v *= 1 + (r() - 0.46) * 0.004
      return v
    })
    const k = t0 / arr[arr.length - 1]
    return arr.map((x) => x * k)
  })

  useEffect(() => {
    const id = setInterval(() => {
      setPrices((p) => {
        const n = { ...p }
        for (const a of ASSETS) n[a.sym] = Math.max(0.0001, p[a.sym] * (1 + (Math.random() - 0.5) * 2 * a.vol))
        return n
      })
    }, 1500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setHist((h) => [...h.slice(-59), total])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices])

  return { prices, total, hist }
}


/* ------------------------------------------------------------------ */
/* Networks, addresses, sharing                                        */
/* ------------------------------------------------------------------ */

export const NETWORKS = ['Ethereum', 'Solana', 'Bitcoin'] as const
export type Network = (typeof NETWORKS)[number]

// Demo receive addresses for this account, one per network.
export const MY_ADDRESS: Record<Network, string> = {
  Ethereum: '0x7C3a91E4b05D2f68A19c4E7d0B3F58a62c91D4e0',
  Solana: '7xKqP2mV9dLr4TnY8cWb3HfJz5Ue6NaQs1GoXvRt9mPd',
  Bitcoin: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
}

export const NET_ASSETS: Record<Network, string[]> = { Ethereum: ['ETH', 'USDC'], Solana: ['SOL'], Bitcoin: ['BTC'] }
export const FEES_CHF: Record<string, number> = { Ethereum: 4.2, Solana: 0.02, Bitcoin: 3.1 }

export const SAVED = [
  { label: 'Lombard Custody AG', network: 'Ethereum', address: '0x4F2b8cA10d93E7b56a28C1f04D9e3A7b61c05F28' },
  { label: 'OTC desk, Zürich', network: 'Ethereum', address: '0x91Ad03c7E25bF48d6A10e93C7b2D58f4a0E61c37' },
  { label: 'Validator wallet', network: 'Solana', address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' },
  { label: 'Cold storage', network: 'Bitcoin', address: 'bc1q9h5yjfnn3z2f0eyj7wuv6hhd2lqnfd8x2e0v4k' },
]

export function validateAddress(network: string, a: string) {
  const t = a.trim()
  if (network === 'Ethereum') return /^0x[a-fA-F0-9]{40}$/.test(t)
  if (network === 'Solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t)
  if (network === 'Bitcoin') return /^(bc1[a-z0-9]{25,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(t)
  return false
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export async function shareOrCopy(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed'
}

export function useFlash(v: number) {
  const prev = useRef(v)
  const [dir, setDir] = useState('')
  useEffect(() => {
    if (v > prev.current) setDir('up')
    else if (v < prev.current) setDir('down')
    prev.current = v
    const t = setTimeout(() => setDir(''), 700)
    return () => clearTimeout(t)
  }, [v])
  return dir
}

/* ------------------------------------------------------------------ */
/* Registration model                                                  */
/* ------------------------------------------------------------------ */

export type Person = { name: string; email: string; role: string }
export type Reg = {
  email: string
  legal: string
  type: string
  country: string
  reg: string
  lei: string
  people: Person[]
  docs: { title: string; file: string }[]
  policy: { limit: number; approvers: number; whitelistOnly: boolean; lockH: number }
  entityId: string
  status: 'Active' | 'In review'
}

export const DOCS = ['Certificate of incorporation', 'Proof of registered address', 'Ultimate beneficial owner declaration']
export const PHASES = ['Documents received', 'Screening', 'Compliance review', 'Account active']

export const DEMO_REG: Reg = {
  email: 'demo@creeps.ch',
  legal: 'Creeps Treasury AG',
  type: 'Company',
  country: 'Switzerland',
  reg: 'CHE-123.456.789',
  lei: '',
  people: [
    { name: 'Jonas Keller', email: 'jonas@creeps.ch', role: 'Authorised signatory' },
    { name: 'Priya Nair', email: 'priya@creeps.ch', role: 'Compliance officer' },
    { name: 'Luca Bernasconi', email: 'luca@creeps.ch', role: 'Viewer' },
  ],
  docs: [
    { title: DOCS[0], file: 'incorporation-certificate.pdf' },
    { title: DOCS[1], file: 'address-proof.pdf' },
    { title: DOCS[2], file: 'ubo-declaration.pdf' },
  ],
  policy: { limit: 500000, approvers: 2, whitelistOnly: true, lockH: 24 },
  entityId: 'CRP-482915',
  status: 'Active',
}

export function nameFromEmail(email: string) {
  const n = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : 'You'
}
