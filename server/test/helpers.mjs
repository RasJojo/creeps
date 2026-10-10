import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicKey, verify } from 'node:crypto'
import { loadConfig } from '../src/config.mjs'
import { startBank } from '../src/server.mjs'

export const ORIGIN = 'http://localhost:5173'

// Extrait de la VRAIE liste OFAC (fichier SDN du Trésor américain): ces adresses sont réellement sanctionnées.
export const SANCTIONED = {
  BTC_LEGACY: '12aNKp2iDKuhEde2YfPdd4DFGenRUTKupL',
  BTC_LEGACY_2: '12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h',
  BTC_BECH32: 'bc1qv7k70u2zynvem59u88ctdlaw7hc735d8xep9rq',
  BTC_BECH32_2: 'bc1qw4cxpe6sxa5dg6sdwxjph959cw6yztrzl4r54s',
  EVM: '0x252a8bd2319d8a555b872990601221b3a2053bce',
  EVM_MIXED_CASE: '0x1CAb8177ACe78b1B6B1c393371F4f2dCAE40CbEB',
  SOL: '42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi',
  SOL_2: '6wjqWWra8ombzaw6VHrG5xpQ972jCYF6bbHiFCbWmr4U',
}
const csvLine = (id, ...codes) => `${id},"EXAMPLE, Entity","individual","TEST",-0- ,"${codes.join('; ')};"`
export const OFAC_CSV = [
  csvLine(1, `Digital Currency Address - XBT ${SANCTIONED.BTC_LEGACY}`, `Digital Currency Address - ETH ${SANCTIONED.EVM}`),
  csvLine(2, `Digital Currency Address - XBT ${SANCTIONED.BTC_LEGACY_2}`, `Digital Currency Address - ETH ${SANCTIONED.EVM_MIXED_CASE}`),
  csvLine(3, `Digital Currency Address - XBT ${SANCTIONED.BTC_BECH32}`, `Digital Currency Address - SOL ${SANCTIONED.SOL}`),
  csvLine(4, `Digital Currency Address - XBT ${SANCTIONED.BTC_BECH32_2}`, `Digital Currency Address - SOL ${SANCTIONED.SOL_2}`),
].join('\n')

// Adresses saines (jamais listées).
export const CLEAN = {
  BTC: 'tb1q9rp4v3rlw47zyzargsfmx6edtrg030adng3rh4',
  EVM: '0x6DB8A8CDE4fF95d95570589D850136D2B0932b1D',
  SOL: 'EWdbpPpotPtJrvBms5j4cVQouo7iR5DVvJjCVL99pAWX',
}

export async function startFixture({ overrides = {}, ofac = OFAC_CSV, chainFetch } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'creeps-bank-'))
  const clock = { t: 1_800_000_000_000 }
  const config = loadConfig({ dataDir, apiPort: 0, jwksPort: 0, recoveryDelaySeconds: 60, reauthWindowSeconds: 300, ...overrides })
  const fetchImpl = async () => (ofac === null ? Promise.reject(new Error('network down')) : new Response(ofac, { status: 200 }))
  const bank = await startBank(config, { fetchImpl, chainFetchImpl: chainFetch, now: () => clock.t })
  return {
    bank,
    clock,
    config,
    api: `http://127.0.0.1:${bank.apiPort}`,
    jwks: `http://127.0.0.1:${bank.jwksPort}`,
    advance: (seconds) => void (clock.t += seconds * 1000),
    close: async () => {
      await bank.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/** Client HTTP avec un pot de cookies, comme un navigateur. */
export class Client {
  constructor(base) {
    this.base = base
    this.cookie = ''
  }
  async req(method, path, body, { origin = ORIGIN, contentType = 'application/json', headers: extra = {} } = {}) {
    const headers = { ...extra }
    if (this.cookie) headers.cookie = this.cookie
    if (origin !== null) headers.origin = origin // null = ne pas envoyer d'en-tête Origin
    if (method !== 'GET') headers['content-type'] = contentType
    const res = await fetch(this.base + path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0]
    return { status: res.status, json: await res.json().catch(() => null), setCookie }
  }
  get(path) {
    return this.req('GET', path)
  }
  post(path, body, opts) {
    return this.req('POST', path, body, opts)
  }
  put(path, body) {
    return this.req('PUT', path, body)
  }
}

export async function signedUp(fx, email = 'client@example.ch', password = 'a long enough password') {
  const c = new Client(fx.api)
  const r = await c.post('/api/register', { email, password })
  if (r.status !== 200) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.json)}`)
  return c
}

/** Vérifie une signature RS256 avec la clé PUBLIQUE publiée par le JWKS, comme le fait le fournisseur de wallet. */
export async function verifyJwt(fx, jwt) {
  const [h, p, s] = jwt.split('.')
  const header = JSON.parse(Buffer.from(h, 'base64url').toString())
  const { keys } = await (await fetch(`${fx.jwks}/.well-known/jwks.json`)).json()
  const jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new Error('unknown kid')
  const ok = verify('sha256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'))
  return { ok, header, claims: JSON.parse(Buffer.from(p, 'base64url').toString()) }
}
