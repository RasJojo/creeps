import type { Chain } from './provider/types'

/* ILLUSTRATION de la page d'accueil, pas le contrôle réel.
   Elle applique les mêmes règles que le backend de la banque (server/src/policy.mjs) avec les limites par défaut et une
   courte liste d'exemple (quelques adresses RÉELLEMENT sanctionnées, tirées de la liste publique de l'OFAC). Dans
   l'application, c'est le serveur de la banque qui décide, avec la liste complète et sans jamais faire confiance au navigateur. */

const LIMITS: Record<Chain, { perTx: number; perDay: number }> = {
  BTC: { perTx: 0.01, perDay: 0.05 },
  EVM: { perTx: 1, perDay: 5 },
  SOL: { perTx: 10, perDay: 50 },
}

/** Une adresse sanctionnée par réseau (BTC: jumeau testnet d'une adresse mainnet de la liste). */
export const SANCTIONED_EXAMPLE: Record<Chain, string> = {
  BTC: 'tb1qv7k70u2zynvem59u88ctdlaw7hc735d8vl6kcn',
  EVM: '0x252a8bd2319d8a555b872990601221b3a2053bce',
  SOL: '42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi',
}

export type DemoVerdict = { allowed: boolean; reasons: string[] }

export function demoVerdict(chain: Chain, to: string, amount: number): DemoVerdict {
  const reasons: string[] = []
  if (SANCTIONED_EXAMPLE[chain].toLowerCase() === to.trim().toLowerCase()) reasons.push('Address is on the OFAC sanctions list')
  if (!(amount > 0)) reasons.push('Enter an amount above zero')
  else if (amount > LIMITS[chain].perTx) reasons.push(`Limit per transfer exceeded (${amount} > ${LIMITS[chain].perTx} ${chain})`)
  return reasons.length ? { allowed: false, reasons } : { allowed: true, reasons: ['Within your limits, address not on a sanctions list'] }
}
