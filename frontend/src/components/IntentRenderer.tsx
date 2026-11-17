import type { Cart, Intent, ProductCard } from '../lib/api'
import { formatPrice } from '../lib/api'

export function ProductCardView({ product, magentoUrl }: { product: ProductCard; magentoUrl: string }) {
  const url = product.url_key ? `${magentoUrl}/${product.url_key}` : '#'
  return (
    <a className="product-card" href={url} target="_blank" rel="noreferrer">
      <span className="product-position">{product.position}</span>
      <div className="product-info">
        <strong>{product.name}</strong>
        <span className="product-sku">{product.sku}</span>
        <span className="product-stock">{product.stock_status === 'IN_STOCK' ? '✓ Auf Lager' : '✗ Nicht verfügbar'}</span>
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
          <button key={`${agg.attribute_code}-${opt.value}`} className="chip" onClick={() => onPick(agg.attribute_code, opt.value)}>
            {agg.label}: {opt.label}
          </button>
        )),
      )}
    </div>
  )
}

export function CartPanel({ cart, magentoUrl }: { cart: Cart; magentoUrl: string }) {
  return (
    <div className="cart-panel">
      <div className="cart-header">
        <strong>Warenkorb ({cart.total_quantity})</strong>
        <span>{formatPrice(cart.prices?.grand_total)}</span>
      </div>
      {(cart.items ?? []).map((item) => (
        <div key={item.id} className="cart-item">
          <span>{item.quantity}× {item.product.name}</span>
          <span>{formatPrice(item.prices?.row_total)}</span>
        </div>
      ))}
      <a href={`${magentoUrl}/checkout/cart`} target="_blank" rel="noreferrer" className="cart-link">Zum Warenkorb →</a>
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
      <p>Bitte bestätigen: <strong>{intent.tool}</strong></p>
      <pre>{JSON.stringify(intent.args, null, 2)}</pre>
      <div className="confirm-actions">
        <button className="btn-primary" onClick={onConfirm}>Bestätigen</button>
        <button className="btn-secondary" onClick={onDismiss}>Abbrechen</button>
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
      <a href={`${magentoUrl}/${intent.url_key}`} target="_blank" rel="noreferrer">Quelle: CMS-Seite →</a>
    </div>
  )
}
