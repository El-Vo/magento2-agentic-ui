import { useState } from 'react'
import { DbButton, DbHeadline, DbInput, DbLink } from '@db-ui/react-elements'
import type { ChatResponse, Intent, ProductCard } from './lib/api'
import { sendChat, confirmAction } from './lib/api'
import { CartView, CheckoutView, ConfirmDialog, FilterChips, PolicyAnswer, ProductCardView } from './components/IntentRenderer'

const MAGENTO_URL = import.meta.env.VITE_MAGENTO_URL || 'http://localhost:8080'

// Platzhalter für den Namen des eingeloggten Kunden (siehe UI-Sketch: „Hallo, X!“)
const USER_NAME = 'X'

type View = 'home' | 'cart' | 'checkout'

interface Turn {
  role: 'user' | 'agent'
  text?: string
  intents?: Intent[]
}

// Neutrales Logo: Die DB-Marke (db-logo) ist lizenzrechtlich DB vorbehalten und
// darf außerhalb von DB nicht verwendet werden.
function LogoMark() {
  return (
    <svg className="logo-mark" width="44" height="32" viewBox="0 0 44 32" role="img" aria-label="Shop Logo">
      <rect width="44" height="32" rx="4" fill="#ec0016" />
      <text x="22" y="22.5" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="17" fill="#ffffff">DB</text>
    </svg>
  )
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
        <div className="brand">
          <LogoMark />
          <DbHeadline variant="1">Hallo, {USER_NAME}!</DbHeadline>
        </div>
        <nav className="header-actions">
          <DbLink href={`${MAGENTO_URL}/customer/account/login`} target="_blank">Login</DbLink>
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
                  if (intent.intent === 'policy_answer') {
                    return <PolicyAnswer key={j} intent={intent} magentoUrl={MAGENTO_URL} />
                  }
                  return null
                })}
              </div>
            ))}
            {pending && <ConfirmDialog intent={pending} onConfirm={onConfirm} onDismiss={() => setPending(null)} />}
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
                  {widgets.map((p) => <ProductCardView key={p.uid ?? p.sku} product={p} magentoUrl={MAGENTO_URL} />)}
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
              magentoUrl={MAGENTO_URL}
              onBack={() => setView('cart')}
            />
          )}
        </section>
      </div>
    </div>
  )
}
