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
  image?: string
}

export interface CartItem {
  id: number
  uid: string
  product: { sku: string; name: string }
  quantity: number
  prices?: { row_total?: Price; price?: Price }
}

export interface Cart {
  id: string
  email?: string
  total_quantity: number
  prices?: {
    grand_total?: Price
    subtotal_including_tax?: Price
  }
  items?: CartItem[]
}

export interface ShippingMethod {
  available: boolean
  carrier_code: string
  carrier_title: string
  method_code: string
  method_title: string
  amount: Price
  error_message?: string | null
}

export interface PaymentMethod {
  code: string
  name: string
}

export interface CheckoutState {
  intent: 'checkout'
  cart?: Cart | null
  cart_id?: string
  email?: string | null
  shipping_address?: Record<string, unknown>
  selected_shipping_method?: { carrier_code: string; method_code: string; carrier_title?: string; method_title?: string; amount?: Price } | null
  available_shipping_methods?: ShippingMethod[]
  available_payment_methods?: PaymentMethod[]
  selected_payment_method?: PaymentMethod | null
  narration?: string
  message?: string
}

export interface UiLayout {
  intent: 'ui_layout'
  layout: 'hero' | 'compare' | 'moodboard' | 'price_chart'
  layout_label?: string
  headline?: string
  note?: string
  accent?: string
  svg?: string
  products?: ProductCard[]
  narration?: string
}

export interface OrderResult {
  intent: 'order_placed'
  order?: { id?: string; order_number?: string }
  narration?: string
}

/** Ein Baustein einer agenten-gebauten Ansicht (DB-UI-Komponenten, whitelist-serverseitig). */
export interface ViewBlock {
  type: 'headline' | 'text' | 'tags' | 'chips' | 'product_cards' | 'showcase' | 'cart_summary' | 'actions' | 'divider'
  text?: string
  variant?: string
  items?: Array<Record<string, unknown>>
  products?: ProductCard[]
  layout?: string
  headline?: string
  note?: string
  accent?: string
  svg?: string
}

export interface UiView {
  intent: 'ui_view'
  title?: string
  blocks?: ViewBlock[]
  narration?: string
}

export interface ProductDetails {
  sku?: string
  uid?: string
  name?: string
  price?: Price
  stock_status?: string
  description?: string
  media?: Array<{ url?: string; label?: string }>
  variants?: unknown[]
}

export interface Intent {
  intent: string
  results?: ProductCard[]
  total_count?: number
  aggregations?: Array<{ attribute_code: string; label: string; options: Array<{ label: string; value: string; count?: number }> }>
  product?: Record<string, unknown>
  cart?: Cart
  cart_id?: string
  tool?: string
  args?: Record<string, unknown>
  message?: string
  narration?: string
  title?: string
  url_key?: string
  excerpt?: string
}

export interface ToolStep {
  tool: string
  args?: Record<string, unknown>
  status?: string
  intent?: string
  narration?: string
}

export interface ChatResponse {
  session_id: string
  text?: string
  intents?: Intent[]
  tool_trace?: ToolStep[]
  cart?: Cart
}

/** Live event emitted by POST /api/chat/stream (SSE). */
export interface ChatEvent {
  event: 'text' | 'tool_start' | 'tool_end' | 'done'
  text?: string
  tool?: string
  args?: Record<string, unknown>
  intent?: string
  narration?: string
  result?: { text?: string; intents?: Intent[] }
  tool_trace?: ToolStep[]
}

export interface AddressPayload {
  firstname: string
  lastname: string
  street: string[]
  city: string
  postcode: string
  country_code: string
  region?: string
  telephone: string
}

// Dev-Server und `vite preview` proxien /api auf den Agent (siehe vite.config.ts).
// Beim statischen Hosting ohne Proxy stattdessen VITE_AGENT_URL auf die Agent-URL setzen.
const API_BASE = import.meta.env.VITE_AGENT_URL || '/api'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`agent error: ${res.status}`)
  return res.json() as Promise<T>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`agent error: ${res.status}`)
  return res.json() as Promise<T>
}

export async function sendChat(sessionId: string | null, message: string): Promise<ChatResponse> {
  return post<ChatResponse>('/chat', { session_id: sessionId, message })
}

/**
 * Streaming chat: calls POST /api/chat/stream and invokes onEvent for every
 * SSE event (narration, tool_start/tool_end with args, text, done) so the UI
 * can show live what the agent is doing and which tool it calls with which
 * parameters.
 */
export async function streamChat(
  sessionId: string | null,
  message: string,
  onEvent: (ev: ChatEvent) => void,
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
  })
  if (!res.ok || !res.body) throw new Error(`agent error: ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final: ChatResponse | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const rawBlock = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const evLine = rawBlock.split('\n').find((l) => l.startsWith('event: '))
      const dataLine = rawBlock.split('\n').find((l) => l.startsWith('data: '))
      if (!evLine || !dataLine) continue
      const ev = JSON.parse(dataLine.slice(6)) as ChatEvent
      ev.event = evLine.slice(7).trim() as ChatEvent['event']
      onEvent(ev)
      if (ev.event === 'done' && ev.result) {
        final = {
          session_id: (ev as { session_id?: string }).session_id ?? sessionId ?? '',
          text: ev.result.text,
          intents: ev.result.intents,
          tool_trace: ev.tool_trace ?? [],
        }
      }
    }
  }
  if (!final) throw new Error('stream ended without done event')
  return final
}

export async function confirmAction(sessionId: string, tool: string, args: Record<string, unknown>): Promise<ChatResponse> {
  return post<ChatResponse>('/confirm', { session_id: sessionId, tool, args })
}

export async function addToCart(sku: string, quantity = 1): Promise<{ cart?: Cart }> {
  return post<{ cart?: Cart }>('/cart/add', { sku, quantity })
}

export async function getCart(): Promise<{ cart?: Cart }> {
  return get<{ cart?: Cart }>('/cart')
}

export async function getCheckoutOverview(): Promise<CheckoutState> {
  return get<CheckoutState>('/checkout/overview')
}

export async function postCheckoutAddress(address: AddressPayload): Promise<CheckoutState> {
  return post<CheckoutState>('/checkout/address', address)
}

export async function postCheckoutShipping(carrier_code: string, method_code: string): Promise<CheckoutState> {
  return post<CheckoutState>('/checkout/shipping', { carrier_code, method_code })
}

export async function postCheckoutPayment(code: string): Promise<CheckoutState> {
  return post<CheckoutState>('/checkout/payment', { code })
}

export async function postCheckoutPlace(): Promise<OrderResult> {
  return post<OrderResult>('/checkout/place', {})
}

export function formatPrice(p?: Price): string {
  if (!p) return '–'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: p.currency || 'EUR' }).format(p.value)
}
