import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, Check, Eye, EyeOff, Fingerprint, Loader2, LogOut } from 'lucide-react'
import { Field, Wordmark } from '../Panels'
import { passcodeProblem } from './flows'
import { useAccess } from './AccessProvider'
import { PendingRequests } from './PasskeyRequest'

/* Écrans affichés tant que le wallet n'est pas prêt sur cet appareil. Chaque écran a une seule tâche et un seul bouton principal. */

const emailOk = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim())
const MIN_BANK_PASSWORD = 10

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-brand">
        <Wordmark />
        <h1>Self-custody, with a bank behind it.</h1>
        <ul>
          <li>Your key is never in one place</li>
          <li>The bank can refuse a transfer, never sign one</li>
          <li>Recover your wallet without a seed phrase</li>
        </ul>
      </aside>
      <main className="auth-card" id="main">
        {children}
      </main>
    </div>
  )
}

function Notice() {
  const a = useAccess()
  if (!a.error && a.cooldownLeft === 0) return null
  return (
    <div className="stack" aria-live="polite">
      {a.error && (
        <p className="hint" role="alert">
          {a.error.message}
        </p>
      )}
      {a.cooldownLeft > 0 && <p className="dim">Pausing for {a.cooldownLeft} s so we do not overload the service.</p>}
    </div>
  )
}

function Working() {
  const a = useAccess()
  if (!a.busy) return null
  return (
    <p className="dim" role="status">
      <Loader2 size={15} className="spin" aria-hidden="true" /> {a.busy}…
    </p>
  )
}

const STEP_LABEL: Record<string, string> = {
  wallets: 'Creating your wallets on three networks',
  bank: 'Swissquote prepares your passkey',
  passkey: 'Creating the passkey on this device (fingerprint, face or screen lock)',
  confirm: 'Swissquote registers your passkey',
}

function Steps({ order }: { order: string[] }) {
  const a = useAccess()
  if (!a.busy) return null
  const at = a.step ? order.indexOf(a.step) : -1
  return (
    <ol className="timeline" aria-label="Progress">
      {order.map((s, i) => (
        <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>
          <span className="tick">{i < at ? <Check size={12} aria-hidden="true" /> : i + 1}</span>
          {STEP_LABEL[s]}
        </li>
      ))}
    </ol>
  )
}

function SignOutLink({ label = 'Use a different account' }: { label?: string }) {
  const a = useAccess()
  return (
    <button type="button" className="linklike" onClick={() => void a.signOut()} disabled={!!a.busy}>
      <LogOut size={14} aria-hidden="true" /> {label}
    </button>
  )
}

