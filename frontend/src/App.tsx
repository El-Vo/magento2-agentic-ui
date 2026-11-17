import { useEffect, useRef, useState } from 'react'
import { DbButton, DbHeadline, DbInput } from '@db-ui/react-elements'
import type { ChatEvent, Intent, OrderResult, ProductCard, ToolStep, UiLayout } from './lib/api'
import { addToCart, confirmAction, getCart, streamChat } from './lib/api'
import { CartView, CheckoutView, ConfirmDialog, FilterChips, OrderStatusCard, PolicyAnswer, ProductCardView, ShowcaseView } from './components/IntentRenderer'

const TOOL_LABELS: Record<string, string> = {
  search_products: 'Produktsuche',
  product_details: 'Produktdetails',
  categories: 'Kategorien',
  cart_get: 'Warenkorb ansehen',
  cart_add: 'In den Warenkorb',
  cart_update: 'Menge ändern',
  cart_remove: 'Aus Warenkorb entfernen',
  checkout_overview: 'Checkout-Status',
  set_checkout_email: 'E-Mail setzen',
  set_shipping_address: 'Lieferadresse',
  set_shipping_method: 'Versandart',
  set_payment_method: 'Zahlungsart',
  place_order: 'Bestellung aufgeben',
  compose_showcase: 'Grafik erstellen',
  cms_page: 'Infoseite',
}

type View = 'home' | 'cart' | 'checkout'

interface Turn {
  role: 'user' | 'agent'
  text?: string
  intents?: Intent[]
  toolSteps?: ToolStep[]
  narrations?: string[]
}

