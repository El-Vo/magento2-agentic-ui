/// <reference types="cypress" />
import './commands'

/**
 * e2e-Support: Mock-Agent-API per cy.intercept (default an, abschaltbar mit
 * --env E2E_MOCK_API=false fuer Live-Lauf gegen Agent+Magento).
 *
 * Die Mocks liefern deterministische SSE-Streams (POST /api/chat/stream) und
 * JSON-Antworten fuer Cart/Checkout – damit testen die Specs den kompletten
 * Userflow der App ohne laufendes Magento.
 */

let mockApi = true

const PRODUCTS = [
  {
    position: 1, uid: 'MQ==', sku: 'BE-JACKE-03', name: 'Wasserdichte Outdoor-Jacke',
    price: { value: 149.0, currency: 'EUR' }, stock_status: 'IN_STOCK',
    url_key: 'outdoor-jacke', image: 'http://localhost:8080/media/catalog/product/jacke.jpg',
  },
  {
    position: 2, uid: 'Mg==', sku: 'EL-KOPFHOERER-01', name: 'Kabellose Over-Ear-Kopfhörer',
    price: { value: 129.99, currency: 'EUR' }, stock_status: 'IN_STOCK',
    url_key: 'kopfhoerer', image: 'http://localhost:8080/media/catalog/product/kopfhoerer.jpg',
  },
  {
    position: 3, uid: 'Mw==', sku: 'BE-RUCKSACK-04', name: 'Laptop-Rucksack 15 Zoll',
    price: { value: 69.99, currency: 'EUR' }, stock_status: 'IN_STOCK',
    url_key: 'rucksack', image: null,
  },
]

const AGGREGATIONS = [
  {
    attribute_code: 'price',
    label: 'Preis',
    options: [
      { label: '50–100 €', value: '50_100', count: 5 },
      { label: '100–150 €', value: '100_150', count: 3 },
    ],
  },
  {
    attribute_code: 'category_uid',
    label: 'Kategorie',
    options: [{ label: 'Bekleidung', value: 'Mg==', count: 4 }],
  },
]

function sse(events: Array<{ event: string; data: unknown }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('')
}

interface MockState {
  cart: Record<string, unknown> | null
  addressSet: boolean
  shippingSet: boolean
  paymentSet: boolean
  orderPlaced: boolean
}

function freshState(): MockState {
  return { cart: null, addressSet: false, shippingSet: false, paymentSet: false, orderPlaced: false }
}

let state = freshState()

beforeEach(() => {
  state = freshState()
})

function cartWithItems() {
  const items = state.cart ? (state.cart as { items: unknown[] }).items : []
  return state.cart
    ? state.cart
    : { id: 'mockcart1', total_quantity: items.length ? 1 : 0, items, prices: { grand_total: { value: 0, currency: 'EUR' } } }
}

function searchStream(message: string) {
  const args = { search: 'wasserdichte sachen', filter: { price: { lt: '150' } }, page_size: 4 }
  const listIntent = { intent: 'product_list', results: PRODUCTS, total_count: 3, aggregations: AGGREGATIONS }
  const text = `Ich habe ${PRODUCTS.length} passende Produkte gefunden – alle Preise und Lagerstaende kommen aus Magento.`
  return sse([
    { event: 'tool_start', data: { tool: 'search_products', args, narration: 'Ich durchsuche den Katalog nach „wasserdichte sachen“ mit Filter {"price":{"lt":"150"}} …' } },
    { event: 'tool_end', data: { tool: 'search_products', args, intent: 'product_list', narration: 'Ich habe im Katalog nach „wasserdichte sachen“ gesucht – 3 Treffer.' } },
    { event: 'text', data: { text } },
    { event: 'done', data: { result: { text, intents: [listIntent] }, tool_trace: [{ tool: 'search_products', args, status: 'done', intent: 'product_list', narration: 'Ich habe im Katalog nach „wasserdichte sachen“ gesucht – 3 Treffer.' }] } },
  ])
}

function confirmAddStream(sku: string) {
  const args = { cart_id: 'mockcart1', sku, quantity: 1 }
  const confirmIntent = { intent: 'confirm_required', tool: 'cart_add', args, narration: `Ich würde jetzt „cart_add“ mit ${JSON.stringify(args)} ausführen – bitte bestätige das im Dialog.` }
  return sse([
    { event: 'tool_start', data: { tool: 'cart_add', args, narration: `Ich lege „${sku}“ (Menge 1) in den Warenkorb – nach deiner Bestätigung …` } },
    { event: 'tool_end', data: { tool: 'cart_add', args, intent: 'confirm_required', narration: confirmIntent.narration } },
    { event: 'done', data: { result: { text: confirmIntent.narration, intents: [confirmIntent] }, tool_trace: [{ tool: 'cart_add', args, status: 'confirm_required', intent: 'confirm_required', narration: confirmIntent.narration }] } },
  ])
}

