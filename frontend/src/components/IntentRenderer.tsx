import { useEffect, useState } from 'react'
import { DbButton, DbChip, DbHeadline, DbTag } from '@db-ui/react-elements'
import type {
  AddressPayload,
  Cart,
  CheckoutState,
  Intent,
  OrderResult,
  PaymentMethod,
  ProductCard,
  ShippingMethod,
  UiLayout,
} from '../lib/api'
import {
  formatPrice,
  getCheckoutOverview,
  postCheckoutAddress,
  postCheckoutPayment,
  postCheckoutPlace,
  postCheckoutShipping,
} from '../lib/api'

export function ProductCardView({ product, onAdd }: { product: ProductCard; onAdd?: (sku: string) => void }) {
  const inStock = product.stock_status === 'IN_STOCK'
  return (
    <div className="product-card" data-testid="product-card">
      {product.image ? (
        <img className="product-thumb" src={product.image} alt={product.name ?? ''} loading="lazy" />
      ) : (
        <span className="product-position">{product.position}</span>
      )}
      <div className="product-info">
        <strong>{product.name}</strong>
        <span className="product-sku">{product.sku}</span>
        <DbTag variant={inStock ? 'success' : 'error'} small>{inStock ? 'Auf Lager' : 'Nicht verfügbar'}</DbTag>
      </div>
      <div className="product-buy">
        <span className="product-price">{formatPrice(product.price)}</span>
        {onAdd && (
          <DbButton variant="primary" onClick={() => onAdd(product.sku ?? '')} disabled={!inStock}>
            In den Warenkorb
          </DbButton>
        )}
      </div>
    </div>
  )
}

export function FilterChips({ aggregations, onPick }: {
  aggregations: NonNullable<Intent['aggregations']>
  onPick: (code: string, value: string) => void
}) {
  return (
    <div className="filter-chips" data-testid="filter-chips">
      {aggregations.slice(0, 3).map((agg) =>
        agg.options.slice(0, 4).map((opt) => (
          <DbChip key={`${agg.attribute_code}-${opt.value}`} interactiontype="filter" onClick={() => onPick(agg.attribute_code, opt.value)}>
            {agg.label}: {opt.label}
          </DbChip>
        )),
      )}
    </div>
  )
}

/** Vom Agenten erzeugte Grafik (SVG) + zugehörige Produkte – UI vom Agenten an die Wünsche des Nutzers angepasst. */
export function ShowcaseView({ layout, onAdd }: { layout: UiLayout; onAdd?: (sku: string) => void }) {
  return (
    <div className="showcase" data-testid="showcase">
      <div className="showcase-head">
        <DbHeadline variant="2">{layout.headline ?? layout.layout_label ?? 'Showcase'}</DbHeadline>
        {layout.note && <p className="showcase-note">{layout.note}</p>}
        {layout.layout_label && <DbTag variant="informative" small>Vom Agenten generiert: {layout.layout_label}</DbTag>}
      </div>
      {layout.svg && (
        <div
          className="showcase-svg"
          data-testid="showcase-svg"
          role="img"
          aria-label={layout.headline ?? 'Produktgrafik'}
          dangerouslySetInnerHTML={{ __html: layout.svg }}
        />
      )}
      {layout.products && layout.products.length > 0 && (
        <div className="product-grid showcase-products">
          {layout.products.map((p) => <ProductCardView key={p.uid ?? p.sku} product={p} onAdd={onAdd} />)}
        </div>
      )}
    </div>
  )
}

export function CartView({ cart, onCheckout, onClose }: {
  cart?: Cart
  onCheckout: () => void
  onClose: () => void
}) {
  const items = cart?.items ?? []
  return (
    <div>
      <DbHeadline variant="2">Warenkorb{cart ? ` (${cart.total_quantity})` : ''}</DbHeadline>
      {!cart || items.length === 0 ? (
        <div className="card">
          <p className="empty-note" data-testid="cart-empty">Dein Warenkorb ist leer. Sieh dir die Vorschläge im Chat an oder suche nach Produkten.</p>
          <div className="pane-footer" style={{ marginTop: 0 }}>
            <DbButton variant="secondary-outline" onClick={onClose}>Zu den Widgets</DbButton>
          </div>
        </div>
      ) : (
        <div className="card" data-testid="cart-panel">
          <div className="cart-list">
            {items.map((item) => (
              <div key={item.id} className="cart-item" data-testid="cart-item">
                <span><span className="qty">{item.quantity}×</span>{item.product.name}</span>
                <span className="row-total">{formatPrice(item.prices?.row_total)}</span>
              </div>
            ))}
          </div>
          <div className="cart-totals">
            <div className="cart-item">
              <span>Zwischensumme</span>
              <span>{formatPrice(cart.prices?.subtotal_including_tax)}</span>
            </div>
            <div className="cart-item grand">
              <span>Gesamt</span>
              <span data-testid="cart-grand-total">{formatPrice(cart.prices?.grand_total)}</span>
            </div>
          </div>
          <div className="pane-footer">
            <DbButton variant="secondary-outline" onClick={onClose}>Zurück</DbButton>
            <DbButton variant="primary" onClick={onCheckout}>Checkout</DbButton>
          </div>
        </div>
      )}
    </div>
  )
}

