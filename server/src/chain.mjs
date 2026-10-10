import { isValidAddress } from './policy.mjs'

// Lecture des réseaux de TEST (solde + historique) pour le compte de l'application.
// Pourquoi côté banque: les explorateurs publics limitent le débit par adresse IP et changent de format sans prévenir.
// Le serveur met en cache, bascule d'un explorateur à l'autre et normalise; le navigateur n'a qu'un seul format à lire.
// Uniquement des données publiques de blockchain: aucune clé, aucune écriture.

const TIMEOUT_MS = 8_000
const BTC_APIS = ['https://blockstream.info/testnet/api', 'https://mempool.space/testnet/api']
const EVM_API = 'https://base-sepolia.blockscout.com/api/v2'
const EVM_RPC = 'https://sepolia.base.org'
const SOL_RPC = 'https://api.testnet.solana.com'
const SOL_TX_LIMIT = 10
const MAX_CACHED = 500

export class ChainError extends Error {
  constructor(message) {
    super(message)
    this.code = 'chain_unavailable'
  }
}

/* ------------------------------ normalisation ------------------------------ */
// Chaque transaction devient { hash, time (ms ou null), confirmed, ok, direction ('in'|'out'|'self'), amount, fee, counterparty }.
// `amount` est ce qui a réellement changé de mains (hors frais), dans l'unité de la chaîne; `fee` n'est donné que si c'est nous qui l'avons payé.

const SAT = 1e8

export function parseBtc(address, stats, txs) {
  const net = (s) => (s?.funded_txo_sum ?? 0) - (s?.spent_txo_sum ?? 0)
  const balance = (net(stats.chain_stats) + net(stats.mempool_stats)) / SAT
  return {
    balance,
    txs: txs.map((t) => {
      const received = t.vout.filter((o) => o.scriptpubkey_address === address).reduce((s, o) => s + o.value, 0)
      const sent = t.vin.filter((i) => i.prevout?.scriptpubkey_address === address).reduce((s, i) => s + i.prevout.value, 0)
      const outgoing = sent > 0
      const leftSat = outgoing ? sent - received - t.fee : received
      const other = outgoing
        ? t.vout.find((o) => o.scriptpubkey_address && o.scriptpubkey_address !== address)?.scriptpubkey_address
        : t.vin.find((i) => i.prevout?.scriptpubkey_address && i.prevout.scriptpubkey_address !== address)?.prevout.scriptpubkey_address
      return {
        hash: t.txid,
        time: t.status?.confirmed && t.status.block_time ? t.status.block_time * 1000 : null,
        confirmed: !!t.status?.confirmed,
        ok: true,
        direction: !outgoing ? 'in' : leftSat <= 0 ? 'self' : 'out',
        amount: Math.max(leftSat, 0) / SAT,
        fee: outgoing ? t.fee / SAT : null,
        counterparty: other ?? null,
      }
    }),
  }
}

const WEI = 1e18
const wei = (v) => Number(BigInt(v ?? '0')) / WEI

export function parseEvm(address, info, items) {
  const me = address.toLowerCase()
  return {
    balance: wei(info?.coin_balance),
    txs: items.map((t) => {
      const from = t.from?.hash?.toLowerCase()
      const to = t.to?.hash?.toLowerCase()
      const outgoing = from === me
      return {
        hash: t.hash,
        time: t.timestamp ? Date.parse(t.timestamp) : null,
        confirmed: t.status != null,
        ok: t.status !== 'error',
        direction: outgoing ? (to === me ? 'self' : 'out') : 'in',
        amount: wei(t.value),
        fee: outgoing ? wei(t.fee?.value) : null,
        counterparty: (outgoing ? to : from) ?? null,
      }
    }),
  }
}

const LAMPORTS = 1e9

/** `sigs`: résultat de getSignaturesForAddress; `txs`: résultats de getTransaction dans le même ordre (null si introuvable). */
export function parseSol(address, balanceLamports, sigs, txs) {
  const out = []
  sigs.forEach((s, i) => {
    const tx = txs[i]
    const keys = tx?.transaction?.message?.accountKeys?.map((k) => (typeof k === 'string' ? k : k.pubkey))
    const idx = keys?.indexOf(address) ?? -1
    const base = { hash: s.signature, time: s.blockTime ? s.blockTime * 1000 : null, confirmed: true, ok: !s.err }
    if (!tx || idx < 0) {
      out.push({ ...base, direction: 'in', amount: 0, fee: null, counterparty: null, unknown: true })
      return
    }
    const delta = tx.meta.postBalances[idx] - tx.meta.preBalances[idx]
    const payer = idx === 0
    const fee = tx.meta.fee
    const movedLamports = payer ? -delta - fee : -delta
    const outgoing = delta < 0
    // La contrepartie est le compte dont le solde a varié dans le sens opposé, le plus fortement.
    let other = null
    let best = 0
    keys.forEach((k, j) => {
      if (j === idx) return
      const d = tx.meta.postBalances[j] - tx.meta.preBalances[j]
      const score = outgoing ? d : -d
      if (score > best) {
        best = score
        other = k
      }
    })
    out.push({
      ...base,
      direction: outgoing ? (movedLamports <= 0 ? 'self' : 'out') : 'in',
      amount: (outgoing ? Math.max(movedLamports, 0) : delta) / LAMPORTS,
      fee: payer ? fee / LAMPORTS : null,
      counterparty: other,
    })
  })
  return { balance: balanceLamports / LAMPORTS, txs: out }
}

