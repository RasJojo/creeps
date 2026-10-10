// Conversion d'une adresse Bitcoin mainnet vers son jumeau testnet (même clé, autre préfixe).
// Sert au screening: la liste de sanctions ne contient que des adresses mainnet, alors que le
// prototype tourne sur testnet. Sans cette conversion, une adresse sanctionnée passerait.
import { createHash } from 'node:crypto'

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BECH32 = 1
const BECH32M = 0x2bc830a3

function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ GEN[i]) >>> 0
  }
  return chk >>> 0
}
const expand = (hrp) => [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31))

/** Décode une adresse bech32/bech32m. Retourne null si elle est invalide. */
export function bech32Decode(address) {
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return null
  const a = address.toLowerCase()
  const sep = a.lastIndexOf('1')
  if (sep < 1 || sep + 7 > a.length) return null
  const hrp = a.slice(0, sep)
  const data = []
  for (const ch of a.slice(sep + 1)) {
    const v = B32.indexOf(ch)
    if (v < 0) return null
    data.push(v)
  }
  const check = polymod(expand(hrp).concat(data))
  if (check !== BECH32 && check !== BECH32M) return null
  return { hrp, data: data.slice(0, -6), constant: check }
}

export function bech32Encode(hrp, data, constant) {
  const mod = polymod(expand(hrp).concat(data, [0, 0, 0, 0, 0, 0])) ^ constant
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >>> (5 * (5 - i))) & 31)
  return hrp + '1' + data.concat(checksum).map((v) => B32[v]).join('')
}

const sha256 = (b) => createHash('sha256').update(b).digest()

function b58decode(s) {
  let n = 0n
  for (const ch of s) {
    const v = B58.indexOf(ch)
    if (v < 0) return null
    n = n * 58n + BigInt(v)
  }
  let hex = n.toString(16)
  if (hex.length % 2) hex = '0' + hex
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex')
  const zeros = s.match(/^1*/)[0].length
  return Buffer.concat([Buffer.alloc(zeros), body])
}

function b58encode(buf) {
  let n = BigInt('0x' + (buf.toString('hex') || '0'))
  let out = ''
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out
    n /= 58n
  }
  for (const byte of buf) {
    if (byte !== 0) break
    out = '1' + out
  }
  return out
}

const VERSION_TWIN = new Map([
  [0x00, 0x6f], // P2PKH mainnet -> testnet
  [0x05, 0xc4], // P2SH mainnet -> testnet
])

/** Jumeau testnet d'une adresse Bitcoin mainnet (bech32, bech32m ou base58). Retourne null si impossible. */
export function testnetTwin(mainnet) {
  if (/^bc1/i.test(mainnet)) {
    const d = bech32Decode(mainnet)
    return d && d.hrp === 'bc' ? bech32Encode('tb', d.data, d.constant) : null
  }
  const raw = b58decode(mainnet)
  if (!raw || raw.length !== 25) return null
  const body = raw.subarray(0, 21)
  if (!sha256(sha256(body)).subarray(0, 4).equals(raw.subarray(21))) return null
  const version = VERSION_TWIN.get(body[0])
  if (version === undefined) return null
  const next = Buffer.concat([Buffer.from([version]), body.subarray(1)])
  return b58encode(Buffer.concat([next, sha256(sha256(next)).subarray(0, 4)]))
}

/** Forme canonique pour comparer: bech32 en minuscules, base58 inchangée. */
export const canonicalBtc = (a) => (/^(bc|tb)1/i.test(a) ? a.toLowerCase() : a)

const hasValidChecksum = (raw) => raw.length === 25 && sha256(sha256(raw.subarray(0, 21))).subarray(0, 4).equals(raw.subarray(21))

/** Adresse Bitcoin de TEST valide: bech32 (tb1…) avec somme de contrôle, ou base58check (m…, n…, 2…). */
export function isTestnetBtcAddress(address) {
  if (/^tb1/i.test(address)) return bech32Decode(address)?.hrp === 'tb'
  const raw = b58decode(address)
  return !!raw && hasValidChecksum(raw) && (raw[0] === 0x6f || raw[0] === 0xc4)
}

/** Adresse Solana: une clé publique de 32 octets en base58. */
export function isSolanaAddress(address) {
  return b58decode(address)?.length === 32
}