function showcaseStream(layout = 'compare') {
  const products = PRODUCTS.slice(0, 3)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 360" role="img" aria-label="Deine Auswahl">` +
    `<rect width="800" height="360" fill="#ffffff"/><rect width="800" height="70" fill="#e30613"/>` +
    `<text x="40" y="45" fill="#fff" font-size="26" font-weight="700">Deine Auswahl</text>` +
    products.map((p, i) => `<text x="40" y="${110 + i * 42}" font-size="17" fill="#131821">${p.name}</text><text x="560" y="${110 + i * 42}" font-size="17" font-weight="700" fill="#e30613">${p.price.value.toFixed(2)} ${p.price.currency}</text>`).join('') +
    `</svg>`
  const args = { layout, headline: 'Deine Auswahl', positions: [1, 2, 3] }
  const layoutIntent = {
    intent: 'ui_layout', layout, layout_label: 'Produktvergleich', headline: 'Deine Auswahl',
    accent: '#e30613', svg, products,
    narration: `Ich habe eine Grafik „Produktvergleich“ mit ${products.length} Produkt(en) aus der letzten Suche erstellt – alle Daten kommen aus Magento.`,
  }
  const text = layoutIntent.narration
  return sse([
    { event: 'tool_start', data: { tool: 'compose_showcase', args, narration: `Ich erstelle eine Grafik („${layout}“) mit den gewählten Produkten …` } },
    { event: 'tool_end', data: { tool: 'compose_showcase', args, intent: 'ui_layout', narration: layoutIntent.narration } },
    { event: 'text', data: { text } },
    { event: 'done', data: { result: { text, intents: [layoutIntent] }, tool_trace: [{ tool: 'compose_showcase', args, status: 'done', intent: 'ui_layout', narration: layoutIntent.narration }] } },
  ])
}

function checkoutOverview(): Record<string, any> {
  const cart: Record<string, any> = state.cart ?? {
    id: 'mockcart1',
    email: 'demo.kunde@agentic.local',
    total_quantity: 0,
    items: [],
    prices: { grand_total: { value: 0, currency: 'EUR' }, subtotal_including_tax: { value: 0, currency: 'EUR' } },
  }
  return {
    intent: 'checkout',
    cart_id: 'mockcart1',
    cart,
    shipping_address: state.addressSet
      ? { firstname: 'Max', lastname: 'Mustermann', street: ['Musterstraße 1'], city: 'Berlin', postcode: '10115', country_code: 'DE', telephone: '030123456' }
      : {},
    selected_shipping_method: state.shippingSet
      ? { carrier_code: 'flatrate', method_code: 'flatrate', carrier_title: 'Flat Rate', method_title: 'Fixed', amount: { value: 4.95, currency: 'EUR' } }
      : null,
    available_shipping_methods: [
      { available: true, carrier_code: 'flatrate', carrier_title: 'Flat Rate', method_code: 'flatrate', method_title: 'Fixed', amount: { value: 4.95, currency: 'EUR' }, error_message: null },
      { available: true, carrier_code: 'tablerate', carrier_title: 'Best Way', method_code: 'bestway', method_title: 'Table Rate', amount: { value: 9.9, currency: 'EUR' }, error_message: null },
    ],
    available_payment_methods: [{ code: 'checkmo', name: 'Check / Money order' }],
    selected_payment_method: state.paymentSet ? { code: 'checkmo', name: 'Check / Money order' } : null,
  }
}

