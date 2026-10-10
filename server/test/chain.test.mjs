import { test } from 'node:test'
import assert from 'node:assert/strict'
import { btcFee, parseBtc, parseEvm, parseSol } from '../src/chain.mjs'
import { CLEAN, Client, signedUp, startFixture } from './helpers.mjs'

/* ---------------------------- normalisation ---------------------------- */

const ME = 'tb1qme000000000000000000000000000000000000'
const OTHER = 'tb1qother0000000000000000000000000000000000'
const stats = (funded, spent, mFunded = 0, mSpent = 0) => ({
  chain_stats: { funded_txo_sum: funded, spent_txo_sum: spent },
  mempool_stats: { funded_txo_sum: mFunded, spent_txo_sum: mSpent },
})
const btcTx = (txid, vin, vout, fee, status = { confirmed: true, block_time: 1_700_000_000 }) => ({
  txid,
  fee,
  status,
  vin: vin.map(([address, value]) => ({ prevout: { scriptpubkey_address: address, value } })),
  vout: vout.map(([address, value]) => ({ scriptpubkey_address: address, value })),
})

test('BTC: reçu, envoyé avec monnaie rendue et frais, envoi à soi-même, en attente', () => {
  const r = parseBtc(
    ME,
    stats(300_000, 100_000, 5_000, 0),
    [
      btcTx('in', [[OTHER, 50_000]], [[ME, 40_000], [OTHER, 9_000]], 1_000),
      btcTx('out', [[ME, 100_000]], [[OTHER, 60_000], [ME, 39_000]], 1_000), // 100k sortis, 39k rendus, 1k de frais: 60k envoyés
      btcTx('self', [[ME, 10_000]], [[ME, 9_000]], 1_000),
      btcTx('pending', [[OTHER, 6_000]], [[ME, 5_000]], 1_000, { confirmed: false }),
    ],
  )
  assert.equal(r.balance, 0.002 + 0.00005) // 200k confirmés + 5k en mempool
  const [inn, out, self, pending] = r.txs
  assert.deepEqual([inn.direction, inn.amount, inn.fee, inn.counterparty], ['in', 0.0004, null, OTHER])
  assert.deepEqual([out.direction, out.amount, out.fee, out.counterparty], ['out', 0.0006, 0.00001, OTHER])
  assert.deepEqual([self.direction, self.amount], ['self', 0])
  assert.equal(pending.confirmed, false)
  assert.equal(pending.time, null)
})

const EVM_ME = '0x6DB8A8CDE4fF95d95570589D850136D2B0932b1D'
const EVM_OTHER = '0x252a8bd2319d8a555b872990601221b3a2053bce'
const evmTx = (hash, from, to, value, status = 'ok') => ({
  hash,
  from: { hash: from },
  to: { hash: to },
  value,
  status,
  timestamp: '2026-10-10T19:00:20.000000Z',
  fee: { value: '181896000092' },
})

test('EVM: reçu, envoyé (frais à notre charge), échec, adresse en casse mixte', () => {
  const r = parseEvm(EVM_ME, { coin_balance: '1500000000000000000' }, [
    evmTx('0xin', EVM_OTHER, EVM_ME.toLowerCase(), '2000000000000000000'),
    evmTx('0xout', EVM_ME, EVM_OTHER, '500000000000000000'),
    evmTx('0xfail', EVM_ME, EVM_OTHER, '0', 'error'),
    evmTx('0xself', EVM_ME, EVM_ME, '0'),
  ])
  assert.equal(r.balance, 1.5)
  const [inn, out, fail, self] = r.txs
  assert.deepEqual([inn.direction, inn.amount, inn.fee], ['in', 2, null])
  assert.deepEqual([out.direction, out.amount, out.counterparty], ['out', 0.5, EVM_OTHER])
  assert.ok(out.fee > 0)
  assert.equal(fail.ok, false)
  assert.equal(self.direction, 'self')
})

const SOL_ME = 'EWdbpPpotPtJrvBms5j4cVQouo7iR5DVvJjCVL99pAWX'
const SOL_OTHER = '42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi'
const solTx = (keys, pre, post, fee = 5000) => ({ transaction: { message: { accountKeys: keys } }, meta: { preBalances: pre, postBalances: post, fee } })

