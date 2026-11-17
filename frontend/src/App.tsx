import { useState } from 'react'
import type { ChatResponse, Intent } from './lib/api'
import { sendChat, confirmAction } from './lib/api'
import { CartPanel, ConfirmDialog, FilterChips, PolicyAnswer, ProductCardView } from './components/IntentRenderer'

const MAGENTO_URL = import.meta.env.VITE_MAGENTO_URL || 'http://localhost:8080'

interface Turn {
  role: 'user' | 'agent'
  text?: string
  intents?: Intent[]
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Intent | null>(null)
  const [cart, setCart] = useState<Intent['cart']>(undefined)

  async function ask(message: string) {
    if (!message.trim() || busy) return
    setTurns((t) => [...t, { role: 'user', text: message }])
    setInput('')
    setBusy(true)
    try {
      const res = await sendChat(sessionId, message)
      setSessionId(res.session_id)
      setTurns((t) => [...t, { role: 'agent', text: res.text, intents: res.intents }])
      const confirmIntent = res.intents?.find((i) => i.intent === 'confirm_required')
      if (confirmIntent) setPending(confirmIntent)
      const cartIntent = res.intents?.find((i) => i.cart)
      if (cartIntent?.cart) setCart(cartIntent.cart)
    } catch (e) {
      setTurns((t) => [...t, { role: 'agent', text: `Fehler: ${(e as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }

  async function onConfirm() {
    if (!pending || !sessionId) return
    setBusy(true)
    try {
      const res = await confirmAction(sessionId, pending.tool!, pending.args ?? {})
      setPending(null)
      const cartIntent = res.intents?.find((i) => i.cart) ?? (res.cart ? { cart: res.cart } as Intent : undefined)
      if (cartIntent?.cart) setCart(cartIntent.cart)
      setTurns((t) => [...t, { role: 'agent', text: 'Aktion ausgeführt.', intents: res.intents }])
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <div className="chat-widget">
      <header className="widget-header">
        <h1>Agentic Shop</h1>
        <span className="subtitle">Magento 2 · Agent-Tools · Confirm-Gate</span>
      </header>

      <div className="conversation">
        {turns.length === 0 && (
          <p className="hint">Frag z. B.: „Zeig mir Wanderschuhe unter 150 €“</p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`turn ${turn.role}`}>
            {turn.text && <p className="bubble">{turn.text}</p>}
            {turn.intents?.map((intent, j) => {
              if (intent.intent === 'product_list') {
                return (
                  <div key={j} className="intent-block">
                    <div className="product-grid">
                      {intent.results?.map((p) => <ProductCardView key={p.uid ?? p.sku} product={p} magentoUrl={MAGENTO_URL} />)}
                    </div>
                    {intent.aggregations && intent.aggregations.length > 0 && (
                      <FilterChips aggregations={intent.aggregations} onPick={(code, value) => ask(`${code} ${value}`)} />
                    )}
                  </div>
                )
              }
              if (intent.intent === 'product_details') {
                return <div key={j} className="intent-block"><pre>{JSON.stringify(intent.product, null, 2)}</pre></div>
              }
              if (intent.intent === 'cart' && !intent.cart) return null
              if (intent.intent === 'cart' || intent.intent === 'cart_updated') {
                return intent.cart ? <CartPanel key={j} cart={intent.cart} magentoUrl={MAGENTO_URL} /> : null
              }
              if (intent.intent === 'policy_answer') {
                return <PolicyAnswer key={j} intent={intent} magentoUrl={MAGENTO_URL} />
              }
              return null
            })}
          </div>
        ))}
        {pending && <ConfirmDialog intent={pending} onConfirm={onConfirm} onDismiss={() => setPending(null)} />}
        {cart && !turns.some((t) => t.intents?.some((i) => i.cart)) && <CartPanel cart={cart} magentoUrl={MAGENTO_URL} />}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Suche, Fragen, Warenkorb …"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>{busy ? '…' : 'Senden'}</button>
      </form>
    </div>
  )
}
