import { useRef, useState, type ComponentProps } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  CreditCard,
  FileCheck2,
  History as HistoryIcon,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { ASSETS, DEMO_REG, chf, nameFromEmail, qtyFmt, randomHex, seedRows, short, START_QTY, useFlash, useLive, when, type Reg, type Row } from './data'
import { Auth } from './Auth'
import { Access, History, Registration, Vault, Wordmark } from './Panels'
import { BuyPanel, Holdings, ReceivePanel, SendPanel } from './Wallet'

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transfer', label: 'Send and receive', icon: ArrowLeftRight },
  { id: 'history', label: 'Transaction history', icon: HistoryIcon },
] as const
type TabId = (typeof NAV)[number]['id'] | 'settings'

const TRANSFER = [
  { id: 'send', label: 'Send', icon: ArrowUpRight },
  { id: 'receive', label: 'Receive', icon: ArrowDownLeft },
  { id: 'buy', label: 'Buy crypto', icon: CreditCard },
] as const
type TransferTab = (typeof TRANSFER)[number]['id']

const PROFILE = [
  { id: 'registration', label: 'Registration', icon: FileCheck2 },
  { id: 'access', label: 'IDs and passwords', icon: KeyRound },
  { id: 'vault', label: 'Secret key', icon: Lock },
] as const
type ProfileTab = (typeof PROFILE)[number]['id']

const TITLES: Record<TabId, string> = {
  overview: 'Overview',
  transfer: 'Send and receive',
  history: 'Transaction history',
  settings: 'Profile and settings',
}

/* ---------- chart ---------- */

function Spark({ data }: { data: number[] }) {
  const W = 640
  const H = 150
  const pad = 8
  const min = Math.min(...data)
  const max = Math.max(...data)
  const x = (i: number) => pad + (i / (data.length - 1)) * (W - pad * 2)
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const last = data[data.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" role="img" aria-label="Portfolio value over the last 90 seconds">
      <path d={`${d} L${x(data.length - 1)} ${H} L${x(0)} ${H} Z`} className="spark-area" />
      <path d={d} className="spark-line" />
      <circle cx={x(data.length - 1)} cy={y(last)} r="9" className="spark-ring" />
      <circle cx={x(data.length - 1)} cy={y(last)} r="4" className="spark-dot" />
    </svg>
  )
}

/* ---------- overview ---------- */