const STEPS = ['Adresse', 'Versand', 'Zahlung', 'Prüfen & bestellen'] as const

/** Checkout-Stepper: Adresse -> Versand -> Zahlung -> Bestellung aufgeben (Totals live aus Magento). */
export function CheckoutView({ cart, onBack, onDone }: {
  cart?: Cart
  onBack: () => void
  onDone: (order: OrderResult) => void
}) {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<CheckoutState | null>(null)
  const [order, setOrder] = useState<OrderResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shippingChoice, setShippingChoice] = useState<ShippingMethod | null>(null)
  const [paymentChoice, setPaymentChoice] = useState<PaymentMethod | null>(null)
  const [form, setForm] = useState<AddressPayload>({
    firstname: '', lastname: '', street: [''], city: '', postcode: '', country_code: 'DE', telephone: '',
  })

  useEffect(() => {
    getCheckoutOverview()
      .then((s) => {
        setState(s)
        if (s.selected_shipping_method) {
          const m = s.available_shipping_methods?.find(
            (x) => x.carrier_code === s.selected_shipping_method?.carrier_code && x.method_code === s.selected_shipping_method?.method_code,
          )
          if (m) setShippingChoice(m)
        }
        if (s.selected_payment_method) setPaymentChoice(s.selected_payment_method)
        if (s.shipping_address?.firstname) {
          setForm((f) => ({ ...f, ...(s.shipping_address as Partial<AddressPayload>) }))
          setStep(1)
        }
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  async function submitAddress() {
    setBusy(true)
    setError(null)
    try {
      const s = await postCheckoutAddress({ ...form, street: form.street.filter((l) => l.trim()) })
      setState(s)
      setStep(1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function submitShipping() {
    if (!shippingChoice) return
    setBusy(true)
    setError(null)
    try {
      const s = await postCheckoutShipping(shippingChoice.carrier_code, shippingChoice.method_code)
      setState(s)
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function submitPayment() {
    if (!paymentChoice) return
    setBusy(true)
    setError(null)
    try {
      const s = await postCheckoutPayment(paymentChoice.code)
      setState(s)
      const fresh = await getCheckoutOverview()
      setState(fresh)
      setStep(3)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function placeOrder() {
    setBusy(true)
    setError(null)
    try {
      const result = await postCheckoutPlace()
      setOrder(result)
      onDone(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (order) {
    return <OrderStatusCard order={order} onClose={onBack} />
  }

  const effectiveCart = state?.cart ?? cart
  const items = effectiveCart?.items ?? []

  return (
    <div data-testid="checkout-view">
      <DbHeadline variant="2">Checkout</DbHeadline>
      <ol className="step-indicator" aria-label="Checkout-Schritte">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'active' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      {error && <p className="error-note" role="alert">{error}</p>}

      {step === 0 && (
        <section className="card checkout-section" data-testid="checkout-address">
          <h3>Lieferadresse</h3>
          <div className="form-grid">
            <label>Vorname<input name="firstname" value={form.firstname} onChange={(e) => setForm({ ...form, firstname: e.target.value })} /></label>
            <label>Nachname<input name="lastname" value={form.lastname} onChange={(e) => setForm({ ...form, lastname: e.target.value })} /></label>
            <label>Straße<input name="street" value={form.street[0] ?? ''} onChange={(e) => setForm({ ...form, street: [e.target.value] })} /></label>
            <label>PLZ<input name="postcode" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} /></label>
            <label>Ort<input name="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label>Telefon<input name="telephone" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></label>
          </div>
          <div className="pane-footer">
            <DbButton variant="secondary-outline" onClick={onBack}>Zurück zum Warenkorb</DbButton>
            <DbButton variant="primary" disabled={busy || !form.firstname || !form.lastname || !form.city || !form.postcode || !form.street[0]}
              onClick={submitAddress}>
              Weiter zu Versand
            </DbButton>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card checkout-section" data-testid="checkout-shipping">
          <h3>Versandart</h3>
          <div className="option-list" role="radiogroup" aria-label="Versandart">
            {(state?.available_shipping_methods ?? []).filter((m) => m.available).map((m) => (
              <label key={`${m.carrier_code}-${m.method_code}`} className="option-row">
                <input
                  type="radio"
                  name="shipping_method"
                  value={`${m.carrier_code}/${m.method_code}`}
                  checked={shippingChoice?.carrier_code === m.carrier_code && shippingChoice?.method_code === m.method_code}
                  onChange={() => setShippingChoice(m)}
                />
                <span>{m.carrier_title} – {m.method_title}</span>
                <span className="row-total">{formatPrice(m.amount)}</span>
              </label>
            ))}
          </div>
          <div className="pane-footer">
            <DbButton variant="secondary-outline" onClick={() => setStep(0)}>Zurück</DbButton>
            <DbButton variant="primary" disabled={busy || !shippingChoice} onClick={submitShipping}>Weiter zu Zahlung</DbButton>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card checkout-section" data-testid="checkout-payment">
          <h3>Zahlungsart</h3>
          <div className="option-list" role="radiogroup" aria-label="Zahlungsart">
            {(state?.available_payment_methods ?? []).map((m) => (
              <label key={m.code} className="option-row">
                <input
                  type="radio"
                  name="payment_method"
                  value={m.code}
                  checked={paymentChoice?.code === m.code}
                  onChange={() => setPaymentChoice(m)}
                />
                <span>{m.name}</span>
              </label>
            ))}
          </div>
          <p className="ai-note">Zahlungsdaten werden nur im Zahlungsformular des Shops erfasst – nie im Chat/LLM.</p>
          <div className="pane-footer">
            <DbButton variant="secondary-outline" onClick={() => setStep(1)}>Zurück</DbButton>
            <DbButton variant="primary" disabled={busy || !paymentChoice} onClick={submitPayment}>Weiter zur Prüfung</DbButton>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card checkout-section" data-testid="checkout-review">
          <h3>Prüfen &amp; bestellen</h3>
          <div className="cart-list">
            {items.map((item) => (
              <div key={item.id} className="cart-item">
                <span><span className="qty">{item.quantity}×</span>{item.product.name}</span>
                <span className="row-total">{formatPrice(item.prices?.row_total)}</span>
              </div>
            ))}
          </div>
          <dl>
            <div className="kv"><dt>Versand</dt><dd>{state?.selected_shipping_method ? `${state.selected_shipping_method.carrier_title ?? ''} (${formatPrice(state.selected_shipping_method.amount)})` : '–'}</dd></div>
            <div className="kv"><dt>Zahlung</dt><dd>{state?.selected_payment_method?.name ?? '–'}</dd></div>
            <div className="kv"><dt>Zwischensumme</dt><dd>{formatPrice(effectiveCart?.prices?.subtotal_including_tax)}</dd></div>
            <div className="kv"><dt><strong>Gesamt</strong></dt><dd data-testid="checkout-grand-total"><strong>{formatPrice(effectiveCart?.prices?.grand_total)}</strong></dd></div>
          </dl>
          <div className="pane-footer">
            <DbButton variant="secondary-outline" onClick={() => setStep(2)}>Zurück</DbButton>
            <DbButton variant="primary" disabled={busy} onClick={placeOrder} data-testid="place-order">
              {busy ? '…' : 'Jetzt verbindlich bestellen'}
            </DbButton>
          </div>
        </section>
      )}
    </div>
  )
}

export function OrderStatusCard({ order, onClose }: { order: OrderResult; onClose: () => void }) {
  return (
    <div className="card order-card" data-testid="order-status">
      <DbTag variant="success" small>Bestellung aufgegeben</DbTag>
      <DbHeadline variant="3">Danke für deine Bestellung!</DbHeadline>
      <p>Deine Bestellnummer: <strong data-testid="order-number">{order.order?.order_number ?? '–'}</strong></p>
      {order.narration && <p className="ai-note">{order.narration}</p>}
      <div className="pane-footer">
        <DbButton variant="primary" onClick={onClose}>Zurück zum Shop</DbButton>
      </div>
    </div>
  )
}

export function ConfirmDialog({ intent, onConfirm, onDismiss }: {
  intent: Intent
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="confirm-card" data-testid="confirm-dialog">
      <p><DbTag variant="warning" small>Confirm-Gate</DbTag></p>
      <p>Bitte bestätigen: <strong data-testid="confirm-tool">{intent.tool}</strong></p>
      <pre data-testid="confirm-args">{JSON.stringify(intent.args, null, 2)}</pre>
      {intent.narration && <p className="confirm-narration">{intent.narration}</p>}
      <div className="confirm-actions">
        <DbButton variant="primary" onClick={onConfirm}>Bestätigen</DbButton>
        <DbButton variant="secondary-outline" onClick={onDismiss}>Abbrechen</DbButton>
      </div>
      <p className="confirm-note">Preise und Totals stammen aus Magento, nicht aus dem LLM.</p>
    </div>
  )
}

export function PolicyAnswer({ intent }: { intent: Intent }) {
  return (
    <div className="policy-answer" data-testid="policy-answer">
      <strong>{intent.title}</strong>
      <p>{intent.excerpt?.slice(0, 400)}…</p>
    </div>
  )
}
