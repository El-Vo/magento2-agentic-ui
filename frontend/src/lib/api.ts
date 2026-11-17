export interface Price {
  value: number
  currency: string
}

export interface ProductCard {
  position: number
  uid?: string
  sku?: string
  name?: string
  price?: Price
  stock_status?: string
  url_key?: string
}

export interface Cart {
  id: string
  total_quantity: number
  prices?: {
    grand_total?: Price
    subtotal_including_tax?: Price
  }
  items?: Array<{
    id: number
    uid: string
    product: { sku: string; name: string }
    quantity: number
    prices?: { row_total?: Price; price?: Price }
  }>
}

export interface Intent {
  intent: string
  results?: ProductCard[]
  total_count?: number
  aggregations?: Array<{ attribute_code: string; label: string; options: Array<{ label: string; value: string }> }>
  product?: Record<string, unknown>
  cart?: Cart
  cart_id?: string
  tool?: string
  args?: Record<string, unknown>
  message?: string
  title?: string
  url_key?: string
  excerpt?: string
}

export interface ChatResponse {
  session_id: string
  text?: string
  intents?: Intent[]
  cart?: Cart
}

const API_BASE = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_AGENT_URL || '')

export async function sendChat(sessionId: string | null, message: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
  })
  if (!res.ok) throw new Error(`agent error: ${res.status}`)
  return res.json()
}

export async function confirmAction(sessionId: string, tool: string, args: Record<string, unknown>): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, tool, args }),
  })
  if (!res.ok) throw new Error(`agent error: ${res.status}`)
  return res.json()
}

export function formatPrice(p?: Price): string {
  if (!p) return '–'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: p.currency || 'EUR' }).format(p.value)
}