test('SOL: envoi (nous payons les frais), réception, frais seuls', () => {
  const sigs = [{ signature: 'sigOut', blockTime: 1_700_000_000 }, { signature: 'sigIn', blockTime: 1_700_000_100 }, { signature: 'sigFee', blockTime: 1_700_000_200 }]
  const txs = [
    solTx([SOL_ME, SOL_OTHER], [3_000_000_000, 0], [1_999_995_000, 1_000_000_000]), // -1 SOL -5000 de frais
    solTx([SOL_OTHER, SOL_ME], [5_000_000_000, 0], [3_999_995_000, 1_000_000_000]), // l'autre paie les frais, nous recevons 1 SOL
    solTx([SOL_ME], [1_000_000_000], [999_995_000]),
  ]
  const r = parseSol(SOL_ME, 2_500_000_000, sigs, txs)
  assert.equal(r.balance, 2.5)
  const [out, inn, fee] = r.txs
  assert.deepEqual([out.direction, out.amount, out.fee, out.counterparty], ['out', 1, 0.000005, SOL_OTHER])
  assert.deepEqual([inn.direction, inn.amount, inn.fee, inn.counterparty], ['in', 1, null, SOL_OTHER])
  assert.deepEqual([fee.direction, fee.amount, fee.fee], ['self', 0, 0.000005])
})

test('SOL: une transaction introuvable ne casse pas la liste', () => {
  const r = parseSol(SOL_ME, 0, [{ signature: 's1', blockTime: null }], [null])
  assert.equal(r.txs.length, 1)
  assert.equal(r.txs[0].unknown, true)
})

test('BTC: estimation de frais prudente (au moins 1 sat/vB, absente = valeur par défaut)', () => {
  assert.equal(btcFee({ 3: 10 }), 0.000015) // 10 sat/vB x 150 vB
  assert.equal(btcFee({ 3: 0.2 }), 0.0000015) // plancher à 1 sat/vB
  assert.equal(btcFee(null), 0.0000015)
})

/* ------------------------------- route ------------------------------- */

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Faux explorateurs: Blockstream en 429, mempool.space répond. On compte les appels pour vérifier le cache. */
function fakeExplorers() {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(String(url))
    const u = new URL(url)
    if (u.host === 'blockstream.info') return json({ message: 'rate limit' }, 429)
    if (u.host === 'mempool.space' && u.pathname.endsWith('/fee-estimates')) return json({ 3: 4 })
    if (u.host === 'mempool.space') return u.pathname.endsWith('/txs') ? json([btcTx('abc', [[CLEAN.BTC, 20_000]], [[OTHER, 18_000]], 2_000)]) : json(stats(20_000, 20_000))
    return json({ message: 'unexpected' }, 500)
  }
  return { calls, fetchImpl }
}

test('route: exige une session, valide l\'adresse, bascule d\'explorateur et met en cache', async () => {
  const ex = fakeExplorers()
  const fx = await startFixture({ chainFetch: ex.fetchImpl })
  try {
    assert.equal((await new Client(fx.api).get(`/api/chain/BTC/${CLEAN.BTC}`)).status, 401)
    const c = await signedUp(fx)
    assert.equal((await c.get('/api/chain/BTC/pas-une-adresse-valide-du-tout')).status, 404) // même pas une forme d'adresse: route inconnue
    assert.equal((await c.get('/api/chain/BTC/tb1qinvalidinvalidinvalidinvalid')).status, 400) // forme plausible, adresse invalide
    assert.equal((await c.get(`/api/chain/BTC/${CLEAN.EVM}`)).status, 400) // adresse d'une autre chaîne
    assert.equal((await c.get(`/api/chain/DOGE/${CLEAN.BTC}`)).status, 404)

    const a = await c.get(`/api/chain/BTC/${CLEAN.BTC}`)
    assert.equal(a.status, 200)
    assert.equal(a.json.source, 'mempool.space') // Blockstream a répondu 429
    assert.equal(a.json.balance, 0)
    assert.equal(a.json.estimatedFee, 0.000006) // 4 sat/vB x 150 vB
    assert.equal(a.json.txs[0].direction, 'out')
    const before = ex.calls.length
    const b = await c.get(`/api/chain/BTC/${CLEAN.BTC}`)
    assert.equal(b.status, 200)
    assert.equal(ex.calls.length, before) // servi depuis le cache: aucun appel de plus
  } finally {
    await fx.close()
  }
})

test('route: tous les explorateurs en panne rendent 502, jamais un faux solde', async () => {
  const fx = await startFixture({ chainFetch: async () => json({}, 500) })
  try {
    const c = await signedUp(fx)
    const r = await c.get(`/api/chain/BTC/${CLEAN.BTC}`)
    assert.equal(r.status, 502)
    assert.equal(r.json.error.code, 'chain_unavailable')
    assert.equal(r.json.balance, undefined)
  } finally {
    await fx.close()
  }
})

test('route: débit borné par session (le serveur n\'est pas un relais ouvert)', async () => {
  const fx = await startFixture({ chainFetch: fakeExplorers().fetchImpl })
  try {
    const c = await signedUp(fx)
    let last
    for (let i = 0; i < 91; i++) last = await c.get(`/api/chain/BTC/${CLEAN.BTC}`)
    assert.equal(last.status, 429)
    fx.advance(61)
    assert.equal((await c.get(`/api/chain/BTC/${CLEAN.BTC}`)).status, 200)
  } finally {
    await fx.close()
  }
})
