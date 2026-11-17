import { DbButton, DbChip, DbHeadline, DbLink, DbTag } from '@db-ui/react-elements'
import type { Cart, Intent, ProductCard } from '../lib/api'
import { formatPrice } from '../lib/api'

export function ProductCardView({ product, magentoUrl }: { product: ProductCard; magentoUrl: string }) {
  const url = product.url_key ? `${magentoUrl}/${product.url_key}` : '#'
  const inStock = product.stock_status === 'IN_STOCK'
  return (
    <a className="product-card" href={url} target="_blank" rel="noreferrer">
      <span className="product-position">{product.position}</span>
      <div className="product-info">
        <strong>{product.name}</strong>
        <span className="product-sku">{product.sku}</span>
        <DbTag variant={inStock ? 'success' : 'error'} small>{inStock ? 'Auf Lager' : 'Nicht verfügbar'}</DbTag>
      </div>
      <span className="product-price">{formatPrice(product.price)}</span>
    </a>
  )
}

export function FilterChips({ aggregations, onPick }: {
  aggregations: NonNullable<Intent['aggregations']>
  onPick: (code: string, value: string) => void
}) {
  return (
    <div className="filter-chips">
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
          <p className="empty-note">Dein Warenkorb ist leer. Sieh dir die Vorschläge im Chat an oder suche nach Produkten.</p>
          <div className="pane-footer" style={{ marginTop: 0 }}>
            <DbButton variant="secondary-outline" onClick={onClose}>Zu den Widgets</DbButton>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="cart-list">
            {items.map((item) => (
              <div key={item.id} className="cart-item">
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
              <span>{formatPrice(cart.prices?.grand_total)}</span>
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

export function CheckoutView({ cart, magentoUrl, onBack }: {
  cart?: Cart
  magentoUrl: string
  onBack: () => void
}) {
  const items = cart?.items ?? []
  return (
    <div>
      <DbHeadline variant="2">Checkout</DbHeadline>
      <div className="checkout-grid">
        <section className="card checkout-section">
          <h3>Produkte</h3>
          {items.length === 0 ? (
            <p className="empty-note">Keine Produkte im Warenkorb.</p>
          ) : (
            <div className="cart-list">
              {items.map((item) => (
                <div key={item.id} className="cart-item">
                  <span><span className="qty">{item.quantity}×</span>{item.product.name}</span>
                  <span className="row-total">{formatPrice(item.prices?.row_total)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card checkout-section">
          <h3>Versand</h3>
          <dl>
            <div className="kv"><dt>Versandart</dt><dd>Standard</dd></div>
            <div className="kv"><dt>Versandkosten</dt><dd>–</dd></div>
            <div className="kv"><dt>Lieferadresse</dt><dd>–</dd></div>
          </dl>
          <p className="ai-note">Statische Übersicht – Felder können von der KI vorausgefüllt werden.</p>
        </section>

        <section className="card checkout-section">
          <h3>Zahlung</h3>
          <dl>
            <div className="kv"><dt>Zahlungsart</dt><dd>–</dd></div>
            <div className="kv"><dt>Rechnungsadresse</dt><dd>–</dd></div>
          </dl>
          <p className="ai-note">Statische Übersicht – Felder können von der KI vorausgefüllt werden.</p>
        </section>

        <section className="card checkout-section">
          <h3>Summe</h3>
          <dl>
            <div className="kv"><dt>Zwischensumme</dt><dd>{formatPrice(cart?.prices?.subtotal_including_tax)}</dd></div>
            <div className="kv"><dt><strong>Gesamt</strong></dt><dd><strong>{formatPrice(cart?.prices?.grand_total)}</strong></dd></div>
          </dl>
          <div className="pane-footer">
            <DbButton variant="secondary-outline" onClick={onBack}>Zurück zum Warenkorb</DbButton>
            <DbButton variant="primary" onClick={() => window.open(`${magentoUrl}/checkout`, '_blank', 'noreferrer')}>Checkout</DbButton>
          </div>
        </section>
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
    <div className="confirm-card">
      <p><DbTag variant="warning" small>Confirm-Gate</DbTag></p>
      <p>Bitte bestätigen: <strong>{intent.tool}</strong></p>
      <pre>{JSON.stringify(intent.args, null, 2)}</pre>
      <div className="confirm-actions">
        <DbButton variant="primary" onClick={onConfirm}>Bestätigen</DbButton>
        <DbButton variant="secondary-outline" onClick={onDismiss}>Abbrechen</DbButton>
      </div>
      <p className="confirm-note">Preise und Totals stammen aus Magento, nicht aus dem LLM.</p>
    </div>
  )
}

export function PolicyAnswer({ intent, magentoUrl }: { intent: Intent; magentoUrl: string }) {
  return (
    <div className="policy-answer">
      <strong>{intent.title}</strong>
      <p>{intent.excerpt?.slice(0, 400)}…</p>
      <DbLink href={`${magentoUrl}/${intent.url_key}`} target="_blank">Quelle: CMS-Seite →</DbLink>
    </div>
  )
}