function registerMockApi() {
  cy.intercept('POST', '**/api/chat/stream', (req) => {
    const message: string = (req.body?.message ?? '').toLowerCase()
    let body: string
    if (message.includes('vergleich') || message.includes('grafik') || message.includes('showcase') || message.includes('moodboard')) {
      body = showcaseStream(message.includes('moodboard') ? 'moodboard' : 'compare')
    } else if (message.includes('warenkorb') && (message.includes('erste') || message.includes('hinzufügen') || message.includes('legen'))) {
      body = confirmAddStream('BE-JACKE-03')
    } else {
      body = searchStream(req.body?.message ?? '')
    }
    req.reply({
      statusCode: 200,
      headers: { 'content-type': 'text/event-stream' },
      body,
    })
  })

  cy.intercept('POST', '**/api/chat', (req) => {
    const message: string = (req.body?.message ?? '').toLowerCase()
    if (message.includes('warenkorb') && (message.includes('erste') || message.includes('legen'))) {
      req.reply({ statusCode: 200, body: { session_id: 'mock-session', text: 'Bitte bestätigen.', intents: [{ intent: 'confirm_required', tool: 'cart_add', args: { sku: 'BE-JACKE-03', quantity: 1 } }], tool_trace: [{ tool: 'cart_add', args: { sku: 'BE-JACKE-03' }, status: 'confirm_required' }] } })
    } else {
      req.reply({ statusCode: 200, body: { session_id: 'mock-session', text: '3 Treffer.', intents: [{ intent: 'product_list', results: PRODUCTS, total_count: 3, aggregations: AGGREGATIONS }], tool_trace: [{ tool: 'search_products', args: { search: 'sachen' }, status: 'done' }] } })
    }
  })

  cy.intercept('POST', '**/api/confirm', (req) => {
    const tool = req.body?.tool
    state.cart = {
      id: 'mockcart1',
      total_quantity: 1,
      items: [{ id: 1, uid: 'u1', product: { sku: 'BE-JACKE-03', name: 'Wasserdichte Outdoor-Jacke' }, quantity: 1, prices: { row_total: { value: 149.0, currency: 'EUR' }, price: { value: 149.0, currency: 'EUR' } } }],
      prices: { grand_total: { value: 149.0, currency: 'EUR' }, subtotal_including_tax: { value: 149.0, currency: 'EUR' } },
    }
    req.reply({
      statusCode: 200,
      body: {
        session_id: req.body?.session_id ?? 'mock-session',
        text: '„BE-JACKE-03“ (Menge 1) liegt jetzt im Warenkorb.',
        intents: [{ intent: 'cart_updated', cart_id: 'mockcart1', cart: state.cart, narration: '„BE-JACKE-03“ (Menge 1) liegt jetzt im Warenkorb.' }],
        tool_trace: [{ tool, args: req.body?.args, status: 'done', intent: 'cart_updated' }],
      },
    })
  })

  cy.intercept('POST', '**/api/cart/add', (req) => {
    const sku = req.body?.sku ?? PRODUCTS[0].sku
    const product = PRODUCTS.find((p) => p.sku === sku) ?? PRODUCTS[0]
    state.cart = {
      id: 'mockcart1',
      total_quantity: 1,
      items: [{ id: 1, uid: 'u1', product: { sku: product.sku, name: product.name }, quantity: req.body?.quantity ?? 1, prices: { row_total: product.price, price: product.price } }],
      prices: { grand_total: product.price, subtotal_including_tax: product.price },
    }
    req.reply({ statusCode: 200, body: { cart: state.cart } })
  })

  cy.intercept('GET', '**/api/cart', (req) => {
    req.reply({ statusCode: 200, body: { cart: cartWithItems() } })
  })

  cy.intercept('GET', '**/api/checkout/overview', (req) => {
    req.reply({ statusCode: 200, body: checkoutOverview() })
  })

  cy.intercept('POST', '**/api/checkout/address', (req) => {
    state.addressSet = true
    req.reply({ statusCode: 200, body: { ...checkoutOverview(), narration: 'Ich übernehme die Lieferadresse für die Bestellung.' } })
  })

  cy.intercept('POST', '**/api/checkout/shipping', (req) => {
    state.shippingSet = true
    const base = checkoutOverview()
    const grand = (base.cart?.prices?.subtotal_including_tax?.value ?? 0) + 4.95
    req.reply({
      statusCode: 200,
      body: {
        ...base,
        cart: { ...base.cart, prices: { ...base.cart?.prices, grand_total: { value: grand, currency: 'EUR' } } },
        narration: 'Ich setze die Versandart auf „Flat Rate“.',
      },
    })
  })

  cy.intercept('POST', '**/api/checkout/payment', (req) => {
    state.paymentSet = true
    req.reply({ statusCode: 200, body: { ...checkoutOverview(), narration: 'Ich setze die Zahlungsart „checkmo“.' } })
  })

  cy.intercept('POST', '**/api/checkout/place', (req) => {
    state.orderPlaced = true
    state.cart = null
    req.reply({
      statusCode: 200,
      body: { intent: 'order_placed', order: { id: '5', order_number: '000000042' }, narration: 'Bestellung aufgegeben! Deine Bestellnummer lautet 000000042.' },
    })
  })
}

before(() => {
  // E2E_MOCK_API=false -> Live-Lauf gegen echten Agent + Magento (make demo), sonst gemockte API
  cy.env(['E2E_MOCK_API']).then(({ E2E_MOCK_API }) => {
    mockApi = E2E_MOCK_API !== false && E2E_MOCK_API !== 'false'
    if (mockApi) registerMockApi()
  })
})
