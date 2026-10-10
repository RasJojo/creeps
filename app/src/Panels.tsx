import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { chf, qtyFmt, randomHex, when, type Reg, type Row } from './data'

type Notify = (msg: string) => void

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

export function History({ rows, prices, notify }: { rows: Row[]; prices: Record<string, number>; notify: Notify }) {
  const KINDS = ['All', 'Deposit', 'Withdrawal', 'Swap', 'Transfer', 'Fee'] as const
  const [kind, setKind] = useState<(typeof KINDS)[number]>('All')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const flow = useMemo(() => {
    const m = new Map<string, number>()
    let bal = 0
    for (const r of [...rows].reverse()) {
      bal += r.qty * prices[r.sym]
      m.set(r.id, bal)
    }
    return m
  }, [rows, prices])

  const shown = rows.filter(
    (r) =>
      (kind === 'All' || r.kind === kind) &&
      (q === '' || `${r.id} ${r.sym} ${r.note} ${r.hash}`.toLowerCase().includes(q.toLowerCase())),
  )

  function exportCsv() {
    const head = 'id,date,type,asset,quantity,note,status,hash'
    const body = shown.map((r) =>
      [r.id, new Date(r.ts).toISOString(), r.kind, r.sym, r.qty.toFixed(6), `"${r.note}"`, r.status, r.hash].join(','),
    )
    const blob = new Blob([[head, ...body].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'creeps-transaction-history.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    notify(`Exported ${shown.length} entries to CSV`)
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="chips" role="tablist" aria-label="Filter by entry type">
          {KINDS.map((k) => (
            <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, asset or note" />
        </label>
        <button className="btn ghost" onClick={exportCsv}>
          <Download size={15} /> Export CSV
        </button>
      </div>

      <div className="panel flush">
        <div className="scroll-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th className="r">Amount</th>
                <th className="r">Value</th>
                <th className="r">Net flow</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const val = r.qty * prices[r.sym]
                return (
                  <FragmentRow key={r.id}>
                    <tr className={open === r.id ? 'open' : ''} onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td className="num dim">{when(r.ts)}</td>
                      <td className="num">{r.id}</td>
                      <td>
                        <b>{r.kind}</b> <span className="dim">{r.note}</span>
                      </td>
                      <td className={`r num ${r.qty >= 0 ? 'pos' : 'neg'}`}>
                        {r.qty >= 0 ? '+' : ''}
                        {qtyFmt(r.qty, r.sym)} {r.sym}
                      </td>
                      <td className="r num">{chf(val)}</td>
                      <td className="r num dim">{chf(flow.get(r.id) ?? 0)}</td>
                      <td>
                        <span className={`pill ${r.status === 'Settled' ? 'ok' : r.status === 'Pending' ? 'warn' : 'info'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="detail">
                        <td colSpan={7}>
                          <div className="detail-grid">
                            <div>
                              <span className="dim">Transaction hash</span>
                              <code>{r.hash}</code>
                            </div>
                            <div>
                              <span className="dim">Signers</span>
                              <span>{r.status === 'Settled' ? '2 of 3 approved' : 'Waiting for approvals'}</span>
                            </div>
                            <div>
                              <span className="dim">Price at view</span>
                              <span className="num">{chf(prices[r.sym])}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                )
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty pad">No entries match. Clear the search or pick another type.</p>}
        </div>
      </div>
    </div>
  )
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="switch" onClick={() => onChange(!on)}>
      <span className={`track ${on ? 'on' : ''}`}>
        <i />
      </span>
      <span className="grow">
        {label}
        {hint && (
          <>
            <br />
            <span className="dim">{hint}</span>
          </>
        )}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* IDs and passwords                                                   */
/* ------------------------------------------------------------------ */

function buildMembers(reg: Reg, ownerName: string) {
  const owner = { id: 'USR-1041', name: ownerName, role: 'Owner', passkey: true, pw: true, mfa: true, last: 'Just now' }
  const others = reg.people.map((p, i) => ({
    id: `USR-${1042 + i * 7}`,
    name: p.name,
    role: p.role,
    passkey: i % 3 !== 2,
    pw: i % 2 === 0,
    mfa: i % 3 !== 2,
    last: ['1 h ago', 'Yesterday', '4 days ago'][i % 3],
  }))
  return [owner, ...others]
}

export function strength(p: string) {
  const checks = [p.length >= 12, /[a-z]/.test(p), /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)]
  const score = checks.filter(Boolean).length
  return { score, label: ['Too short', 'Weak', 'Weak', 'Fair', 'Strong', 'Very strong'][p ? score : 0] }
}

export function generatePassword() {
  const set = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_'
  const b = new Uint32Array(20)
  crypto.getRandomValues(b)
  return Array.from(b, (n) => set[n % set.length]).join('')
}

export function Access({ notify, reg, owner }: { notify: Notify; reg: Reg; owner: string }) {
  const [members, setMembers] = useState(() => buildMembers(reg, owner))
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [sessions, setSessions] = useState([
    { id: 1, dev: 'Chrome on Windows', loc: 'Geneva, CH', now: true },
    { id: 2, dev: 'Safari on iPhone', loc: 'Zürich, CH', now: false },
    { id: 3, dev: 'Firefox on macOS', loc: 'Lugano, CH', now: false },
  ])
  const [pol, setPol] = useState({ passkeyTx: true, mfaAll: true, idle: false })
  const st = strength(pw)
  const ok = st.score >= 4 && pw === pw2

  return (
    <div className="cols">
      <div className="stack">
        <div className="panel idcard">
          <div>
            <span className="dim">Entity ID</span>
            <div className="big num">{reg.entityId}</div>
          </div>
          <div>
            <span className="dim">Verification</span>
            <div className={`verified ${reg.status === 'Active' ? '' : 'wait'}`}>
              <ShieldCheck size={16} /> {reg.status === 'Active' ? 'Verified by compliance' : 'In compliance review'}
            </div>
          </div>
          <div>
            <span className="dim">Signing rule</span>
            <div>{reg.policy.approvers} approver{reg.policy.approvers > 1 ? 's' : ''} per transfer</div>
          </div>
        </div>

        <div className="panel flush">
          <div className="scroll-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>ID</th>
                  <th>Sign-in methods</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>{m.name}</b>
                      <br />
                      <span className="dim">{m.role}</span>
                    </td>
                    <td className="num">{m.id}</td>
                    <td>
                      <span className={`pill ${m.passkey ? 'ok' : 'off'}`}>Passkey</span>{' '}
                      <span className={`pill ${m.pw ? 'ok' : 'off'}`}>Password</span>{' '}
                      <span className={`pill ${m.mfa ? 'ok' : 'warn'}`}>{m.mfa ? '2-step on' : '2-step off'}</span>
                    </td>
                    <td className="dim">{m.last}</td>
                    <td className="r">
                      <button
                        className="btn ghost sm"
                        onClick={() => {
                          setMembers(members.map((x) => (x.id === m.id ? { ...x, pw: true } : x)))
                          notify(`Reset link sent to ${m.name}`)
                        }}
                      >
                        Send reset link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel stack">
          <h2>Active sessions</h2>
          <ul className="sessions">
            <AnimatePresence>
              {sessions.map((s) => (
                <motion.li key={s.id} layout exit={{ opacity: 0, height: 0 }}>
                  <span>
                    <b>{s.dev}</b> <span className="dim">· {s.loc}</span>
                  </span>
                  {s.now ? (
                    <span className="pill ok">This device</span>
                  ) : (
                    <button
                      className="btn ghost sm"
                      onClick={() => {
                        setSessions(sessions.filter((x) => x.id !== s.id))
                        notify('Session signed out')
                      }}
                    >
                      Sign out
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>

      <div className="stack">
        <div className="panel stack">
          <h2>Change password</h2>
          <Field label="New password">
            <div className="pw">
              <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
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
            <input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
          {pw2 && pw !== pw2 && <p className="hint">The two passwords differ.</p>}
          <div className="row gap">
            <button
              className="btn ghost"
              onClick={() => {
                const g = generatePassword()
                setPw(g)
                setPw2(g)
                setShow(true)
              }}
            >
              <RefreshCw size={15} /> Generate
            </button>
            <button
              className="btn"
              disabled={!ok}
              onClick={() => {
                setPw('')
                setPw2('')
                notify('Password updated. Other sessions were signed out.')
              }}
            >
              Save password
            </button>
          </div>
        </div>

        <div className="panel stack">
          <h2>Sign-in rules</h2>
          <Switch on={pol.passkeyTx} onChange={(v) => setPol({ ...pol, passkeyTx: v })} label="Passkey required to approve transfers" hint="Fingerprint, face or device PIN" />
          <Switch on={pol.mfaAll} onChange={(v) => setPol({ ...pol, mfaAll: v })} label="Two-step sign-in for everyone" hint="Applies to everyone on the account" />
          <Switch on={pol.idle} onChange={(v) => setPol({ ...pol, idle: v })} label="Sign out after 10 minutes idle" />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Secret key vault                                                    */
/* ------------------------------------------------------------------ */

type Phase = 'idle' | 'verify' | 'approvals' | 'cooling' | 'ready' | 'revealed'
const REASONS = ['Disaster recovery drill', 'Moving to another custody provider', 'Regulator or auditor request', 'Lost access to every signer']
const VSTEPS = ['Request', 'Verify', 'Approvals', 'Cooling-off', 'Reveal']
const phaseIndex: Record<Phase, number> = { idle: 0, verify: 1, approvals: 2, cooling: 3, ready: 4, revealed: 4 }
const REVEAL_SECONDS = 30
const COOL_SECONDS = 8

function Scramble({ text }: { text: string }) {
  const [out, setOut] = useState(() => text.replace(/\S/g, '•'))
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i += 2
      setOut(
        text
          .split('')
          .map((c, k) => (c === ' ' || k < i ? c : '0123456789abcdef'[Math.floor(Math.random() * 16)]))
          .join(''),
      )
      if (i >= text.length) clearInterval(id)
    }, 30)
    return () => clearInterval(id)
  }, [text])
  return <>{out}</>
}

export function Vault({ notify, owner, approvers }: { notify: Notify; owner: string; approvers: [string, string][] }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState('')
  const [pw, setPw] = useState('')
  const [pk, setPk] = useState<'no' | 'checking' | 'yes'>('no')
  const [appr, setAppr] = useState([false, false])
  const [cool, setCool] = useState(COOL_SECONDS)
  const [secret, setSecret] = useState('')
  const [left, setLeft] = useState(REVEAL_SECONDS)
  const [log, setLog] = useState<{ t: number; msg: string }[]>([
    { t: Date.now() - 86400000 * 9, msg: `Request by ${owner}: disaster recovery drill. Key viewed for 30 s.` },
    { t: Date.now() - 86400000 * 31, msg: `Request by ${approvers[0][0]} cancelled before approval.` },
  ])
  const addLog = (msg: string) => setLog((l) => [{ t: Date.now(), msg }, ...l])

  function reset(why?: string) {
    setSecret('')
    setPhase('idle')
    setPw('')
    setPk('no')
    setAppr([false, false])
    setCool(COOL_SECONDS)
    setLeft(REVEAL_SECONDS)
    if (why) addLog(why)
  }

  // approvals arrive one after another
  useEffect(() => {
    if (phase !== 'approvals') return
    const a = setTimeout(() => setAppr((x) => [true, x[1]]), 2200)
    const b = setTimeout(() => setAppr((x) => [x[0], true]), 4600)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [phase])

  useEffect(() => {
    if (phase === 'approvals' && appr.every(Boolean)) {
      const t = setTimeout(() => {
        setPhase('cooling')
        setCool(COOL_SECONDS)
        addLog('Both approvers confirmed. Cooling-off period started.')
      }, 800)
      return () => clearTimeout(t)
    }
  }, [phase, appr])

  useEffect(() => {
    if (phase !== 'cooling') return
    if (cool <= 0) {
      setPhase('ready')
      return
    }
    const t = setTimeout(() => setCool((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, cool])

  useEffect(() => {
    if (phase !== 'revealed') return
    if (left <= 0) {
      reset('Key hidden automatically after 30 s.')
      return
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, left])

  useEffect(() => {
    const onHide = () => {
      if (document.hidden && phase === 'revealed') reset('Key hidden because the tab lost focus.')
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // never leave the key behind if the person navigates away
  useEffect(() => () => setSecret(''), [])

  function reveal() {
    const h = randomHex(64)
    setSecret(h.match(/.{8}/g)!.join(' '))
    setLeft(REVEAL_SECONDS)
    setPhase('revealed')
    addLog(`Key revealed to ${owner} for 30 s.`)
  }

  function verifyPasskey() {
    setPk('checking')
    setTimeout(() => setPk('yes'), 1100)
  }

  const idx = phaseIndex[phase]

  return (
    <div className="vault">
      <ol className="vsteps">
        {VSTEPS.map((s, i) => (
          <li key={s} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
            <span className="tick">{i < idx ? <Check size={12} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <div className="vault-body">
        <div className="vault-main">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="stack"
            >
              {phase === 'idle' && (
                <>
                  <h2>Request your secret key</h2>
                  <p>
                    Your key controls the whole wallet, so it is never shown on demand. A request needs your password and passkey, sign-off from two
                    other approvers, and a waiting period. Then the key shows once, for 30 seconds.
                  </p>
                  <Field label="Why do you need it?">
                    <select value={reason} onChange={(e) => setReason(e.target.value)}>
                      {REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Add a note for the approvers">
                    <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What will you do with it, and who is with you?" />
                  </Field>
                  <button
                    className="btn glow"
                    disabled={note.trim().length < 10}
                    onClick={() => {
                      setPhase('verify')
                      addLog(`Request by ${owner}: ${reason.toLowerCase()}.`)
                    }}
                  >
                    Request key
                  </button>
                  {note.trim().length < 10 && <p className="hint">Write at least 10 characters so approvers know why.</p>}
                </>
              )}

              {phase === 'verify' && (
                <>
                  <h2>Confirm it is you</h2>
                  <Field label="Account password">
                    <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
                  </Field>
                  <button className="btn ghost" onClick={verifyPasskey} disabled={pk !== 'no'}>
                    {pk === 'checking' ? <Loader2 size={16} className="spin" /> : pk === 'yes' ? <Check size={16} /> : <Fingerprint size={16} />}
                    {pk === 'yes' ? 'Passkey confirmed' : pk === 'checking' ? 'Waiting for your device…' : 'Confirm with passkey'}
                  </button>
                  <div className="row gap">
                    <button className="btn glow" disabled={pw.length < 8 || pk !== 'yes'} onClick={() => setPhase('approvals')}>
                      Send to approvers
                    </button>
                    <button className="btn ghost" onClick={() => reset('Request cancelled before approval.')}>
                      Cancel
                    </button>
                  </div>
                  {(pw.length < 8 || pk !== 'yes') && <p className="hint">Enter your password (8+ characters) and confirm with your passkey.</p>}
                </>
              )}

              {phase === 'approvals' && (
                <>
                  <h2>Waiting for two approvers</h2>
                  <ul className="approvers">
                    {approvers.map(([n, r], i) => (
                      <li key={n} className={appr[i] ? 'yes' : ''}>
                        <span className="avatar sm">{n.slice(0, 1)}</span>
                        <span className="grow">
                          <b>{n}</b>
                          <br />
                          <span className="dim">{r}</span>
                        </span>
                        {appr[i] ? (
                          <span className="pill ok">
                            <Check size={12} /> Approved
                          </span>
                        ) : (
                          <span className="pill wait">
                            <Loader2 size={12} className="spin" /> Reviewing
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="dim">In the demo, approvals arrive within a few seconds.</p>
                  <button className="btn ghost fit" onClick={() => reset('Request cancelled while waiting for approvers.')}>
                    Cancel request
                  </button>
                </>
              )}

              {phase === 'cooling' && (
                <>
                  <h2>Cooling-off period</h2>
                  <p>A short wait gives the team time to stop the request if it was not you. A real vault would use 24 hours; the demo uses {COOL_SECONDS} seconds.</p>
                  <div className="ring">
                    <svg viewBox="0 0 120 120" aria-hidden>
                      <circle cx="60" cy="60" r="52" className="ring-bg" />
                      <circle cx="60" cy="60" r="52" className="ring-fg" style={{ strokeDashoffset: 327 * (1 - (COOL_SECONDS - cool) / COOL_SECONDS) }} />
                    </svg>
                    <span className="num">{cool}s</span>
                  </div>
                  <button className="btn ghost fit" onClick={() => reset('Request cancelled during cooling-off.')}>
                    Stop the request
                  </button>
                </>
              )}

              {phase === 'ready' && (
                <>
                  <h2>Ready when you are</h2>
                  <p>The key will appear once and hide itself after 30 seconds, or sooner if you switch tabs. Make sure nobody can see your screen.</p>
                  <div className="row gap">
                    <button className="btn glow" onClick={reveal}>
                      Show key for 30 seconds
                    </button>
                    <button className="btn ghost" onClick={() => reset('Request closed without viewing the key.')}>
                      Not now
                    </button>
                  </div>
                </>
              )}

              {phase === 'revealed' && (
                <>
                  <h2>Your secret key</h2>
                  <div className="secret num" aria-live="off">
                    <Scramble text={secret} />
                  </div>
                  <div className="burn" aria-label={`${left} seconds left`}>
                    <i style={{ width: `${(left / REVEAL_SECONDS) * 100}%` }} />
                  </div>
                  <p className="dim">{left} seconds left. This demo key is made in your browser and is not linked to any funds.</p>
                  <div className="row gap">
                    <button
                      className="btn ghost"
                      onClick={() => {
                        navigator.clipboard?.writeText(secret.replace(/ /g, ''))
                        setTimeout(() => navigator.clipboard?.writeText(' '), 20000)
                        addLog('Key copied to clipboard. Clipboard clears after 20 s.')
                        notify('Copied. Your clipboard clears in 20 seconds.')
                      }}
                    >
                      <Copy size={15} /> Copy
                    </button>
                    <button className="btn glow" onClick={() => reset(`Key hidden by ${owner}.`)}>
                      <Trash2 size={15} /> Hide now
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="vault-log">
          <h3>
            <FileText size={15} /> Audit trail
          </h3>
          <ul>
            <AnimatePresence initial={false}>
              {log.map((l) => (
                <motion.li key={l.t + l.msg} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
                  <span className="num dim">{when(l.t)}</span>
                  {l.msg}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </aside>
      </div>
    </div>
  )
}


/* ------------------------------------------------------------------ */
/* Shared: wordmark                                                    */
/* ------------------------------------------------------------------ */

export function Wordmark() {
  return (
    <div className="wordmark">
      <span>creeps</span>
      <svg viewBox="0 0 120 14" aria-hidden>
        <motion.path
          d="M2 9 C 20 2, 30 13, 48 7 S 80 2, 96 8 S 112 11, 118 5"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: 'easeInOut' }}
        />
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Registration summary (shown in the profile)                         */
/* ------------------------------------------------------------------ */

export function Registration({ reg }: { reg: Reg }) {
  return (
    <div className="stack">
      <div className="panel stack">
        <div className="row between">
          <h2>Your registration</h2>
          <span className={`pill ${reg.status === 'Active' ? 'ok' : 'warn'}`}>{reg.status}</span>
        </div>
        <dl className="review">
          <dt>Application ID</dt>
          <dd className="num">{reg.entityId}</dd>
          <dt>Legal name</dt>
          <dd>{reg.legal}</dd>
          <dt>Entity</dt>
          <dd>
            {reg.type} · {reg.country}
          </dd>
          <dt>Registration no.</dt>
          <dd className="num">{reg.reg}</dd>
          {reg.lei && (
            <>
              <dt>LEI</dt>
              <dd className="num">{reg.lei}</dd>
            </>
          )}
          <dt>Account email</dt>
          <dd>{reg.email}</dd>
        </dl>
      </div>

      <div className="cols">
        <div className="panel stack">
          <h2>Authorised people</h2>
          <ul className="people">
            {reg.people.map((p) => (
              <li key={p.email}>
                <span className="avatar sm">{p.name.slice(0, 1)}</span>
                <span>
                  <b>{p.name}</b>
                  <br />
                  <span className="dim">
                    {p.email} · {p.role}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="stack">
          <div className="panel stack">
            <h2>Documents</h2>
            <ul className="docs">
              {reg.docs.map((d) => (
                <li key={d.title}>
                  <Check size={15} />
                  <span>
                    <b>{d.title}</b>
                    <br />
                    <span className="dim">{d.file}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel stack">
            <h2>Spending rules</h2>
            <dl className="review">
              <dt>Approvals</dt>
              <dd>{reg.policy.approvers} per transfer</dd>
              <dt>Daily limit</dt>
              <dd className="num">{chf(reg.policy.limit)}</dd>
              <dt>New addresses</dt>
              <dd>{reg.policy.lockH} h time-lock</dd>
              <dt>Recipients</dt>
              <dd>{reg.policy.whitelistOnly ? 'Approved addresses only' : 'Any address'}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

