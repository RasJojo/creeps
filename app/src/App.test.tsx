// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { connectWallet, setupWallet } from './access/flows'
import { fakeAuthenticator } from './testing/fakeAuthenticator'
import { fakeBankClient } from './testing/fakeBankClient'
import { createFakeWorld, memoryKv, type Scenario } from './testing/fakeWallet'
import type { ChainTx } from './bank/api'
import type { EnrollStart } from './bank/authority'

/* Les vrais écrans de l'application, avec un fournisseur et une banque de test injectés.
   Ils vérifient que chaque écran se rend, que les formulaires font ce qu'ils disent et que les appels à la banque
   et au fournisseur sont les bons. Le comportement réel du fournisseur est vérifié séparément, en navigateur. */

const EMAIL = 'client@example.ch'
const RECIPIENT_BTC = 'tb1q9rp4v3rlw47zyzargsfmx6edtrg030adng3rh4'
const SANCTIONED_BTC = 'tb1qv7k70u2zynvem59u88ctdlaw7hc735d8vl6kcn'

beforeEach(() => {
  localStorage.clear() // les passkeys « créés sur cet appareil » sont retenus dans le navigateur: on repart de zéro à chaque test
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const tx = (over: Partial<ChainTx>): ChainTx => ({ hash: 'abc', time: 1_791_000_000_000, confirmed: true, ok: true, direction: 'in', amount: 0.001, fee: null, counterparty: RECIPIENT_BTC, ...over })

/** Un client déjà connecté, avec son wallet créé et son premier passkey (celui de la banque): l'application s'ouvre sur la vue d'ensemble. */
async function ready(opts: { delayMs?: number; passkey?: boolean; passwordFor?: string } = {}) {
  const world = createFakeWorld({ kv: memoryKv() })
  const wallet = world.device('A', 'Chrome on Linux')
  const bank = fakeBankClient({ email: EMAIL, signedIn: true, delayMs: opts.delayMs, passwordFor: opts.passwordFor })
  const authenticator = fakeAuthenticator('A')
  const spy = vi.spyOn(wallet, 'sendNative')
  await connectWallet({ wallet, bank })
  // `passkey: false`: le client a créé ses wallets mais refusé l'invite du passkey (compte pas encore équipé).
  if (opts.passkey === false) authenticator.refuseNext()
  await setupWallet({ wallet, bank, authenticator }, 'passcode-123', { label: 'Chrome on Linux', password: opts.passwordFor }).catch((e) => {
    if (opts.passkey !== false) throw e
  })
  const btc = wallet.listAccounts().find((a) => a.chain === 'BTC')!.address
  bank.state.chain.BTC = { balance: 0.0025, txs: [tx({ hash: 'in1', amount: 0.003 }), tx({ hash: 'out1', direction: 'out', amount: 0.0005, fee: 0.00001, time: 1_791_100_000_000 })] }
  bank.state.chain.EVM = { balance: 0.5, txs: [] }
  bank.state.chain.SOL = { balance: 3, txs: [tx({ hash: 'sol1', amount: 3, time: 1_791_200_000_000, unknown: false } as Partial<ChainTx>)] }
  const user = userEvent.setup()
  render(<App backend={{ wallet, bank, authenticator }} />)
  await screen.findByRole('heading', { name: 'Your wallets' })
  return { wallet, bank, user, btc, sendSpy: spy, authenticator }
}

const nav = (name: RegExp) => screen.getByRole('button', { name })

describe('vue d\'ensemble', () => {
  it('montre les trois wallets avec leurs vrais soldes, et l\'activité récente', async () => {
    await ready()
    expect(await screen.findByText('0.0025')).toBeTruthy() // solde Bitcoin lu par la banque
    expect(screen.getByText('0.5')).toBeTruthy()
    expect(screen.getByText('Bitcoin testnet')).toBeTruthy()
    expect(screen.getByText('Base Sepolia')).toBeTruthy()
    const latest = screen.getByRole('heading', { name: 'Latest activity' }).closest('.panel') as HTMLElement
    expect(within(latest).getAllByText(/Received|Sent/).length).toBeGreaterThan(0)
  })

  it("conseille un second passkey quand il n'y en a qu'un", async () => {
    await ready()
    expect(await screen.findByText(/You have a single passkey/)).toBeTruthy()
  })
})

describe('envoi', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, to: string, amount: string) {
    await user.click(nav(/Send and receive/))
    await user.type(await screen.findByLabelText('Recipient address (required)'), to)
    await user.type(screen.getByLabelText(/Amount in BTC/), amount)
  }

  it('contrôle de la banque, confirmation par passkey, signature, compte rendu à la banque', async () => {
    const { user, bank, sendSpy } = await ready()
    await fill(user, RECIPIENT_BTC, '0.001')
    await user.click(screen.getByRole('button', { name: 'Ask the bank to check this transfer' }))
    expect(bank.state.checks).toEqual([{ chain: 'BTC', to: RECIPIENT_BTC, amount: 0.001 }])
    await user.click(await screen.findByRole('button', { name: /Confirm with passkey and send/ }))
    await screen.findByRole('heading', { name: 'Transfer sent' })
    expect(sendSpy).toHaveBeenCalledWith('BTC', RECIPIENT_BTC, '0.001')
    // La banque a autorisé CETTE signature auprès du fournisseur, après le passkey du client, liée à la décision qu'elle venait de rendre.
    expect(bank.rules.signed).toEqual([{ method: 'passkey', authorizationId: 'auth-1' }])
    expect(bank.state.audit.some((e) => e.action === 'signing.authorized')).toBe(true)
    expect(bank.state.reports).toHaveLength(1)
    expect(bank.state.reports[0].authorizationId).toBe('auth-1')
    expect(bank.state.reports[0].hash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(screen.getByRole('link', { name: /Open in the explorer/ }).getAttribute('href')).toContain('blockstream.info/testnet/tx/')
  })

  it('une adresse sanctionnée est refusée par la banque: rien n\'est signé, ni proposé', async () => {
    const { user, bank, sendSpy } = await ready()
    bank.state.refused.add(SANCTIONED_BTC)
    await fill(user, SANCTIONED_BTC, '0.001')
    await user.click(screen.getByRole('button', { name: 'Ask the bank to check this transfer' }))
    expect(await screen.findByText('The bank refuses this transfer')).toBeTruthy()
    expect(screen.getAllByText(/OFAC sanctions list/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Confirm with passkey/ })).toBeNull()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('un montant au-dessus du plafond est refusé avec le motif, même si le solde le permet', async () => {
    const { user, bank, sendSpy } = await ready()
    bank.state.policy.maxPerTx.BTC = 0.001 // le solde (0.0025) couvre 0.002, mais pas le plafond que le client s'est fixé
    await fill(user, RECIPIENT_BTC, '0.002')
    await user.click(screen.getByRole('button', { name: 'Ask the bank to check this transfer' }))
    expect(await screen.findByText('The bank refuses this transfer')).toBeTruthy()
    expect(screen.getAllByText(/Limit per transfer exceeded \(0\.002 > 0\.001 BTC\)/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Confirm with passkey/ })).toBeNull()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it("n'autorise pas à demander à la banque quand le solde ne couvre pas le montant et les frais", async () => {
    const { user } = await ready()
    await fill(user, RECIPIENT_BTC, '0.0025') // tout le solde, sans marge pour les frais
    expect((screen.getByRole('button', { name: 'Ask the bank to check this transfer' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Amount plus estimated fee is more than your balance')).toBeTruthy()
  })

  it("refuse une adresse qui n'a pas la forme d'une adresse de test", async () => {
    const { user } = await ready()
    await fill(user, 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', '0.001') // mainnet
    expect((screen.getByRole('button', { name: 'Ask the bank to check this transfer' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("sans passkey, la banque redemande le mot de passe dans une fenêtre dédiée, puis la signature est autorisée", async () => {
    const { user, bank, sendSpy } = await ready({ passkey: false, passwordFor: 'bank password' })
    expect(bank.rules.enrolled).toHaveLength(0)
    await fill(user, RECIPIENT_BTC, '0.001')
    await user.click(screen.getByRole('button', { name: 'Ask the bank to check this transfer' }))
    await user.click(await screen.findByRole('button', { name: /Confirm with passkey and send/ }))
    const field = await screen.findByLabelText(/Swissquote password/)
    expect(sendSpy).not.toHaveBeenCalled()
    await user.type(field, 'bank password')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByRole('heading', { name: 'Transfer sent' })
    expect(bank.rules.signed).toEqual([{ method: 'password', authorizationId: 'auth-1' }])
  })

  it("un passkey refusé à la confirmation n'engage rien: rien n'est signé, la décision de la banque reste valable, on réessaie", async () => {
    const { user, bank, sendSpy, authenticator } = await ready()
    await fill(user, RECIPIENT_BTC, '0.001')
    await user.click(screen.getByRole('button', { name: 'Ask the bank to check this transfer' }))
    authenticator.refuseNext()
    await user.click(await screen.findByRole('button', { name: /Confirm with passkey and send/ }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(sendSpy).not.toHaveBeenCalled()
    expect(bank.state.reports).toHaveLength(0) // pas un échec de transfert: le client a simplement renoncé
    expect(bank.rules.signed).toHaveLength(0)
    await user.click(await screen.findByRole('button', { name: /Confirm with passkey and send/ }))
    await screen.findByRole('heading', { name: 'Transfer sent' })
    expect(bank.rules.signed).toEqual([{ method: 'passkey', authorizationId: 'auth-1' }])
  })

  it('une signature qui échoue est rapportée à la banque et affichée, sans faux succès', async () => {
    const { user, bank, sendSpy } = await ready()
    sendSpy.mockRejectedValueOnce(new Error('The network refused the transaction'))
    await fill(user, RECIPIENT_BTC, '0.001')
    await user.click(screen.getByRole('button', { name: 'Ask the bank to check this transfer' }))
    await user.click(await screen.findByRole('button', { name: /Confirm with passkey and send/ }))
    await waitFor(() => expect(bank.state.reports).toHaveLength(1))
    expect(bank.state.reports[0].hash).toBeUndefined()
    expect(bank.state.reports[0].error).toMatch(/network refused/)
    expect(screen.queryByRole('heading', { name: 'Transfer sent' })).toBeNull()
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

describe('historique', () => {
  it('réunit les transactions des trois réseaux et se filtre', async () => {
    const { user } = await ready()
    await user.click(nav(/Transaction history/))
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('row').length).toBe(1 + 3) // en-tête + 3 transactions
    await user.click(screen.getByRole('button', { name: 'Sent' }))
    expect(within(table).getAllByRole('row').length).toBe(1 + 1)
    await user.click(screen.getByRole('button', { name: 'Solana' }))
    expect(screen.getByText(/No entries match/)).toBeTruthy()
  })
})

describe('sécurité', () => {
  async function security(opts: { delayMs?: number } = {}) {
    const r = await ready(opts)
    await r.user.click(screen.getByRole('button', { name: /Open profile and settings/ }))
    await r.user.click(await screen.findByRole('tab', { name: /Security/ }))
    await screen.findByRole('heading', { name: 'Passkeys' })
    return r
  }

  it("la liste montre les passkeys de la banque, avec leur nature; un seul passkey: conseil d'en ajouter un", async () => {
    const { bank } = await security()
    expect(await screen.findByText(/on this device only/)).toBeTruthy()
    expect(screen.getAllByText(/Chrome on Linux/).length).toBeGreaterThan(0)
    expect(screen.getByText(/You have a single passkey/)).toBeTruthy()
    expect(bank.rules.enrolled).toHaveLength(1)
  })

  it("ajouter un passkey sur un appareil qui n'en a pas: la banque impose son délai de sécurité, annulable", async () => {
    const { user, bank } = await security({ delayMs: 60_000 })
    bank.rules.expireStrong() // le temps a passé depuis le dernier passkey vérifié
    await user.click(screen.getByRole('button', { name: 'Add a passkey to this device' }))
    expect(await screen.findByText(/A new passkey is waiting/)).toBeTruthy()
    expect(bank.rules.pendingRequests()).toHaveLength(1)
    await user.click(screen.getAllByRole('button', { name: /Cancel it/ })[0])
    await waitFor(() => expect(bank.rules.pendingRequests()).toHaveLength(0))
    await waitFor(() => expect(screen.queryByText(/waiting for its security delay/)).toBeNull())
    expect(bank.rules.enrolled).toHaveLength(1)
  })

  it("retirer un passkey demande un passkey à l'instant; le dernier ne peut pas être retiré", async () => {
    const { user, bank, authenticator } = await ready()
    const start = (await bank.registerOptions()) as Extract<EnrollStart, { status: 'ready' }>
    await bank.registerVerify({ challengeId: start.challengeId, credential: { id: 'cred-phone', challenge: start.publicKey.challenge }, label: 'Phone' })
    // Le premier passkey a été créé sur CET appareil: il est donc retiré le navigateur comme « sur cet appareil ».
    const [here] = await bank.passkeys()
    localStorage.setItem('creeps.passkeysHere', JSON.stringify([here.id]))
    await user.click(screen.getByRole('button', { name: /Open profile and settings/ }))
    await user.click(await screen.findByRole('tab', { name: /Security/ }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)) // la liste se relit à l'ouverture de la page
    const remove = screen.getAllByRole('button', { name: 'Remove' })
    bank.rules.expireStrong() // le temps a passé: la banque exige un passkey pour retirer
    const prompts = authenticator.prompts
    await user.click(remove[1])
    await waitFor(() => expect(bank.rules.enrolled).toHaveLength(1))
    expect(authenticator.prompts).toBe(prompts + 1)
    expect(bank.rules.enrolled[0].label).not.toBe('Phone')
    expect((await screen.findByRole('button', { name: 'Remove' })) as HTMLButtonElement).toHaveProperty('disabled', true)
  })
})

describe('export de la clé', () => {
  async function wallets() {
    const r = await ready()
    await r.user.click(screen.getByRole('button', { name: /Open profile and settings/ }))
    await screen.findByRole('heading', { name: 'Export a private key' })
    return r
  }

  it("exige le passkey (autorisation d'export de la banque) et le passcode, puis le cadre du fournisseur affiche la clé", async () => {
    const { user, bank, authenticator } = await wallets()
    const prompts = authenticator.prompts
    await user.type(screen.getByLabelText('Passcode'), 'passcode-123')
    await user.click(screen.getByRole('button', { name: /Show the private key/ }))
    expect(await screen.findByText(/FAKE PRIVATE KEY for BTC/)).toBeTruthy()
    expect(bank.rules.exported).toBe(1)
    expect(authenticator.prompts).toBe(prompts + 1)
    expect(bank.state.audit.some((e) => e.action === 'export.authorized')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Hide it' }))
    expect(screen.queryByText(/FAKE PRIVATE KEY/)).toBeNull()
  })

  it("un mauvais passcode ne révèle rien; un passkey refusé non plus", async () => {
    const { user, authenticator } = await wallets()
    await user.type(screen.getByLabelText('Passcode'), 'wrong passcode')
    await user.click(screen.getByRole('button', { name: /Show the private key/ }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/FAKE PRIVATE KEY/)).toBeNull()
    authenticator.refuseNext()
    await user.clear(screen.getByLabelText('Passcode'))
    await user.type(screen.getByLabelText('Passcode'), 'passcode-123')
    await user.click(screen.getByRole('button', { name: /Show the private key/ }))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(screen.queryByText(/FAKE PRIVATE KEY/)).toBeNull()
  })
})

describe('règles de la banque et audit', () => {
  it('charge la politique du serveur, l\'enregistre côté serveur, affiche un audit vérifié', async () => {
    const { user, bank } = await ready()
    await user.click(screen.getByRole('button', { name: /Open profile and settings/ }))
    await user.click(await screen.findByRole('tab', { name: /Bank rules and audit/ }))
    const limit = (await screen.findByLabelText('Per transfer, BTC')) as HTMLInputElement
    expect(limit.value).toBe('0.01')
    await user.clear(limit)
    await user.type(limit, '0.5')
    await user.click(screen.getByRole('button', { name: 'Save rules' }))
    await waitFor(() => expect(bank.state.policy.maxPerTx.BTC).toBe(0.5))
    expect(await screen.findByText(/Chain verified/)).toBeTruthy()
    expect(screen.getAllByText('Limits updated').length).toBeGreaterThan(0)
  })

  it('une limite invalide bloque l\'enregistrement', async () => {
    const { user, bank } = await ready()
    await user.click(screen.getByRole('button', { name: /Open profile and settings/ }))
    await user.click(await screen.findByRole('tab', { name: /Bank rules and audit/ }))
    const limit = (await screen.findByLabelText('Per transfer, BTC')) as HTMLInputElement
    await user.clear(limit)
    await user.type(limit, 'beaucoup')
    expect((screen.getByRole('button', { name: 'Save rules' }) as HTMLButtonElement).disabled).toBe(true)
    expect(bank.state.audit.some((e) => e.action === 'rules.updated')).toBe(false)
  })
})

describe('connexion à la banque', () => {
  async function signedOut(scenario?: Partial<Scenario>) {
    const world = createFakeWorld({ kv: memoryKv(), scenario })
    const wallet = world.device('A', 'Chrome on Linux')
    const bank = fakeBankClient({ email: EMAIL })
    const authenticator = fakeAuthenticator('A')
    const user = userEvent.setup()
    render(<App backend={{ wallet, bank, authenticator }} />)
    await screen.findByRole('heading', { name: scenario?.legacyPasskeyUsers ? /./ : 'Sign in' })
    return { wallet, bank, user, authenticator }
  }

  it('un mauvais mot de passe affiche le message de la banque et n\'ouvre rien', async () => {
    const { user, wallet } = await signedOut()
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Continue with Swissquote' }))
    expect(await screen.findByText('Email or password is incorrect')).toBeTruthy()
    expect(wallet.isSignedIn()).toBe(false)
  })

  it("l'inscription, puis le wallet et le premier passkey de la banque, ouvrent l'application", async () => {
    const { user, wallet, bank, authenticator } = await signedOut()
    await user.click(screen.getByRole('button', { name: 'Create a test account' }))
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText(/Password/), 'a long enough password')
    await user.click(screen.getByRole('button', { name: 'Create the account' }))
    await screen.findByRole('heading', { name: 'Create your wallet' })
    expect(wallet.isSignedIn()).toBe(true)
    expect(bank.state.session?.email).toBe(EMAIL)

    await user.type(screen.getByLabelText('Passcode (8 characters minimum)'), 'passcode-123')
    await user.type(screen.getByLabelText('Repeat the passcode'), 'passcode-123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create my wallet' }))
    await screen.findByRole('heading', { name: 'Your wallets' })
    expect(wallet.listAccounts()).toHaveLength(3)
    expect(bank.rules.enrolled).toHaveLength(1) // le passkey est celui de la banque
    expect(authenticator.credentials).toHaveLength(1)
  })

  it("un passkey refusé à la création laisse les wallets et l'application, avec un conseil clair d'en ajouter un", async () => {
    const { user, wallet, bank, authenticator } = await signedOut()
    await user.click(screen.getByRole('button', { name: 'Create a test account' }))
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText(/Password/), 'a long enough password')
    await user.click(screen.getByRole('button', { name: 'Create the account' }))
    await screen.findByRole('heading', { name: 'Create your wallet' })
    authenticator.refuseNext()
    await user.type(screen.getByLabelText('Passcode (8 characters minimum)'), 'passcode-123')
    await user.type(screen.getByLabelText('Repeat the passcode'), 'passcode-123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create my wallet' }))
    await screen.findByRole('heading', { name: 'Your wallets' })
    expect(wallet.listAccounts()).toHaveLength(3)
    expect(bank.rules.enrolled).toHaveLength(0)
    expect(await screen.findByText(/Your account has no passkey yet/)).toBeTruthy()
  })

  it("« Sign in with a passkey »: la banque ouvre la session sans mot de passe, puis le wallet suit", async () => {
    const world = createFakeWorld({ kv: memoryKv() })
    const wallet = world.device('A', 'Chrome on Linux')
    const bank = fakeBankClient({ email: EMAIL, signedIn: true })
    const authenticator = fakeAuthenticator('A')
    await connectWallet({ wallet, bank })
    await setupWallet({ wallet, bank, authenticator }, 'passcode-123', { label: 'Chrome on Linux' })
    await bank.logout()
    await wallet.logout()
    const user = userEvent.setup()
    render(<App backend={{ wallet, bank, authenticator }} />)
    await user.click(await screen.findByRole('button', { name: /Sign in with a passkey/ }))
    await screen.findByRole('heading', { name: 'Your wallets' })
    expect(bank.rules.logins).toBe(1)
    expect(bank.state.audit.some((e) => e.action === 'session.passkey_login')).toBe(true)
  })

  it("sur un appareil sans le passkey, la connexion par passkey échoue avec un message clair, sans ouvrir de session", async () => {
    const world = createFakeWorld({ kv: memoryKv() })
    const wallet = world.device('B', 'Safari on iPhone')
    const bank = fakeBankClient({ email: EMAIL, signedIn: true })
    await bank.registerOptions().then((s) => bank.registerVerify({ challengeId: (s as { challengeId: string }).challengeId, credential: { id: 'cred-elsewhere', challenge: (s as { publicKey: { challenge: string } }).publicKey.challenge }, label: 'Other phone' }))
    await bank.logout()
    const user = userEvent.setup()
    render(<App backend={{ wallet, bank, authenticator: fakeAuthenticator('B') }} />)
    await user.click(await screen.findByRole('button', { name: /Sign in with a passkey/ }))
    expect(await screen.findByText(/none of your passkeys is on this device/)).toBeTruthy()
    expect(wallet.isSignedIn()).toBe(false)
    expect(bank.rules.logins).toBe(0)
  })

  it("un compte qui détient encore un passkey chez le fournisseur (ancienne version) voit pourquoi il ne peut pas entrer", async () => {
    const world = createFakeWorld({ kv: memoryKv(), scenario: { legacyPasskeyUsers: [EMAIL] } })
    const wallet = world.device('A', 'Chrome on Linux')
    const bank = fakeBankClient({ email: EMAIL, signedIn: true })
    await connectWallet({ wallet, bank })
    render(<App backend={{ wallet, bank, authenticator: fakeAuthenticator('A') }} />)
    expect(await screen.findByRole('heading', { name: 'This account cannot be opened here' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Use a different account/ })).toBeTruthy()
  })

  it("le choix « Create a test account » reste possible pendant que l'application démarre, et survit à la fin du démarrage", async () => {
    const world = createFakeWorld({ kv: memoryKv() })
    const wallet = world.device('A', 'Chrome on Linux')
    let finishBoot!: () => void
    wallet.ready = () => new Promise<void>((resolve) => (finishBoot = resolve)) // le fournisseur met du temps à s'ouvrir
    const user = userEvent.setup()
    render(<App backend={{ wallet, bank: fakeBankClient({ email: EMAIL }), authenticator: fakeAuthenticator('A') }} />)
    await screen.findByRole('heading', { name: 'Sign in' })
    // Rien ne part tant que l'application démarre...
    expect((screen.getByRole('button', { name: 'Continue with Swissquote' }) as HTMLButtonElement).disabled).toBe(true)
    // ...mais choisir de créer un compte ne dépend que de l'écran: le clic doit marcher tout de suite.
    await user.click(screen.getByRole('button', { name: 'Create a test account' }))
    await user.type(screen.getByLabelText('Email'), EMAIL)
    expect(screen.getByRole('heading', { name: 'Create a test account' })).toBeTruthy()
    finishBoot()
    const submit = await screen.findByRole('button', { name: 'Create the account' })
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false))
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(EMAIL)
  })

  it('un mot de passe trop court est refusé avant tout appel', async () => {
    const { user, bank } = await signedOut()
    await user.click(screen.getByRole('button', { name: 'Create a test account' }))
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText(/Password/), 'short')
    await user.click(screen.getByRole('button', { name: 'Create the account' }))
    expect(await screen.findByText(/Use at least 10 characters/)).toBeTruthy()
    expect(bank.state.session).toBeNull()
  })
})
