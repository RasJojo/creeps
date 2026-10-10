import type { Chain } from '../provider/types'

// Ce qu'on affiche pour chaque chaîne. Une seule source pour le nom, l'unité, les explorateurs et les robinets de test.
export type NetworkName = 'Bitcoin' | 'Ethereum' | 'Solana'

export const CHAIN_META: Record<
  Chain,
  {
    network: NetworkName
    unit: string
    testnet: string
    explorer: (address: string) => string
    txUrl: (hash: string) => string
    /** Robinet de coins de test tenu par un tiers: l'adresse peut changer ou le service disparaître. */
    faucet: string
    /** Décimales affichées pour les montants. */
    digits: number
  }
> = {
  BTC: {
    network: 'Bitcoin',
    unit: 'BTC',
    testnet: 'Bitcoin testnet',
    explorer: (a) => `https://blockstream.info/testnet/address/${a}`,
    txUrl: (h) => `https://blockstream.info/testnet/tx/${h}`,
    faucet: 'https://coinfaucet.eu/en/btc-testnet/',
    digits: 8,
  },
  EVM: {
    network: 'Ethereum',
    unit: 'ETH',
    testnet: 'Base Sepolia',
    explorer: (a) => `https://sepolia.basescan.org/address/${a}`,
    txUrl: (h) => `https://sepolia.basescan.org/tx/${h}`,
    faucet: 'https://portal.cdp.coinbase.com/products/faucet',
    digits: 6,
  },
  SOL: {
    network: 'Solana',
    unit: 'SOL',
    testnet: 'Solana testnet',
    explorer: (a) => `https://explorer.solana.com/address/${a}?cluster=testnet`,
    txUrl: (h) => `https://explorer.solana.com/tx/${h}?cluster=testnet`,
    faucet: 'https://faucet.solana.com',
    digits: 6,
  },
}

export const CHAINS: Chain[] = ['BTC', 'EVM', 'SOL']

export function chainOfNetwork(name: string): Chain | undefined {
  return CHAINS.find((c) => CHAIN_META[c].network === name)
}

/** Montant lisible: décimales utiles seulement, sans notation scientifique. */
export function formatAmount(value: number, chain: Chain): string {
  const { digits } = CHAIN_META[chain]
  const fixed = value.toFixed(digits)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') || '0' : fixed
}