/* -------------------------------- réseau -------------------------------- */

async function getJson(fetchImpl, url, init) {
  let res
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    throw new ChainError(`${new URL(url).host} is unreachable`)
  }
  if (!res.ok) throw new ChainError(`${new URL(url).host} answered ${res.status}`)
  return res.json()
}

const rpc = (fetchImpl, url, body) =>
  getJson(fetchImpl, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** ~3 blocs de délai, transaction type (1 entrée, 2 sorties, ~150 vB), au moins 1 sat/vB. Une estimation, pas une promesse. */
export function btcFee(rates) {
  const rate = Math.max(Number(rates?.['3'] ?? rates?.['6'] ?? 1), 1)
  return Math.ceil(rate * 150) / SAT
}

async function readBtc(fetchImpl, address) {
  let last
  for (const base of BTC_APIS) {
    try {
      const [stats, txs, rates] = await Promise.all([
        getJson(fetchImpl, `${base}/address/${address}`),
        getJson(fetchImpl, `${base}/address/${address}/txs`),
        getJson(fetchImpl, `${base}/fee-estimates`).catch(() => null), // facultatif: l'estimation manque, le reste passe
      ])
      return { ...parseBtc(address, stats, txs), estimatedFee: btcFee(rates), source: new URL(base).host }
    } catch (e) {
      last = e
    }
  }
  throw last
}

async function readEvm(fetchImpl, address) {
  // Blockscout donne solde et historique; si son solde manque, le RPC public sert de secours.
  const [info, tx] = await Promise.all([
    getJson(fetchImpl, `${EVM_API}/addresses/${address}`).catch(() => null),
    getJson(fetchImpl, `${EVM_API}/addresses/${address}/transactions`),
  ])
  let balanceInfo = info
  if (!balanceInfo?.coin_balance) {
    const r = await rpc(fetchImpl, EVM_RPC, { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] })
    balanceInfo = { coin_balance: BigInt(r.result).toString() }
  }
  const gas = await rpc(fetchImpl, EVM_RPC, { jsonrpc: '2.0', id: 3, method: 'eth_gasPrice', params: [] }).catch(() => null)
  const estimatedFee = gas?.result ? (Number(BigInt(gas.result)) * 21_000 * 1.3) / WEI : null
  return { ...parseEvm(address, balanceInfo, tx.items ?? []), estimatedFee, source: new URL(EVM_API).host }
}

async function readSol(fetchImpl, address) {
  const [bal, sigs] = await Promise.all([
    rpc(fetchImpl, SOL_RPC, { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
    rpc(fetchImpl, SOL_RPC, { jsonrpc: '2.0', id: 2, method: 'getSignaturesForAddress', params: [address, { limit: SOL_TX_LIMIT }] }),
  ])
  const list = sigs.result ?? []
  let txs = []
  if (list.length > 0) {
    // Un seul aller-retour: requête groupée (batch JSON-RPC).
    const batch = await rpc(
      fetchImpl,
      SOL_RPC,
      list.map((s, i) => ({ jsonrpc: '2.0', id: i, method: 'getTransaction', params: [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }] })),
    )
    const byId = new Map((Array.isArray(batch) ? batch : []).map((r) => [r.id, r.result]))
    txs = list.map((_, i) => byId.get(i) ?? null)
  }
  return { ...parseSol(address, bal.result?.value ?? 0, list, txs), estimatedFee: 5_000 / LAMPORTS, source: new URL(SOL_RPC).host }
}

const READERS = { BTC: readBtc, EVM: readEvm, SOL: readSol }
const UNIT = { BTC: 'BTC', EVM: 'ETH', SOL: 'SOL' }

/**
 * Lecteur de chaînes avec cache court et regroupement des requêtes identiques.
 * Une adresse n'est relue chez l'explorateur qu'une fois par `ttlMs`, quel que soit le nombre de clients.
 */
export function createChainReader({ fetchImpl = fetch, now = Date.now, ttlMs = 20_000 } = {}) {
  const cache = new Map() // clé -> { at, value } | { promise }
  return {
    async read(chain, address) {
      if (!READERS[chain] || !isValidAddress(chain, address)) throw new ChainError('Unknown network or invalid address')
      const key = `${chain}:${address}`
      const hit = cache.get(key)
      if (hit?.promise) return hit.promise
      if (hit && now() - hit.at < ttlMs) return hit.value
      const promise = READERS[chain](fetchImpl, address).then(
        (data) => {
          const value = { chain, address, unit: UNIT[chain], fetchedAt: now(), ...data }
          if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value) // le plus ancien
          cache.set(key, { at: now(), value })
          return value
        },
        (e) => {
          cache.delete(key)
          throw e
        },
      )
      cache.set(key, { promise })
      return promise
    },
  }
}
