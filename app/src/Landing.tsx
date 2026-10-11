import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, DeviceMobile, ShieldCheck, X } from './landingIcons'
import { defaultPolicy, evaluatePolicy } from './bank/policy'
import { screenAddress } from './bank/screening'
import type { Chain } from './provider/types'
import './landing.css'

/* Page d'atterrissage. Thème unique (clair), un seul accent (vert mousse),
   rayons: boutons 10px, cartes 14px, pastilles pleines. */

const CHAINS: { id: Chain; label: string; unit: string; sample: string }[] = [
  { id: 'BTC', label: 'Bitcoin', unit: 'BTC', sample: 'tb1q9rp4v3rlw47zyzargsfmx6edtrg030adng3rh4' },
  { id: 'EVM', label: 'Ethereum', unit: 'ETH', sample: '0x6DB8A8CDE4fF95d95570589D850136D2B0932b1D' },
  { id: 'SOL', label: 'Solana', unit: 'SOL', sample: 'EWdbpPpotPtJrvBms5j4cVQouo7iR5DVvJjCVL99pAWX' },
]

function useReveal() {
  const reduce = useReducedMotion()
  return (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.25 },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        }
}

/* Vrai composant: la même logique que la couche bancaire de l'application. */
function TransferCheck() {
  const [chain, setChain] = useState<Chain>('BTC')
  const [amount, setAmount] = useState('0.5')
  const [to, setTo] = useState(CHAINS[0].sample)
  const meta = CHAINS.find((c) => c.id === chain)!

  const screening = screenAddress(to)
  const policy = evaluatePolicy(defaultPolicy, { chain, to, amount: Number(amount) })
  const refused = screening.blocked || !policy.allowed
  const reasons = screening.blocked ? [screening.reason ?? 'Address screening'] : policy.reasons

  return (
    <form className="lp-check" onSubmit={(e) => e.preventDefault()} aria-label="Try a transfer">
      <h2>Try a transfer</h2>
      <label>
        <span>Network</span>
        <select
          name="network"
          value={chain}
          onChange={(e) => {
            const next = e.target.value as Chain
            setChain(next)
            setTo(CHAINS.find((c) => c.id === next)!.sample)
          }}
        >
          {CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Amount in {meta.unit}</span>
        <input name="amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label>
        <span>Recipient address</span>
        <input name="recipient" autoComplete="off" spellCheck={false} value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <div className={`lp-verdict ${refused ? 'no' : 'yes'}`} role="status" aria-live="polite">
        {refused ? <X size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
        <div>
          <strong>{refused ? 'The bank refuses this transfer' : 'The bank lets this transfer through'}</strong>
          <p>{reasons.join('. ')}</p>
        </div>
      </div>
    </form>
  )
}

export function Landing() {
  const reveal = useReveal()

  return (
    <div className="lp">
      <a className="skip-link" href="#content">
        Skip to main content
      </a>

      <header className="lp-nav">
        <a className="lp-mark" href="#top" aria-label="creeps, home">
          creeps
        </a>
        <nav aria-label="Main">
          <a href="#key">The key</a>
          <a href="#send">Sending</a>
          <a href="#recovery">Recovery</a>
          <a className="lp-btn sm" href="#app">
            Open the app
          </a>
        </nav>
      </header>

      <main id="content">
        {/* Héros: split asymétrique, 4 éléments de texte maximum */}
        <section className="lp-hero" id="top">
          <div className="lp-hero-copy">
            <h1>Self-custody, with a bank behind it.</h1>
            <p>No seed phrase. Your key is never in one place. The bank can refuse a transfer, never sign one.</p>
            <div className="lp-actions">
              <a className="lp-btn" href="#app">
                Open the app <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a className="lp-btn ghost" href="#recovery">
                How recovery works
              </a>
            </div>
          </div>
          <motion.div className="lp-hero-visual" {...(useReducedMotion() ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] as const } })}>
            <TransferCheck />
          </motion.div>
        </section>

        {/* Réseaux pris en charge: logos seuls */}
        <section className="lp-chains" aria-label="Supported networks">
          <img src="https://cdn.simpleicons.org/bitcoin/12201d" alt="Bitcoin" width="28" height="28" />
          <img src="https://cdn.simpleicons.org/ethereum/12201d" alt="Ethereum" width="28" height="28" />
          <img src="https://cdn.simpleicons.org/solana/12201d" alt="Solana" width="28" height="28" />
        </section>

        {/* Bento: exactement 3 cellules, 2 + 1 */}
        <section className="lp-section" id="key">
          <motion.div {...reveal()}>
            <h2>Nobody signs alone</h2>
            <p className="lp-lead">A transfer needs your share of the key and the provider's. The bank stands in front and can say no.</p>
          </motion.div>
          <div className="lp-bento">
            <motion.article className="lp-cell tint" {...reveal(0.05)}>
              <DeviceMobile size={26} aria-hidden="true" />
              <h3>Your device</h3>
              <p>
                Holds your share, locked by your passkey and a passcode only you know. Without both, the share is unreadable.
              </p>
            </motion.article>
            <motion.article className="lp-cell plain" {...reveal(0.1)}>
              <ShieldCheck size={26} aria-hidden="true" />
              <h3>The wallet provider</h3>
              <p>Holds the other share. It signs together with you, never on its own.</p>
            </motion.article>
            <motion.article className="lp-cell bank" {...reveal(0.15)}>
              <X size={26} aria-hidden="true" />
              <h3>The bank</h3>
              <p>Holds no share. It checks identity, limits and sanctions lists, and it can refuse. It cannot sign.</p>
            </motion.article>
          </div>
        </section>

        {/* Chronologie horizontale */}
        <section className="lp-section" id="send">
          <motion.div {...reveal()}>
            <h2>What happens when you send</h2>
          </motion.div>
          <ol className="lp-steps">
            {[
              ['Check', 'The bank tests the amount, the address and the sanctions lists.'],
              ['Approve', 'You confirm with your fingerprint or your face.'],
              ['Sign', 'Your share and the provider\'s sign together. A full key never exists.'],
              ['Broadcast', 'The signed transaction goes to the network.'],
            ].map(([title, text], i) => (
              <motion.li key={title} {...reveal(i * 0.06)}>
                <h3>{title}</h3>
                <p>{text}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* Comparaison deux colonnes */}
        <section className="lp-section" id="recovery">
          <motion.div {...reveal()}>
            <h2>Lost your phone? Keep your wallet.</h2>
            <p className="lp-lead">
              Sign in to your bank account on the new device, prove it is you, enter your passcode, and register a new passkey.
              Your addresses stay the same.
            </p>
          </motion.div>
          <div className="lp-compare">
            <motion.div className="lp-card" {...reveal(0.05)}>
              <h3>The bank can</h3>
              <ul>
                <li><Check size={16} aria-hidden="true" /> Verify who you are</li>
                <li><Check size={16} aria-hidden="true" /> Allow a new passkey</li>
                <li><Check size={16} aria-hidden="true" /> Refuse a transfer that breaks your limits</li>
              </ul>
            </motion.div>
            <motion.div className="lp-card" {...reveal(0.1)}>
              <h3>The bank cannot</h3>
              <ul>
                <li><X size={16} aria-hidden="true" /> Sign for you</li>
                <li><X size={16} aria-hidden="true" /> Read or reset your passcode</li>
                <li><X size={16} aria-hidden="true" /> Move your funds</li>
              </ul>
            </motion.div>
          </div>
          <motion.p className="lp-notice" {...reveal(0.15)}>
            If you lose your passcode, nobody can recover the wallet. That is the cost of owning your keys.
          </motion.p>
        </section>

        {/* Statut honnête, deux groupes sans tableau */}
        <section className="lp-section">
          <motion.div {...reveal()}>
            <h2>Where this prototype stands</h2>
            <p className="lp-lead">Test networks only. No real funds.</p>
          </motion.div>
          <div className="lp-status">
            <motion.div {...reveal(0.05)}>
              <h3>Working</h3>
              <ul>
                <li>Wallet creation on Bitcoin, Ethereum and Solana</li>
                <li>Passkey sign-in and device approval</li>
                <li>Recovery on a new device</li>
                <li>Bank checks on transfers (simulated)</li>
              </ul>
            </motion.div>
            <motion.div {...reveal(0.1)}>
              <h3>Next</h3>
              <ul>
                <li>Real transactions on the three networks</li>
                <li>Sign-in with the bank account</li>
                <li>Network fees paid by the bank</li>
              </ul>
            </motion.div>
          </div>
        </section>

        <section className="lp-final">
          <motion.div {...reveal()}>
            <h2>See it running.</h2>
            <a className="lp-btn" href="#app">
              Open the app <ArrowRight size={16} aria-hidden="true" />
            </a>
          </motion.div>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="lp-mark">creeps</span>
        <p>Prototype built for the Swissquote Wallet Challenge. Not an official Swissquote product. Test networks only.</p>
      </footer>
    </div>
  )
}
