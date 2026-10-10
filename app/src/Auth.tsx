import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Eye, EyeOff, Fingerprint, Loader2, Plus, RefreshCw, Upload, X } from 'lucide-react'
import { DEMO_REG, DOCS, PHASES, chf, type Person, type Reg } from './data'
import { Field, Switch, Wordmark, generatePassword, strength } from './Panels'

const emailOk = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim())

export function Auth({ onEnter }: { onEnter: (r: Reg) => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  return (
    <div className="auth">
      <aside className="auth-brand">
        <Wordmark />
        <h1>Hold digital assets the way a treasury should.</h1>
        <ul>
          <li>Your keys stay with your team, never with us</li>
          <li>Every transfer needs the approvals you set</li>
          <li>One history your auditors can read</li>
        </ul>
      </aside>

      <main className="auth-card">
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>
            Sign in
          </button>
          <button role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>
            Create account
          </button>
        </div>
        {mode === 'in' ? <SignIn onEnter={onEnter} /> : <Register onDone={onEnter} />}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SignIn({ onEnter }: { onEnter: (r: Reg) => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [pk, setPk] = useState(false)

  function submit(e: { preventDefault: () => void }) {
    e.preventDefault()
    if (!emailOk(email)) return setErr('Enter the email you registered with.')
    if (pw.length < 8) return setErr('Passwords have at least 8 characters.')
    onEnter({ ...DEMO_REG, email: email.trim() })
  }

  function passkey() {
    if (!emailOk(email)) return setErr('Enter your email first, then use your passkey.')
    setErr('')
    setPk(true)
    setTimeout(() => onEnter({ ...DEMO_REG, email: email.trim() }), 1100)
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h2>Welcome back</h2>
      <Field label="Work email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="name@company.ch" />
      </Field>
      <Field label="Password">
        <div className="pw">
          <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          <button type="button" className="icon" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>
      {err && <p className="hint">{err}</p>}
      <button className="btn" type="submit">
        Sign in
      </button>
      <button type="button" className="btn ghost" onClick={passkey} disabled={pk}>
        {pk ? <Loader2 size={16} className="spin" /> : <Fingerprint size={16} />}
        {pk ? 'Waiting for your device…' : 'Sign in with passkey'}
      </button>
      <button type="button" className="linklike" onClick={() => onEnter(DEMO_REG)}>
        Look around with the demo account
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */

const STEPS = ['Account', 'Entity', 'People', 'Documents', 'Rules', 'Review'] as const

function Register({ onDone }: { onDone: (r: Reg) => void }) {
  const [step, setStep] = useState(0)
  const [acc, setAcc] = useState({ email: '', pw: '', pw2: '' })
  const [show, setShow] = useState(false)
  const [f, setF] = useState({ legal: '', type: 'Company', country: 'Switzerland', reg: '', lei: '' })
  const [people, setPeople] = useState<Person[]>([])
  const [np, setNp] = useState<Person>({ name: '', email: '', role: 'Authorised signatory' })
  const [docs, setDocs] = useState<Record<string, { name: string; pct: number } | undefined>>({})
  const [pol, setPol] = useState({ limit: 500000, approvers: 2, whitelistOnly: true, lockH: 24 })
  const [submitted, setSubmitted] = useState(false)
  const [phase, setPhase] = useState(0)
  const [msg, setMsg] = useState('')
  const entityId = useRef(`CRP-${Math.floor(100000 + Math.random() * 900000)}`)
  const st = strength(acc.pw)

  const issues: string[][] = [
    [
      ...(!emailOk(acc.email) ? ['Enter a valid work email'] : []),
      ...(st.score < 4 ? ['Choose a stronger password'] : []),
      ...(acc.pw !== acc.pw2 ? ['Repeat the same password'] : []),
    ],
    [
      ...(f.legal.trim().length < 3 ? ['Enter the legal name'] : []),
      ...(f.reg.trim().length < 4 ? ['Enter the registration number'] : []),
    ],
    people.length < 2 ? [`Add ${2 - people.length} more authorised ${people.length === 1 ? 'person' : 'people'}`] : [],
    DOCS.filter((d) => !docs[d] || docs[d]!.pct < 100).map((d) => `Upload: ${d}`),
    [],
    [],
  ]
  const blocking = issues[step]

  function addPerson() {
    if (np.name.trim().length < 2 || !emailOk(np.email)) {
      setMsg('Enter a name and a valid email address for this person.')
      return
    }
    setMsg('')
    setPeople((p) => [...p, np])
    setNp({ name: '', email: '', role: 'Authorised signatory' })
  }

  function upload(doc: string, file?: File) {
    if (!file) return
    setDocs((d) => ({ ...d, [doc]: { name: file.name, pct: 0 } }))
    const id = setInterval(() => {
      setDocs((d) => {
        const cur = d[doc]
        if (!cur) {
          clearInterval(id)
          return d
        }
        const pct = Math.min(100, cur.pct + 12 + Math.random() * 18)
        if (pct >= 100) clearInterval(id)
        return { ...d, [doc]: { ...cur, pct } }
      })
    }, 180)
  }

  function submit() {
    setSubmitted(true)
    setPhase(0)
    let p = 0
    const id = setInterval(() => {
      p += 1
      setPhase(p)
      if (p >= 3) clearInterval(id)
    }, 1400)
  }

  function finish() {
    onDone({
      email: acc.email.trim(),
      legal: f.legal.trim(),
      type: f.type,
      country: f.country,
      reg: f.reg.trim(),
      lei: f.lei.trim(),
      people,
      docs: DOCS.map((d) => ({ title: d, file: docs[d]?.name ?? '' })),
      policy: pol,
      entityId: entityId.current,
      status: 'Active',
    })
  }

  if (submitted) {
    return (
      <div className="stack">
        <h2>Application {entityId.current}</h2>
        <p className="dim">{f.legal} is moving through review. This usually takes a few days; the demo speeds it up.</p>
        <ol className="timeline">
          {PHASES.map((p, i) => (
            <li key={p} className={i < phase || phase === 3 ? 'done' : i === phase ? 'now' : ''}>
              <span className="tick">{i < phase || phase === 3 ? <Check size={14} /> : i === phase ? <Loader2 size={14} className="spin" /> : null}</span>
              {p}
            </li>
          ))}
        </ol>
        {phase >= 3 && (
          <button className="btn glow-light" onClick={finish}>
            Open my dashboard
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="stack">
      <ol className="stepper" aria-label="Registration progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'now' : i < step ? 'done' : ''}>
            <button type="button" onClick={() => i <= step && setStep(i)} disabled={i > step}>
              <span className="tick">{i < step ? <Check size={13} /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.2 }}
          className="stack"
        >
          {step === 0 && (
            <>
              <h2>Create your login</h2>
              <Field label="Work email">
                <input type="email" value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} autoComplete="username" placeholder="name@company.ch" />
              </Field>
              <Field label="Password">
                <div className="pw">
                  <input type={show ? 'text' : 'password'} value={acc.pw} onChange={(e) => setAcc({ ...acc, pw: e.target.value })} autoComplete="new-password" />
                  <button type="button" className="icon" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              <div className="meter" aria-live="polite">
                {[1, 2, 3, 4, 5].map((i) => (
                  <i key={i} className={i <= st.score ? `s${st.score}` : ''} />
                ))}
                <span>{st.label}</span>
              </div>
              <Field label="Repeat password">
                <input type={show ? 'text' : 'password'} value={acc.pw2} onChange={(e) => setAcc({ ...acc, pw2: e.target.value })} autoComplete="new-password" />
              </Field>
              <button
                type="button"
                className="btn ghost fit"
                onClick={() => {
                  const g = generatePassword()
                  setAcc({ ...acc, pw: g, pw2: g })
                  setShow(true)
                }}
              >
                <RefreshCw size={15} /> Generate a strong password
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h2>Who is opening the account?</h2>
              <div className="grid2">
                <Field label="Legal name">
                  <input value={f.legal} onChange={(e) => setF({ ...f, legal: e.target.value })} placeholder="Creeps Treasury AG" />
                </Field>
                <Field label="Entity type">
                  <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                    <option>Company</option>
                    <option>Foundation</option>
                    <option>Fund</option>
                    <option>Family office</option>
                  </select>
                </Field>
                <Field label="Country of registration">
                  <select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
                    <option>Switzerland</option>
                    <option>Liechtenstein</option>
                    <option>Germany</option>
                    <option>Singapore</option>
                  </select>
                </Field>
                <Field label="Registration number">
                  <input value={f.reg} onChange={(e) => setF({ ...f, reg: e.target.value })} placeholder="CHE-123.456.789" />
                </Field>
                <Field label="LEI (optional)">
                  <input value={f.lei} onChange={(e) => setF({ ...f, lei: e.target.value })} placeholder="20 characters" />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Who can approve transfers?</h2>
              <p className="dim">Add at least two people. Each gets their own passkey; nobody shares a login.</p>
              <div className="grid3">
                <Field label="Full name">
                  <input value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
                </Field>
                <Field label="Work email">
                  <input value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} />
                </Field>
                <Field label="Role">
                  <select value={np.role} onChange={(e) => setNp({ ...np, role: e.target.value })}>
                    <option>Authorised signatory</option>
                    <option>Compliance officer</option>
                    <option>Viewer</option>
                  </select>
                </Field>
              </div>
              <button type="button" className="btn ghost fit" onClick={addPerson}>
                <Plus size={15} /> Add person
              </button>
              {msg && <p className="hint">{msg}</p>}
              <ul className="people">
                <AnimatePresence>
                  {people.map((p, i) => (
                    <motion.li key={p.email} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <span className="avatar sm">{p.name.slice(0, 1)}</span>
                      <span>
                        <b>{p.name}</b>
                        <br />
                        <span className="dim">
                          {p.email} · {p.role}
                        </span>
                      </span>
                      <button type="button" className="icon" aria-label={`Remove ${p.name}`} onClick={() => setPeople(people.filter((_, k) => k !== i))}>
                        <X size={15} />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Upload your documents</h2>
              <p className="dim">PDF or image, up to 10 MB each. Files stay in this demo; nothing is sent anywhere.</p>
              <div className="stack">
                {DOCS.map((d) => {
                  const cur = docs[d]
                  return (
                    <label key={d} className={`drop ${cur && cur.pct >= 100 ? 'ok' : ''}`}>
                      <input type="file" hidden onChange={(e) => upload(d, e.target.files?.[0])} />
                      <span className="drop-ico">
                        {cur && cur.pct >= 100 ? <Check size={18} /> : cur ? <Loader2 size={18} className="spin" /> : <Upload size={18} />}
                      </span>
                      <span className="grow">
                        <b>{d}</b>
                        <br />
                        <span className="dim">{cur ? cur.name : 'Click to choose a file'}</span>
                        {cur && cur.pct < 100 && (
                          <span className="bar">
                            <i style={{ width: `${cur.pct}%` }} />
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2>Set the spending rules</h2>
              <p className="dim">These are checked before anything is signed. You can tighten them later, not loosen them without approval.</p>
              <Field label={`Daily limit: ${chf(pol.limit)}`}>
                <input type="range" min={50000} max={2000000} step={50000} value={pol.limit} onChange={(e) => setPol({ ...pol, limit: +e.target.value })} />
              </Field>
              <Field label="Approvals needed per transfer">
                <div className="seg">
                  {[1, 2, 3].map((n) => (
                    <button type="button" key={n} className={pol.approvers === n ? 'on' : ''} onClick={() => setPol({ ...pol, approvers: n })}>
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={`Time-lock on new addresses: ${pol.lockH} hours`}>
                <input type="range" min={0} max={72} step={6} value={pol.lockH} onChange={(e) => setPol({ ...pol, lockH: +e.target.value })} />
              </Field>
              <Switch on={pol.whitelistOnly} onChange={(v) => setPol({ ...pol, whitelistOnly: v })} label="Only send to approved addresses" />
            </>
          )}

          {step === 5 && (
            <>
              <h2>Check and submit</h2>
              <dl className="review">
                <dt>Login</dt>
                <dd>{acc.email}</dd>
                <dt>Entity</dt>
                <dd>
                  {f.legal} · {f.type} · {f.country}
                </dd>
                <dt>Registration</dt>
                <dd>
                  {f.reg}
                  {f.lei && ` · LEI ${f.lei}`}
                </dd>
                <dt>People</dt>
                <dd>{people.map((p) => p.name).join(', ')}</dd>
                <dt>Documents</dt>
                <dd>{DOCS.length} uploaded</dd>
                <dt>Rules</dt>
                <dd>
                  {pol.approvers} approval{pol.approvers > 1 ? 's' : ''} · {chf(pol.limit)} per day · {pol.lockH} h lock
                  {pol.whitelistOnly ? ' · approved addresses only' : ''}
                </dd>
              </dl>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="wizard-foot">
        {blocking.length > 0 ? <p className="hint">To continue: {blocking.join(' · ')}</p> : <span />}
        <div className="row gap">
          {step > 0 && (
            <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn" disabled={blocking.length > 0} onClick={() => setStep(step + 1)}>
              Continue
            </button>
          ) : (
            <button type="button" className="btn" onClick={submit}>
              Submit application
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
