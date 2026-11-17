import { useState, useEffect } from 'react'
import { DbButton, DbHeadline, DbInput } from '@db-ui/react-elements'
import type { Intent, ProductCard, ToolStep } from './lib/api'
import { sendChat, confirmAction, addToCart, getCart } from './lib/api'
import { CartView, CheckoutView, ConfirmDialog, PolicyAnswer, ProductCardView } from './components/IntentRenderer'

const TOOL_LABELS: Record<string, string> = {
  search_products: 'Produktsuche',
  product_details: 'Produktdetails',
  cart_add: 'Warenkorb',
}

type View = 'home' | 'cart' | 'checkout'

interface Turn {
  role: 'user' | 'agent'
  text?: string
  intents?: Intent[]
  toolSteps?: ToolStep[]
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Intent | null>(null)
  const [cart, setCart] = useState<Intent['cart']>(undefined)
  const [view, setView] = useState<View>('home')
  const [widgets, setWidgets] = useState<ProductCard[]>([])

  useEffect(() => {
    getCart()
      .then((res) => { if (res.cart) setCart(res.cart) })
      .catch(() => { /* Warenkorb optional – im Zweifel leer starten */ })
  }, [])

  async function ask(message: string) {
    if (!message.trim() || busy) return
    setTurns((t) => [...t, { role: 'user', text: message }])
    setInput('')
    setBusy(true)
    try {
      const res = await sendChat(sessionId, message)
      setSessionId(res.session_id)
      setTurns((t) => [...t, { role: 'agent', text: res.text, intents: res.intents, toolSteps: res.tool_trace ?? [] }])
      const confirmIntent = res.intents?.find((i) => i.intent === 'confirm_required')
      if (confirmIntent) setPending(confirmIntent)
      const cartIntent = res.intents?.find((i) => i.cart) ?? (res.cart ? { cart: res.cart } as Intent : undefined)
      if (cartIntent?.cart) setCart(cartIntent.cart)
      const listIntent = res.intents?.find((i) => i.intent === 'product_list' && i.results?.length)
      if (listIntent?.results) setWidgets(listIntent.results)
    } catch (e) {
      setTurns((t) => [...t, { role: 'agent', text: `Fehler: ${(e as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }

  async function handleAddToCart(sku: string) {
    try {
      const res = await addToCart(sku)
      if (res.cart) setCart(res.cart)
    } catch (e) {
      setTurns((t) => [...t, { role: 'agent', text: `Fehler beim Hinzufügen: ${(e as Error).message}` }])
    }
  }

  async function onConfirm() {
    if (!pending || !sessionId) return
    setBusy(true)
    try {
      const res = await confirmAction(sessionId, pending.tool!, pending.args ?? {})
      const cartIntent = res.intents?.find((i) => i.cart) ?? (res.cart ? { cart: res.cart } as Intent : undefined)
      if (cartIntent?.cart) setCart(cartIntent.cart)
      setTurns((t) => [...t, { role: 'agent', text: 'Aktion ausgeführt.', intents: res.intents }])
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <nav className="header-actions">
          <DbButton
            variant="secondary-outline"
            onClick={() => setView((v) => (v === 'cart' ? 'home' : 'cart'))}
          >
            Warenkorb
            {cart && cart.total_quantity > 0 && <span className="badge">{cart.total_quantity}</span>}
          </DbButton>
        </nav>
      </header>

      <div className="app-body">
        <aside className="chat-pane">
          <div className="pane-title">Chatfenster</div>
          <div className="conversation">
            {turns.length === 0 && (
              <p className="hint">Frag z. B.: „Zeig mir Wanderschuhe unter 150 €“</p>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={`turn ${turn.role}`}>
                {turn.toolSteps && turn.toolSteps.length > 0 && (
                  <div className="tool-trace" aria-label="Vom Agenten genutzte Tools">
                    {turn.toolSteps.map((step, j) => (
                      <span key={j} className="tool-step">{TOOL_LABELS[step.tool] ?? step.tool}</span>
                    ))}
                  </div>
                )}
                {turn.text && <p className="bubble">{turn.text}</p>}
                {turn.intents?.map((intent, j) => {
                  if (intent.intent === 'confirm_required') {
                    return null
                  }
                  if (intent.intent === 'product_details') {
                    return <div key={j} className="intent-block"><pre>{JSON.stringify(intent.product, null, 2)}</pre></div>
                  }
                  if (intent.intent === 'policy_answer') {
                  return <PolicyAnswer key={j} intent={intent} />
                  }
                  return null
                })}
              </div>
            ))}
            {pending && <ConfirmDialog intent={pending} onConfirm={onConfirm} onDismiss={() => setPending(null)} />}
            {busy && (
              <div className="turn agent thinking-turn">
                <div className="thinking" aria-label="Agent denkt nach">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
            <DbInput
              label="Nachricht an den Agenten"
              placeholder="Suche, Fragen, Warenkorb …"
              value={input}
              disabled={busy}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            />
            <DbButton variant="primary" type="submit" disabled={busy || !input.trim()}>{busy ? '…' : 'Senden'}</DbButton>
          </form>
        </aside>

        <section className="widget-pane">
          {view === 'home' && (
            widgets.length > 0 ? (
              <div className="widget-section">
                <DbHeadline variant="2">Vorschläge für dich</DbHeadline>
                <div className="product-grid">
                  {widgets.map((p) => <ProductCardView key={p.uid ?? p.sku} product={p} onAdd={handleAddToCart} />)}
                </div>
              </div>
            ) : (
              <div className="widget-placeholder">
                <strong>Platz für Widgets</strong>
                <span>Stell eine Frage im Chatfenster – Produktkarten, Warenkorb und Checkout erscheinen hier.</span>
              </div>
            )
          )}
          {view === 'cart' && (
            <CartView
              cart={cart}
              onCheckout={() => setView('checkout')}
              onClose={() => setView('home')}
            />
          )}
          {view === 'checkout' && (
            <CheckoutView
              cart={cart}
              onBack={() => setView('cart')}
            />
          )}
        </section>
      </div>
    </div>
  )
}
