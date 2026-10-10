import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bech32Decode, canonicalBtc, isSolanaAddress, isTestnetBtcAddress, testnetTwin } from '../src/btc.mjs'

// Vecteur de la spécification BIP173: le même programme de témoin, sur mainnet et sur testnet.
test('bech32: jumeau testnet du vecteur BIP173', () => {
  assert.equal(testnetTwin('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')
})

test('bech32: la casse mixte est refusée, la majuscule complète acceptée', () => {
  assert.equal(bech32Decode('Bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), null)
  assert.ok(bech32Decode('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4'))
})

test('bech32: une somme de contrôle fausse est refusée', () => {
  assert.equal(testnetTwin('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5'), null)
})

test('base58: une adresse P2PKH devient une adresse testnet m… ou n…, et la somme de contrôle reste valide', () => {
  const t = testnetTwin('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')
  assert.match(t, /^[mn][1-9A-HJ-NP-Za-km-z]{25,34}$/)
  assert.equal(testnetTwin('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3'), null) // un caractère modifié
})

test('base58: une adresse P2SH devient une adresse testnet 2…', () => {
  const t = testnetTwin('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')
  assert.match(t, /^2[1-9A-HJ-NP-Za-km-z]{25,34}$/)
})

test('canonique', () => {
  assert.equal(canonicalBtc('TB1QABC'), 'tb1qabc')
  assert.equal(canonicalBtc('1BvB'), '1BvB')
})

test('adresses de test: la somme de contrôle est vérifiée (une faute de frappe est refusée)', () => {
  assert.equal(isTestnetBtcAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'), true) // vecteur BIP173
  assert.equal(isTestnetBtcAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsy'), false) // dernier caractère changé
  assert.equal(isTestnetBtcAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), false) // mainnet
  const legacy = testnetTwin('12aNKp2iDKuhEde2YfPdd4DFGenRUTKupL') // base58check testnet obtenu depuis une adresse réelle
  assert.equal(isTestnetBtcAddress(legacy), true)
  assert.equal(isTestnetBtcAddress(legacy.slice(0, -1) + (legacy.endsWith('a') ? 'b' : 'a')), false)
  assert.equal(isTestnetBtcAddress('12aNKp2iDKuhEde2YfPdd4DFGenRUTKupL'), false) // mainnet legacy
})

test('Solana: 32 octets en base58 (la base58 n\'a pas de somme de contrôle: on vérifie la longueur et l\'alphabet)', () => {
  assert.equal(isSolanaAddress('EWdbpPpotPtJrvBms5j4cVQouo7iR5DVvJjCVL99pAWX'), true)
  assert.equal(isSolanaAddress('EWdbpPpotPtJrvBms5j4cVQ'), false) // trop court
  assert.equal(isSolanaAddress('0WdbpPpotPtJrvBms5j4cVQouo7iR5DVvJjCVL99pAWX'), false) // '0' n'existe pas en base58
})
