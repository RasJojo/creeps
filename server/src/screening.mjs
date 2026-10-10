import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalBtc, testnetTwin } from './btc.mjs'

// Screening des adresses sur la liste de sanctions publique du Trésor américain (OFAC, fichier SDN).
// Règle de prudence: si la liste est absente ou trop ancienne, on REFUSE (fermé), on ne laisse pas passer.

const LINE = /Digital Currency Address - ([A-Z0-9]+) ([A-Za-z0-9]+)/g
const EVM = /^0x[a-fA-F0-9]{40}$/

/** Extrait les adresses crypto du fichier SDN.CSV. Les adresses Bitcoin reçoivent aussi leur jumeau testnet. */
export function parseOfac(csv) {
  const sets = { BTC: new Set(), EVM: new Set(), SOL: new Set() }
  for (const [, code, address] of csv.matchAll(LINE)) {
    if (code === 'XBT') {
      sets.BTC.add(canonicalBtc(address))
      const twin = testnetTwin(address)
      if (twin) sets.BTC.add(canonicalBtc(twin))
    } else if (code === 'SOL') {
      sets.SOL.add(address)
    } else if (EVM.test(address)) {
      sets.EVM.add(address.toLowerCase()) // ETH, USDT, USDC... partagent le format d'adresse EVM
    }
  }
  return sets
}

const key = (chain, address) => (chain === 'EVM' ? address.toLowerCase() : chain === 'BTC' ? canonicalBtc(address) : address)

export function createScreening({ dir, url, refreshMs, maxAgeMs, fetchImpl = fetch, now = Date.now, log = () => {} }) {
  const cacheFile = join(dir, 'ofac.json')
  const blocklistFile = join(dir, 'blocklist.json') // liste interne de la banque, modifiable à la main
  let state = null

  function load() {
    if (!existsSync(cacheFile)) return
    const j = JSON.parse(readFileSync(cacheFile, 'utf8'))
    state = { fetchedAt: j.fetchedAt, BTC: new Set(j.BTC), EVM: new Set(j.EVM), SOL: new Set(j.SOL) }
  }

  async function refresh() {
    const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(90_000) })
    if (!res.ok) throw new Error(`OFAC download failed (${res.status})`)
    const sets = parseOfac(await res.text())
    const total = sets.BTC.size + sets.EVM.size + sets.SOL.size
    if (total < 10) throw new Error('OFAC list looks empty: refusing to replace the cache')
    mkdirSync(dir, { recursive: true })
    writeFileSync(cacheFile, JSON.stringify({ fetchedAt: now(), BTC: [...sets.BTC], EVM: [...sets.EVM], SOL: [...sets.SOL] }))
    state = { fetchedAt: now(), ...sets }
    log(`OFAC list loaded: ${sets.BTC.size} BTC, ${sets.EVM.size} EVM, ${sets.SOL.size} SOL addresses`)
  }

  async function ensureFresh() {
    load()
    if (state && now() - state.fetchedAt < refreshMs) return
    try {
      await refresh()
    } catch (e) {
      log(`OFAC refresh failed: ${e.message}${state ? ' (keeping the cached list)' : ' (no list available)'}`)
    }
  }

  function internalBlock(chain, address) {
    if (!existsSync(blocklistFile)) return false
    const list = JSON.parse(readFileSync(blocklistFile, 'utf8'))[chain] ?? []
    return list.some((a) => key(chain, a) === key(chain, address))
  }

  function check(chain, address) {
    if (internalBlock(chain, address)) return { blocked: true, reason: 'Address is on the bank internal blocklist' }
    if (!state) return { blocked: true, reason: 'Sanctions screening is unavailable, so the transfer is refused' }
    const ageMs = now() - state.fetchedAt
    if (ageMs > maxAgeMs) return { blocked: true, reason: 'Sanctions list is outdated, so the transfer is refused' }
    if (state[chain]?.has(key(chain, address))) return { blocked: true, reason: 'Address is on the OFAC sanctions list (US Treasury)' }
    return { blocked: false, listAgeHours: Math.round(ageMs / 3_600_000) }
  }

  return { ensureFresh, refresh, check, load, size: () => (state ? state.BTC.size + state.EVM.size + state.SOL.size : 0) }
}