function Overview({
  live,
  qty,
  rows,
  setTab,
  goTransfer,
}: {
  live: ReturnType<typeof useLive>
  qty: Record<string, number>
  rows: Row[]
  setTab: (t: TabId) => void
  goTransfer: (t: TransferTab) => void
}) {
  const { total, hist, prices } = live
  const delta = total - hist[0]
  const flash = useFlash(total)
  const pending = rows.filter((r) => r.status !== 'Settled')
  return (
    <div className="stack">
      <div className="panel hero">
        <div className="hero-top">
          <div>
            <span className="dim">Total held in your institutional wallet</span>
            <div className={`total num flash ${flash}`}>{chf(total)}</div>
            <div className={`delta num ${delta >= 0 ? 'pos' : 'neg'}`}>
              {delta >= 0 ? '+' : ''}
              {chf(delta)} over the chart period
            </div>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => goTransfer('send')}>
              Send <ArrowUpRight size={15} />
            </button>
            <button className="btn ghost" onClick={() => goTransfer('buy')}>
              Buy crypto
            </button>
          </div>
        </div>
        <Spark data={hist} />
        <div className="alloc" aria-label="Allocation by asset">
          {ASSETS.map((a) => (
            <motion.i
              key={a.sym}
              layout
              style={{ background: a.color }}
              animate={{ flexGrow: Math.max(1, ((qty[a.sym] * prices[a.sym]) / total) * 100) }}
              title={a.name}
            />
          ))}
        </div>
        <div className="legend">
          {ASSETS.map((a) => (
            <span key={a.sym}>
              <i style={{ background: a.color }} />
              {a.sym} <span className="num dim">{chf(prices[a.sym])}</span>
            </span>
          ))}
        </div>
      </div>

      <Holdings qty={qty} prices={prices} total={total} />

      <div className="cols">
        <div className="panel stack">
          <h2>Needs your attention</h2>
          {pending.length === 0 ? (
            <p className="empty">Nothing is waiting. New transfers that need approval will appear here.</p>
          ) : (
            <ul className="attn">
              {pending.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <span className={`pill ${r.status === 'Pending' ? 'warn' : 'info'}`}>{r.status}</span>
                  <span>
                    <b>{r.id}</b>{' '}
                    <span className="dim">
                      {r.kind.toLowerCase()} · {r.note}
                    </span>
                  </span>
                  <span className="num">
                    {qtyFmt(Math.abs(r.qty), r.sym)} {r.sym}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button className="btn ghost fit" onClick={() => setTab('history')}>
            Open transaction history
          </button>
        </div>

        <div className="panel stack">
          <h2>Latest entries</h2>
          <ul className="attn">
            {rows.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className="num dim">{when(r.ts)}</span>
                <span>
                  <b>{r.kind}</b> <span className="dim">{r.note}</span>
                </span>
                <span className={`num ${r.qty >= 0 ? 'pos' : 'neg'}`}>
                  {r.qty >= 0 ? '+' : ''}
                  {qtyFmt(r.qty, r.sym)} {r.sym}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/* ---------- send and receive ---------- */

function Transfer({
  tab,
  setTab,
  live,
  qty,
  onSend,
  onBuy,
  notify,
}: {
  tab: TransferTab
  setTab: (t: TransferTab) => void
  live: ReturnType<typeof useLive>
  qty: Record<string, number>
  onSend: ComponentProps<typeof SendPanel>['onSend']
  onBuy: ComponentProps<typeof BuyPanel>['onBuy']
  notify: (m: string) => void
}) {
  return (
    <div className="stack">
      <div className="subtabs" role="tablist" aria-label="Send and receive sections">
        <div>
          {TRANSFER.map((s) => (
            <button key={s.id} role="tab" aria-selected={tab === s.id} className={tab === s.id ? 'on' : ''} onClick={() => setTab(s.id)}>
              <s.icon size={16} /> {s.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {tab === 'send' && <SendPanel qty={qty} prices={live.prices} onSend={onSend} notify={notify} />}
          {tab === 'receive' && <ReceivePanel notify={notify} />}
          {tab === 'buy' && <BuyPanel prices={live.prices} onBuy={onBuy} notify={notify} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ---------- profile and settings ---------- */

function Settings({
  reg,
  owner,
  approvers,
  tab,
  setTab,
  notify,
  onSignOut,
}: {
  reg: Reg
  owner: string
  approvers: [string, string][]
  tab: ProfileTab
  setTab: (t: ProfileTab) => void
  notify: (m: string) => void
  onSignOut: () => void
}) {
  return (
    <div className="stack">
      <div className="panel profile-head">
        <span className="avatar big">{owner.slice(0, 1)}</span>
        <div className="grow">
          <h2>{owner}</h2>
          <span className="dim">
            {reg.email} · {reg.legal}
          </span>
        </div>
        <span className={`pill ${reg.status === 'Active' ? 'ok' : 'warn'}`}>{reg.status}</span>
        <button className="btn ghost" onClick={onSignOut}>
          <LogOut size={15} /> Sign out
        </button>
      </div>

      <div className="subtabs" role="tablist" aria-label="Profile sections">
        <div>
          {PROFILE.map((s) => (
            <button key={s.id} role="tab" aria-selected={tab === s.id} className={tab === s.id ? 'on' : ''} onClick={() => setTab(s.id)}>
              <s.icon size={16} /> {s.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {tab === 'registration' && <Registration reg={reg} />}
          {tab === 'access' && <Access notify={notify} reg={reg} owner={owner} />}
          {tab === 'vault' && <Vault notify={notify} owner={owner} approvers={approvers} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ---------- app ---------- */

export function App() {
  const [reg, setReg] = useState<Reg | null>(null)
  const [tab, setTab] = useState<TabId>('overview')
  const [xTab, setXTab] = useState<TransferTab>('send')
  const [pTab, setPTab] = useState<ProfileTab>('registration')
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState<Record<string, number>>(START_QTY)
  const [rows, setRows] = useState<Row[]>(() => seedRows())
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const nextId = useRef(4822)
  const feed = useLive(qty)

  const notify = (msg: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }

  const goTransfer = (t: TransferTab = xTab) => {
    setXTab(t)
    setTab('transfer')
  }

  const onSend = ({ sym, amt, fee, to, memo }: { sym: string; amt: number; fee: number; to: string; memo: string }) => {
    const id = `TX-${nextId.current++}`
    const hash = '0x' + randomHex(64)
    setQty((q) => ({ ...q, [sym]: q[sym] - amt - fee }))
    setRows((r) => [
      { id, ts: Date.now(), kind: 'Transfer', sym, qty: -amt, note: memo || `To ${short(to)}`, status: 'Pending', hash },
      { id: `TX-${nextId.current++}`, ts: Date.now(), kind: 'Fee', sym, qty: -fee, note: 'Network fee', status: 'Pending', hash },
      ...r,
    ])
    return { id, hash }
  }

  const onBuy = ({ sym, qty: bought, method }: { sym: string; qty: number; method: string; chfPaid: number }) => {
    const id = `TX-${nextId.current++}`
    setQty((q) => ({ ...q, [sym]: q[sym] + bought }))
    setRows((r) => [
      { id, ts: Date.now(), kind: 'Deposit', sym, qty: bought, note: `Purchase by ${method.toLowerCase()}`, status: method === 'Bank transfer' ? 'Pending' : 'Settled', hash: '0x' + randomHex(64) },
      ...r,
    ])
    return id
  }

  if (!reg) {
    return (
      <Auth
        onEnter={(r) => {
          setReg(r)
          setTab('overview')
          setXTab('send')
          setPTab('registration')
        }}
      />
    )
  }

  const owner = nameFromEmail(reg.email)
  const signers = reg.people.filter((p) => p.role !== 'Viewer').slice(0, 2)
  const approvers: [string, string][] = [
    ...signers.map((p) => [p.name, p.role] as [string, string]),
    ...(DEMO_REG.people.map((p) => [p.name, p.role]) as [string, string][]),
  ].slice(0, 2) as [string, string][]
  const pendingCount = rows.filter((r) => r.status === 'Pending').length

  return (
    <div className={`app ${open ? '' : 'collapsed'}`}>
      <aside className={`rail ${open ? '' : 'collapsed'}`}>
        <div className="rail-head">
          <Wordmark />
          <button className="icon rail-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse menu' : 'Expand menu'} aria-expanded={open}>
            {open ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>
        </div>
        <p className="entity">{reg.legal}</p>

        <nav aria-label="Main">
          {NAV.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined} title={t.label}>
              <t.icon size={19} />
              <span className="label">{t.label}</span>
              {t.id === 'history' && pendingCount > 0 && <em>{pendingCount}</em>}
            </button>
          ))}
        </nav>

        <button className={`profile-btn ${tab === 'settings' ? 'on' : ''}`} onClick={() => setTab('settings')} title="Profile and settings" aria-label="Open profile and settings">
          <span className="avatar sm">{owner.slice(0, 1)}</span>
          <span className="label who">
            <b>{owner}</b>
            <small>{reg.email}</small>
          </span>
        </button>
      </aside>

      <div className="main">
        <header className="top">
          <h1>{TITLES[tab]}</h1>
        </header>

        <AnimatePresence mode="wait">
          <motion.section key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {tab === 'overview' && <Overview live={feed} qty={qty} rows={rows} setTab={setTab} goTransfer={goTransfer} />}
            {tab === 'transfer' && (
              <Transfer tab={xTab} setTab={setXTab} live={feed} qty={qty} onSend={onSend} onBuy={onBuy} notify={notify} />
            )}
            {tab === 'history' && <History rows={rows} prices={feed.prices} notify={notify} />}
            {tab === 'settings' && (
              <Settings
                reg={reg}
                owner={owner}
                approvers={approvers}
                tab={pTab}
                setTab={setPTab}
                notify={notify}
                onSignOut={() => {
                  setReg(null)
                  setOpen(false)
                }}
              />
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}>
              <Check size={15} /> {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