/** Champ secret avec un bouton pour le montrer ou le cacher: indispensable sur téléphone, où l'on tape à l'aveugle. */
function SecretField({
  label,
  name,
  value,
  onChange,
  autoComplete,
  invalid,
  autoFocus,
  enterKeyHint,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  invalid?: boolean
  autoFocus?: boolean
  enterKeyHint?: 'go' | 'next' | 'done'
}) {
  const [shown, setShown] = useState(false)
  const what = label.split(' (')[0].toLowerCase()
  return (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      <div className="pw">
        <input
          id={`f-${name}`}
          type={shown ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          enterKeyHint={enterKeyHint}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          className="has-toggle"
        />
        <button type="button" className="icon pw-toggle" onClick={() => setShown(!shown)} aria-label={shown ? `Hide ${what}` : `Show ${what}`} aria-pressed={shown}>
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SignIn() {
  const a = useAccess()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const blocked = !!a.busy || a.cooldownLeft > 0
  const register = mode === 'register'
  const passwordOk = register ? password.length >= MIN_BANK_PASSWORD : password.length > 0
  const emailBad = touched && !emailOk(email)
  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (emailOk(email) && passwordOk) void a.signIn(mode, email, password)
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <h2>{register ? 'Create a test account' : 'Sign in'}</h2>
      <p className="dim">
        {register ? 'Prototype only: this creates a test account on our bank server.' : 'Use your Swissquote account. Your keys stay under your control.'}
      </p>
      <div className="field">
        <label htmlFor="f-email">Email</label>
        <input
          id="f-email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="name@example.ch"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailBad}
          aria-describedby={emailBad ? 'email-error' : undefined}
        />
        {emailBad && (
          <p id="email-error" className="hint">
            Enter the email of your account.
          </p>
        )}
      </div>
      <SecretField
        label={register ? `Password (${MIN_BANK_PASSWORD} characters minimum)` : 'Password'}
        name="bank-password"
        value={password}
        onChange={setPassword}
        autoComplete={register ? 'new-password' : 'current-password'}
        invalid={touched && !passwordOk}
        enterKeyHint="go"
      />
      {touched && !passwordOk && <p className="hint">{register ? `Use at least ${MIN_BANK_PASSWORD} characters.` : 'Enter your password.'}</p>}
      <button className="btn btn-block" type="submit" disabled={blocked}>
        {register ? 'Create the account' : 'Continue with Swissquote'}
      </button>
      {!register && (
        <button type="button" className="btn ghost btn-block" onClick={() => void a.signInWithPasskey()} disabled={blocked}>
          <Fingerprint size={16} aria-hidden="true" /> Sign in with a passkey
        </button>
      )}
      <button
        type="button"
        className="linklike"
        onClick={() => {
          setMode(register ? 'login' : 'register')
          setTouched(false)
        }}
      >
        {register ? 'I already have an account' : 'Create a test account'}
      </button>
      <Working />
      <Notice />
      <p className="fine">Prototype: the bank here is our own test server, standing in for the Swissquote login. In production this step opens Swissquote's login.</p>
    </form>
  )
}

/** Appareil neuf: le compte doit l'approuver par le lien reçu par e-mail. La page se met à jour toute seule. */
function ApproveDevice() {
  const a = useAccess()
  const [link, setLink] = useState('')
  const [hint, setHint] = useState<string | null>(null)

  async function pasteAndApprove() {
    setHint(null)
    let text = ''
    try {
      text = (await navigator.clipboard.readText()).trim()
    } catch {
      setHint('This browser did not let us read the clipboard. Paste the link in the box below.')
      return
    }
    if (!text) {
      setHint('Nothing is copied yet. In the email, press and hold the link, then choose Copy.')
      return
    }
    await a.approveFromLink(text)
  }

  return (
    <div className="stack">
      <h2>Approve this device</h2>
      <p className="dim">
        This is a new device for your account. We sent an approval email to <b>{a.email}</b>.
      </p>
      <ol className="steps">
        <li>
          <b>Open the email</b> on this device.
        </li>
        <li>
          <b>Tap the approval link.</b> It must open in this browser, then this page continues by itself.
        </li>
        <li>
          <b>The link opened in another app?</b> Copy it, then tap <b>Paste approval link</b> below.
        </li>
      </ol>
      {a.approvalFailed && (
        <p className="hint" role="alert">
          This link has expired or was already used. Use “Get a new approval email” below.
        </p>
      )}
      <div className="stack">
        <button className="btn btn-block" onClick={() => void pasteAndApprove()} disabled={!!a.busy}>
          Paste approval link
        </button>
        <button className="btn ghost btn-block" onClick={() => void a.refresh()} disabled={!!a.busy}>
          I already tapped the link
        </button>
      </div>
      {hint && (
        <p className="hint" role="status">
          {hint}
        </p>
      )}
      <details className="manual">
        <summary>Paste the link by hand</summary>
        <Field label="Approval link">
          <input name="approval-link" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>
        <button className="btn ghost btn-block" disabled={!link.trim() || !!a.busy} onClick={() => void a.approveFromLink(link.trim())}>
          Approve with this link
        </button>
      </details>
      <Working />
      <Notice />
      <SignOutLink label="Get a new approval email" />
    </div>
  )
}

function LegacyAccount() {
  return (
    <div className="stack">
      <h2>This account cannot be opened here</h2>
      <p className="dim">
        It still holds a passkey that an earlier version of this prototype registered with the wallet service. Passkeys are now managed by Swissquote, so that one
        can no longer be used. Sign out and use a new test account.
      </p>
      <Notice />
      <SignOutLink />
    </div>
  )
}

function Onboarding() {
  return (
    <div className="stack">
      <h2>One more step</h2>
      <p className="dim">The wallet service needs one more verification before it opens this wallet. Sign out and sign in again to continue.</p>
      <Notice />
      <SignOutLink />
    </div>
  )
}

function CreateWallet() {
  const a = useAccess()
  const [pass, setPass] = useState('')
  const [again, setAgain] = useState('')
  const [ack, setAck] = useState(false)
  const problem = pass || again ? passcodeProblem(pass, again) : null
  const ready = !passcodeProblem(pass, again) && ack && !a.busy && a.cooldownLeft === 0
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) void a.createWallet(pass)
      }}
    >
      <h2>Create your wallet</h2>
      <p className="dim">
        Your passcode protects your part of the key on this device. Swissquote never sees it. Next, you add a passkey (fingerprint, face or screen lock): it signs you in
        and approves your transfers.
      </p>
      <SecretField label="Passcode (8 characters minimum)" name="passcode" value={pass} onChange={setPass} autoComplete="new-password" invalid={!!problem && !!pass} />
      <SecretField label="Repeat the passcode" name="passcode-confirm" value={again} onChange={setAgain} autoComplete="new-password" invalid={!!problem && !!again} />
      {problem && <p className="hint">{problem}</p>}
      <ul className="checks">
        <li className="warn">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>If you lose your passcode, nobody can recover your wallet, including Swissquote.</span>
        </li>
      </ul>
      <label className="switch-row">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand, and I will keep my passcode safe
      </label>
      <button className="btn btn-block" type="submit" disabled={!ready}>
        Create my wallet
      </button>
      <PendingRequests canContinue />
      <Steps order={['wallets', 'bank', 'passkey', 'confirm']} />
      <Working />
      <Notice />
      <SignOutLink />
    </form>
  )
}

function Unlock() {
  const a = useAccess()
  const [pass, setPass] = useState('')
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (pass) void a.unlock(pass)
      }}
    >
      <h2>Unlock your wallet</h2>
      <p className="dim">Your wallet is on this device. Enter your passcode to open it.</p>
      <SecretField label="Passcode" name="passcode" value={pass} onChange={setPass} autoComplete="current-password" autoFocus enterKeyHint="go" />
      <button className="btn btn-block" type="submit" disabled={!pass || !!a.busy || a.cooldownLeft > 0}>
        Unlock
      </button>
      <Working />
      <Notice />
      <SignOutLink />
    </form>
  )
}

export function AccessScreens() {
  const a = useAccess()
  const screen = {
    signed_out: <SignIn />,
    device_approval: <ApproveDevice />,
    mfa_required: <LegacyAccount />,
    onboarding: <Onboarding />,
    no_wallet: <CreateWallet />,
    locked: <Unlock />,
    ready: null,
  }[a.snapshot.state]
  return <Frame>{screen}</Frame>
}