/** Live-Anzeige der Tool-Aufrufe: Toolname + exakte Parameter + Narration des Agenten. */
function ToolTrace({ steps }: { steps: ToolStep[] }) {
  if (!steps.length) return null
  return (
    <div className="tool-trace" aria-label="Vom Agenten genutzte Tools" data-testid="tool-trace">
      {steps.map((step, j) => (
        <div key={j} className={`tool-step status-${step.status ?? 'done'}`} data-testid="tool-step">
          <span className="tool-name" data-testid="tool-name">{step.tool}</span>
          <span className="tool-label">{TOOL_LABELS[step.tool] ?? ''}</span>
          {step.status === 'running' && <em className="tool-running"> läuft…</em>}
          {step.status === 'confirm_required' && <em className="tool-confirm"> wartet auf Bestätigung</em>}
          {step.args && (
            <pre className="tool-args" data-testid="tool-args">{JSON.stringify(step.args)}</pre>
          )}
          {step.narration && <span className="tool-narration">{step.narration}</span>}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const turnsRef = useRef<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Intent | null>(null)
  const [cart, setCart] = useState<Intent['cart']>(undefined)
  const [view, setView] = useState<View>('home')
  const [widgets, setWidgets] = useState<ProductCard[]>([])
  const [aggregations, setAggregations] = useState<Intent['aggregations']>([])
  const [showcase, setShowcase] = useState<UiLayout | null>(null)
  const [order, setOrder] = useState<OrderResult | null>(null)

  const updateTurns = (fn: (prev: Turn[]) => Turn[]) => {
    const next = fn(turnsRef.current)
    turnsRef.current = next
    setTurns(next)
  }

  useEffect(() => {
    getCart()
      .then((res) => { if (res.cart) setCart(res.cart) })
      .catch(() => { /* Warenkorb optional – im Zweifel leer starten */ })
  }, [])

  function patchAgentTurn(idx: number, fn: (t: Turn) => Turn) {
    updateTurns((prev) => {
      const next = [...prev]
      next[idx] = fn(next[idx])
      return next
    })
  }

  function applyIntents(intents: Intent[] | undefined) {
    const confirmIntent = intents?.find((i) => i.intent === 'confirm_required')
    if (confirmIntent) setPending(confirmIntent)
    const cartIntent = intents?.find((i) => i.cart) ?? (intents?.find((i) => i.intent === 'cart') as Intent | undefined)
    if (cartIntent?.cart) setCart(cartIntent.cart)
    const listIntent = intents?.find((i) => i.intent === 'product_list' && i.results?.length)
    if (listIntent?.results) {
      setWidgets(listIntent.results)
      setAggregations(listIntent.aggregations ?? [])
      setView('home')
    }
    const layoutIntent = intents?.find((i) => i.intent === 'ui_layout')
    if (layoutIntent) setShowcase(layoutIntent as unknown as UiLayout)
    const orderIntent = intents?.find((i) => i.intent === 'order_placed')
    if (orderIntent) setOrder(orderIntent as unknown as OrderResult)
  }

  async function ask(message: string) {
    if (!message.trim() || busy) return
    updateTurns((t) => [...t, { role: 'user', text: message }, { role: 'agent', text: '', intents: [], toolSteps: [], narrations: [] }])
    const agentIdx = turnsRef.current.length - 1
    setInput('')
    setBusy(true)
    try {
      const res = await streamChat(sessionId, message, (ev: ChatEvent) => {
        if (ev.event === 'tool_start' && ev.tool) {
          patchAgentTurn(agentIdx, (t) => ({
            ...t,
            toolSteps: [...(t.toolSteps ?? []), { tool: ev.tool!, args: ev.args, status: 'running', narration: ev.narration }],
            narrations: ev.narration ? [...(t.narrations ?? []), ev.narration] : t.narrations,
          }))
        } else if (ev.event === 'tool_end' && ev.tool) {
          patchAgentTurn(agentIdx, (t) => ({
            ...t,
            toolSteps: (t.toolSteps ?? []).map((s) =>
              s.tool === ev.tool && s.status === 'running'
                ? { ...s, status: 'done', intent: ev.intent, narration: ev.narration ?? s.narration }
                : s,
            ),
            narrations: ev.narration ? [...(t.narrations ?? []), ev.narration] : t.narrations,
          }))
        } else if (ev.event === 'text' && ev.text) {
          patchAgentTurn(agentIdx, (t) => ({ ...t, text: (t.text ?? '') + ev.text }))
        }
      })
      setSessionId(res.session_id || null)
      patchAgentTurn(agentIdx, (t) => ({ ...t, intents: res.intents ?? [], toolSteps: res.tool_trace ?? t.toolSteps }))
      applyIntents(res.intents)
    } catch (e) {
      patchAgentTurn(agentIdx, (t) => ({ ...t, text: `Fehler: ${(e as Error).message}` }))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddToCart(sku: string) {
    try {
      const res = await addToCart(sku)
      if (res.cart) setCart(res.cart)
    } catch (e) {
      updateTurns((t) => [...t, { role: 'agent', text: `Fehler beim Hinzufügen: ${(e as Error).message}` }])
    }
  }

  async function onConfirm() {
    if (!pending || !sessionId) return
    setBusy(true)
    try {
      const res = await confirmAction(sessionId, pending.tool!, pending.args ?? {})
      const cartIntent = res.intents?.find((i) => i.cart) ?? (res.cart ? { cart: res.cart } as Intent : undefined)
      if (cartIntent?.cart) setCart(cartIntent.cart)
      updateTurns((t) => [...t, {
        role: 'agent',
        text: res.text,
        intents: res.intents,
        toolSteps: res.tool_trace ?? [],
        narrations: res.intents?.map((i) => i.narration).filter(Boolean) as string[] | undefined,
      }])
      applyIntents(res.intents)
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <strong className="app-title">Agentic Shop</strong>
        <nav className="header-actions">
          <DbButton
            variant="secondary-outline"
            onClick={() => setView((v) => (v === 'cart' ? 'home' : 'cart'))}
          >
            Warenkorb
            {cart && cart.total_quantity > 0 && <span className="badge" data-testid="cart-badge">{cart.total_quantity}</span>}
          </DbButton>
        </nav>
      </header>

      <div className="app-body">
        <aside className="chat-pane">
          <div className="pane-title">Chatfenster</div>
          <div className="conversation" data-testid="conversation">
            {turns.length === 0 && (
              <p className="hint">Frag z. B.: „Zeig mir wasserdichte Sachen unter 150 €“ oder „Erstelle einen Vergleich der Treffer“</p>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={`turn ${turn.role}`}>
                {turn.toolSteps && turn.toolSteps.length > 0 && <ToolTrace steps={turn.toolSteps} />}
                {turn.narrations && turn.narrations.length > 0 && (
                  <div className="narration-list">
                    {turn.narrations.map((n, j) => <p key={j} className="narration">{n}</p>)}
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
              placeholder="Suche, Fragen, Warenkorb, Checkout …"
              value={input}
              disabled={busy}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            />
            <DbButton variant="primary" type="submit" disabled={busy || !input.trim()}>{busy ? '…' : 'Senden'}</DbButton>
          </form>
        </aside>

        <section className="widget-pane" data-testid="widget-pane">
          {view === 'home' && (
            order ? (
              <OrderStatusCard order={order} onClose={() => { setOrder(null); setCart(undefined); setView('home') }} />
            ) : (
              <>
                {showcase && <div className="widget-section"><ShowcaseView layout={showcase} onAdd={handleAddToCart} /></div>}
                {widgets.length > 0 ? (
                  <div className="widget-section" data-testid="widget-products">
                    <DbHeadline variant="2">Vorschläge für dich</DbHeadline>
                    {aggregations && aggregations.length > 0 && (
                      <FilterChips aggregations={aggregations} onPick={(code, value) => ask(`Filter ${code} auf ${value} anwenden`)} />
                    )}
                    <div className="product-grid">
                      {widgets.map((p) => <ProductCardView key={p.uid ?? p.sku} product={p} onAdd={handleAddToCart} />)}
                    </div>
                  </div>
                ) : (
                  !showcase && (
                    <div className="widget-placeholder">
                      <strong>Platz für Widgets</strong>
                      <span>Stell eine Frage im Chatfenster – Produktkarten, Grafiken, Warenkorb und Checkout erscheinen hier.</span>
                    </div>
                  )
                )}
              </>
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
              onBack={() => setView(cart && cart.items?.length ? 'cart' : 'home')}
              onDone={(o) => { setOrder(o); setCart(undefined) }}
            />
          )}
        </section>
      </div>
    </div>
  )
}
