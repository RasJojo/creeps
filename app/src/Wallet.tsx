import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { AlertTriangle, Banknote, Check, ClipboardPaste, Copy, CreditCard, Landmark, Loader2, Share2 } from 'lucide-react'
import {
  ASSETS,
  FEES_CHF,
  MY_ADDRESS,
  NETWORKS,
  NET_ASSETS,
  SAVED,
  chf,
  copyText,
  qtyFmt,
  shareOrCopy,
  short,
  useFlash,
  validateAddress,
  type Network,
} from './data'
import { Field } from './Panels'

type Notify = (msg: string) => void
type Prices = Record<string, number>
type Qty = Record<string, number>

function Flash({ v, children }: { v: number; children: ReactNode }) {
  return <span className={`flash ${useFlash(v)}`}>{children}</span>
}

function RuleCheck({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={ok ? 'ok' : 'bad'}>
      {ok ? <Check size={14} /> : <AlertTriangle size={14} />}
      {children}
    </li>
  )
}

/** Copy + Share pair used by Send and Receive. Both need a non-empty value. */
function CopyShare({ value, title, what, notify, disabled }: { value: string; title: string; what: string; notify: Notify; disabled?: boolean }) {
  const off = disabled || !value
  return (
    <div className="row gap">
      <button
        type="button"
        className="btn ghost"
        disabled={off}
        onClick={async () => notify((await copyText(value)) ? `${what} copied` : 'Copy was blocked by the browser')}
      >
        <Copy size={15} /> Copy
      </button>
      <button
        type="button"
        className="btn ghost"
        disabled={off}
        onClick={async () => {
          const r = await shareOrCopy(title, value)
          if (r === 'shared') notify(`${what} shared`)
          if (r === 'copied') notify(`Sharing isn't available here, so the ${what.toLowerCase()} was copied`)
          if (r === 'failed') notify('Share was blocked by the browser')
        }}
      >
        <Share2 size={15} /> Share
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Ledger page: holdings                                               */
/* ------------------------------------------------------------------ */

export function Holdings({ qty, prices, total }: { qty: Qty; prices: Prices; total: number }) {
  const biggest = [...ASSETS].sort((a, b) => qty[b.sym] * prices[b.sym] - qty[a.sym] * prices[a.sym])[0]
  return (
    <div className="stack">
      <div className="tiles">
        <div className="panel tile">
          <span className="dim">Total value</span>
          <b className="num">{chf(total)}</b>
        </div>
        <div className="panel tile">
          <span className="dim">Largest holding</span>
          <b>
            {biggest.sym} <span className="dim num">{Math.round(((qty[biggest.sym] * prices[biggest.sym]) / total) * 100)}%</span>
          </b>
        </div>
        <div className="panel tile">
          <span className="dim">Assets on</span>
          <b>{NETWORKS.length} networks</b>
        </div>
      </div>

      <div className="panel flush">
        <div className="scroll-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Network</th>
                <th className="r">Balance</th>
                <th className="r">Price</th>
                <th className="r">Value</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {ASSETS.map((a) => {
                const v = qty[a.sym] * prices[a.sym]
                return (
                  <tr key={a.sym}>
                    <td>
                      <span className="coin" style={{ background: a.color }}>
                        {a.sym.slice(0, 1)}
                      </span>
                      <b>{a.sym}</b> <span className="dim">{a.name}</span>
                    </td>
                    <td>
                      <span className="tag">{a.chain}</span>
                    </td>
                    <td className="r num">{qtyFmt(qty[a.sym], a.sym)}</td>
                    <td className="r num">
                      <Flash v={prices[a.sym]}>{chf(prices[a.sym])}</Flash>
                    </td>
                    <td className="r num">
                      <Flash v={v}>{chf(v)}</Flash>
                    </td>
                    <td className="share">
                      <span className="bar">
                        <i style={{ width: `${(v / total) * 100}%`, background: a.color }} />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */

type SendArgs = { sym: string; amt: number; fee: number; to: string; memo: string }
type Receipt = { id: string; hash: string; sym: string; amt: number; to: string; network: string }

export function SendPanel({
  qty,
  prices,
  onSend,
  notify,
}: {
  qty: Qty
  prices: Prices
  onSend: (a: SendArgs) => { id: string; hash: string }
  notify: Notify
}) {
  const DAILY = 1000000
  const [sym, setSym] = useState('USDC')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [step, setStep] = useState<'form' | 'review' | 'sending' | 'done'>('form')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [sentToday, setSentToday] = useState(180000)

  const asset = ASSETS.find((a) => a.sym === sym)!
  const network = asset.chain
  const feeChf = FEES_CHF[network]
  const fee = feeChf / prices[sym]
  const amt = parseFloat(amount.replace(',', '.')) || 0
  const valueChf = amt * prices[sym]
  const addrOk = validateAddress(network, to)
  const balanceOk = amt > 0 && amt + fee <= qty[sym]
  const limitOk = valueChf + sentToday <= DAILY
  const approvals = valueChf > 250000 ? 2 : 1
  const canReview = addrOk && balanceOk && limitOk
  const saved = SAVED.filter((s) => s.network === network)

  const addrMsg = !to.trim()
    ? 'An address is required.'
    : addrOk
      ? `Valid ${network} address.`
      : `This is not a valid ${network} address. Check it character by character.`

  async function paste() {
    try {
      setTo((await navigator.clipboard.readText()).trim())
    } catch {
      notify('The browser blocked pasting. Paste with Ctrl+V instead.')
    }
  }

  function confirm() {
    setStep('sending')
    setTimeout(() => {
      const r = onSend({ sym, amt, fee, to: to.trim(), memo })
      setReceipt({ ...r, sym, amt, to: to.trim(), network })
      setSentToday((s) => s + valueChf)
      setStep('done')
    }, 1700)
  }

  function again() {
    setTo('')
    setAmount('')
    setMemo('')
    setReceipt(null)
    setStep('form')
  }

  const receiptText = receipt
    ? `creeps transfer ${receipt.id}\n${qtyFmt(receipt.amt, receipt.sym)} ${receipt.sym} on ${receipt.network}\nTo: ${receipt.to}\nHash: ${receipt.hash}`
    : ''

  if (step === 'done' && receipt)
    return (
      <div className="panel narrow stack">
        <div className="done-mark">
          <Check size={22} />
        </div>
        <h2>Sent for approval</h2>
        <p className="dim">The transfer is in the transaction history as pending. It leaves the wallet once {approvals} approver{approvals > 1 ? 's have' : ' has'} signed.</p>
        <dl className="review">
          <dt>Reference</dt>
          <dd className="num">{receipt.id}</dd>
          <dt>Amount</dt>
          <dd className="num">
            {qtyFmt(receipt.amt, receipt.sym)} {receipt.sym}
          </dd>
          <dt>To</dt>
          <dd>
            <code>{receipt.to}</code>
          </dd>
          <dt>Hash</dt>
          <dd>
            <code>{receipt.hash}</code>
          </dd>
        </dl>
        <div className="row gap wrap">
          <CopyShare value={receiptText} title={`Transfer ${receipt.id}`} what="Receipt" notify={notify} />
          <button className="btn" onClick={again}>
            Send another
          </button>
        </div>
      </div>
    )

  return (
    <div className="cols">
      <div className="panel stack">
        <h2>Send</h2>

        <div className="grid2">
          <Field label="Asset">
            <select value={sym} onChange={(e) => { setSym(e.target.value); setTo(''); setStep('form') }} disabled={step !== 'form'}>
              {ASSETS.map((a) => (
                <option key={a.sym} value={a.sym}>
                  {a.sym} · {qtyFmt(qty[a.sym], a.sym)} available
                </option>
              ))}
            </select>
          </Field>
          <Field label="Network">
            <div className="static">
              <span className="tag">{network}</span>
            </div>
          </Field>
        </div>

        <Field label="Recipient address (required)">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={step !== 'form'}
            placeholder={network === 'Ethereum' ? '0x…' : network === 'Solana' ? 'Solana address' : 'bc1…'}
            spellCheck={false}
            aria-invalid={!!to && !addrOk}
          />
        </Field>
        <p className={`msg ${to && addrOk ? 'ok' : 'bad'}`}>{addrMsg}</p>
        <div className="row gap wrap">
          <button type="button" className="btn ghost sm" onClick={paste} disabled={step !== 'form'}>
            <ClipboardPaste size={14} /> Paste
          </button>
          <CopyShare value={to.trim()} title="Recipient address" what="Address" notify={notify} disabled={!addrOk} />
        </div>
        {saved.length > 0 && (
          <div className="chips">
            {saved.map((s) => (
              <button key={s.address} type="button" className="chip" disabled={step !== 'form'} onClick={() => setTo(s.address)} title={s.address}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        <Field label={`Amount in ${sym}${amt > 0 ? ` · ${chf(valueChf)}` : ''}`}>
          <div className="pw">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={step !== 'form'} placeholder="0.00" />
            <button
              type="button"
              className="maxbtn"
              disabled={step !== 'form'}
              onClick={() => setAmount(String(Math.max(0, qty[sym] - fee).toFixed(sym === 'USDC' ? 2 : 6)))}
            >
              Max
            </button>
          </div>
        </Field>
        <Field label="Reference (optional)">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} disabled={step !== 'form'} placeholder="Invoice or internal note" />
        </Field>

        {step === 'form' && (
          <button className="btn" disabled={!canReview} onClick={() => setStep('review')}>
            Review transfer
          </button>
        )}

        <AnimatePresence>
          {step !== 'form' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="review-box">
              <dl className="review">
                <dt>You send</dt>
                <dd className="num">
                  {qtyFmt(amt, sym)} {sym}
                </dd>
                <dt>To</dt>
                <dd>
                  <code>{short(to)}</code>
                </dd>
                <dt>Network fee</dt>
                <dd className="num">{chf(feeChf)}</dd>
                <dt>Approvals</dt>
                <dd>{approvals} needed</dd>
              </dl>
              <div className="row gap">
                <button className="btn" onClick={confirm} disabled={step === 'sending'}>
                  {step === 'sending' ? <Loader2 size={16} className="spin" /> : null}
                  {step === 'sending' ? 'Sending…' : 'Send'}
                </button>
                <button className="btn ghost" onClick={() => setStep('form')} disabled={step === 'sending'}>
                  Edit
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="panel stack">
        <h2>Before it goes out</h2>
        <ul className="checks">
          <RuleCheck ok={addrOk}>{addrOk ? `Address is valid on ${network}` : `Enter a valid ${network} address`}</RuleCheck>
          <RuleCheck ok={balanceOk}>
            {amt === 0 ? 'Enter an amount' : balanceOk ? 'Balance covers the amount and the fee' : 'Amount plus fee is more than your balance'}
          </RuleCheck>
          <RuleCheck ok={limitOk}>{limitOk ? `Within the daily limit (${chf(Math.max(0, DAILY - sentToday - valueChf))} left)` : `Over the daily limit of ${chf(DAILY)}`}</RuleCheck>
          <RuleCheck ok>
            {approvals} approver{approvals > 1 ? 's' : ''} needed for this amount
          </RuleCheck>
        </ul>
        <p className="dim">Crypto transfers can't be undone. Send a small test amount first when the address is new.</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Receive                                                             */
/* ------------------------------------------------------------------ */

export function ReceivePanel({ notify }: { notify: Notify }) {
  const [net, setNet] = useState<Network>('Ethereum')
  const address = MY_ADDRESS[net]
  return (
    <div className="panel narrow stack">
      <h2>Receive</h2>
      <div className="chips">
        {NETWORKS.map((n) => (
          <button key={n} className={`chip ${net === n ? 'on' : ''}`} onClick={() => setNet(n)}>
            {n}
          </button>
        ))}
      </div>

      <div className="receive">
        <AnimatePresence mode="wait">
          <motion.div key={net} className="qr" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <QRCodeSVG value={address} size={188} bgColor="#ffffff" fgColor="#12201d" level="M" marginSize={2} title={`${net} address QR code`} />
          </motion.div>
        </AnimatePresence>
        <div className="stack grow">
          <div>
            <span className="dim">Your {net} address</span>
            <div className="addr-box">
              <code>{address}</code>
            </div>
          </div>
          <CopyShare value={address} title={`My ${net} address`} what="Address" notify={notify} />
          <p className="dim">
            Only send {NET_ASSETS[net].join(' or ')} on {net} to this address. Anything else may be lost for good.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Buy crypto                                                          */
/* ------------------------------------------------------------------ */

const METHODS = [
  { id: 'card', label: 'Card', fee: 0.019, icon: CreditCard, note: 'Instant' },
  { id: 'bank', label: 'Bank transfer', fee: 0.004, icon: Landmark, note: '1 working day' },
  { id: 'account', label: 'Swissquote account', fee: 0.0025, icon: Banknote, note: 'Instant' },
] as const
type MethodId = (typeof METHODS)[number]['id']

export function BuyPanel({
  prices,
  onBuy,
  notify,
}: {
  prices: Prices
  onBuy: (a: { sym: string; qty: number; method: string; chfPaid: number }) => string
  notify: Notify
}) {
  const [sym, setSym] = useState('BTC')
  const [chfStr, setChfStr] = useState('1000')
  const [method, setMethod] = useState<MethodId>('card')
  const [step, setStep] = useState<'form' | 'confirm' | 'processing' | 'done'>('form')
  const [quote, setQuote] = useState({ price: 0, out: 0 })
  const [doneId, setDoneId] = useState('')

  const m = METHODS.find((x) => x.id === method)!
  const pay = parseFloat(chfStr.replace(',', '.')) || 0
  const max = method === 'card' ? 10000 : 50000
  const valid = pay >= 50 && pay <= max
  const feeAmt = pay * m.fee
  const out = (pay - feeAmt) / prices[sym]

  function lockQuote() {
    setQuote({ price: prices[sym], out })
    setStep('confirm')
  }

  function buy() {
    setStep('processing')
    setTimeout(() => {
      setDoneId(onBuy({ sym, qty: quote.out, method: m.label, chfPaid: pay }))
      setStep('done')
      notify(`Purchase complete: ${qtyFmt(quote.out, sym)} ${sym}`)
    }, 1800)
  }

  if (step === 'done')
    return (
      <div className="panel narrow stack">
        <div className="done-mark">
          <Check size={22} />
        </div>
        <h2>
          You bought {qtyFmt(quote.out, sym)} {sym}
        </h2>
        <p className="dim">
          {method === 'bank'
            ? `It will be added once your bank transfer arrives. Reference ${doneId}.`
            : `It is already in your wallet. Reference ${doneId}.`}
        </p>
        <button className="btn fit" onClick={() => setStep('form')}>
          Buy more
        </button>
      </div>
    )

  return (
    <div className="cols">
      <div className="panel stack">
        <h2>Buy crypto</h2>
        <Field label="What do you want to buy?">
          <select value={sym} onChange={(e) => setSym(e.target.value)} disabled={step !== 'form'}>
            {ASSETS.map((a) => (
              <option key={a.sym} value={a.sym}>
                {a.name} ({a.sym}) · {chf(prices[a.sym])}
              </option>
            ))}
          </select>
        </Field>
        <Field label="You pay (CHF)">
          <input inputMode="decimal" value={chfStr} onChange={(e) => setChfStr(e.target.value)} disabled={step !== 'form'} />
        </Field>
        <div className="chips">
          {[500, 1000, 5000, 10000].map((n) => (
            <button key={n} className="chip" disabled={step !== 'form'} onClick={() => setChfStr(String(n))}>
              {n.toLocaleString('de-CH')}
            </button>
          ))}
        </div>
        {!valid && <p className="hint">{pay < 50 ? 'The minimum purchase is CHF 50.' : `The maximum with ${m.label.toLowerCase()} is ${chf(max)}.`}</p>}

        <Field label="Pay with">
          <div className="methods">
            {METHODS.map((x) => (
              <button key={x.id} type="button" className={method === x.id ? 'on' : ''} disabled={step !== 'form'} onClick={() => setMethod(x.id)}>
                <x.icon size={18} />
                <b>{x.label}</b>
                <span className="dim">
                  {x.note} · {(x.fee * 100).toFixed(2).replace(/\.?0+$/, '')}% fee
                </span>
              </button>
            ))}
          </div>
        </Field>

        {step === 'form' && (
          <button className="btn" disabled={!valid} onClick={lockQuote}>
            See the quote
          </button>
        )}
      </div>

      <div className="panel stack">
        <h2>{step === 'form' ? 'Estimate' : 'Your quote'}</h2>
        <dl className="review">
          <dt>Price</dt>
          <dd className="num">{chf(step === 'form' ? prices[sym] : quote.price)} per {sym}</dd>
          <dt>Fee</dt>
          <dd className="num">{valid ? chf(feeAmt) : '–'}</dd>
          <dt>You get</dt>
          <dd className="num strong">{valid ? `${qtyFmt(step === 'form' ? out : quote.out, sym)} ${sym}` : '–'}</dd>
        </dl>
        {step === 'form' && <p className="dim">The price moves every few seconds. The quote is fixed when you click the button below.</p>}
        {step !== 'form' && (
          <div className="row gap">
            <button className="btn" onClick={buy} disabled={step === 'processing'}>
              {step === 'processing' ? <Loader2 size={16} className="spin" /> : null}
              {step === 'processing' ? 'Buying…' : `Pay ${chf(pay)}`}
            </button>
            <button className="btn ghost" onClick={() => setStep('form')} disabled={step === 'processing'}>
              Change
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
