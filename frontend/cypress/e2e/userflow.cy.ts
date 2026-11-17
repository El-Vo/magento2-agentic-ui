/// <reference types="cypress" />

/**
 * Kompletter Userflow durch den Agentic UI Shop:
 * Produktrecherche (Chat) -> live Tool-Aufrufe -> Produktkarten -> Warenkorb
 * -> Checkout (Adresse/Versand/Zahlung) -> Bestellung aufgeben.
 */
describe('Userflow: Recherche bis Checkout', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('recherchiert, legt in den Warenkorb und bestellt komplett durch', () => {
    // 1) Produktrecherche im Chatfenster
    cy.chatMessage('Zeig mir wasserdichte Sachen unter 150 €')

    // Live-Tool-Trace: Tool + Parameter + Narration erscheinen im Chat
    cy.get('[data-testid="tool-trace"]').should('exist')
    cy.get('[data-testid="tool-step"]').first().as('step')
    cy.get('@step').find('[data-testid="tool-name"]').should('contain', 'search_products')
    cy.get('@step').find('[data-testid="tool-args"]').should('contain', '"filter"').and('contain', '"lt":"150"')
    cy.get('.narration').should('contain', 'Katalog')
    cy.get('.turn.agent .bubble').should('contain', 'Treffer')

    // 2) Produktkarten erscheinen im Widget-Bereich (Shopansicht)
    cy.get('[data-testid="widget-products"] [data-testid="product-card"]').should('have.length', 3)
    cy.get('[data-testid="widget-products"] [data-testid="product-card"]').first().should('contain', 'Wasserdichte Outdoor-Jacke')
    cy.get('[data-testid="filter-chips"]').should('exist')

    // 3) Direkt aus der Produktkarte in den Warenkorb
    cy.get('[data-testid="product-card"]').first().contains('button', 'In den Warenkorb').click()
    cy.get('[data-testid="cart-badge"]').should('contain', '1')

    // 4) Warenkorb ansehen (Totals kommen vom Agent/Magento)
    cy.get('header').contains('button', 'Warenkorb').click()
    cy.get('[data-testid="cart-panel"]').should('exist')
    cy.get('[data-testid="cart-item"]').should('have.length', 1).and('contain', 'Wasserdichte Outdoor-Jacke')
    cy.get('[data-testid="cart-grand-total"]').should('contain', '149,00')

    // 5) Checkout: Adresse
    cy.get('[data-testid="cart-panel"]').contains('button', 'Checkout').click()
    cy.get('[data-testid="checkout-address"]').should('exist')
    cy.get('input[name="firstname"]').type('Max')
    cy.get('input[name="lastname"]').type('Mustermann')
    cy.get('input[name="street"]').type('Musterstraße 1')
    cy.get('input[name="postcode"]').type('10115')
    cy.get('input[name="city"]').type('Berlin')
    cy.get('input[name="telephone"]').type('030123456')
    cy.get('[data-testid="checkout-address"]').contains('button', 'Weiter zu Versand').click()

    // 6) Checkout: Versandart
    cy.get('[data-testid="checkout-shipping"]', { timeout: 10000 }).should('exist')
    cy.get('input[name="shipping_method"]').first().check()
    cy.get('[data-testid="checkout-shipping"]').contains('button', 'Weiter zu Zahlung').click()

    // 7) Checkout: Zahlungsart
    cy.get('[data-testid="checkout-payment"]', { timeout: 10000 }).should('exist')
    cy.get('input[name="payment_method"]').check('checkmo')
    cy.get('[data-testid="checkout-payment"]').contains('button', 'Weiter zur Prüfung').click()

    // 8) Prüfen & verbindlich bestellen (Gesamtsumme inkl. Versand live)
    cy.get('[data-testid="checkout-review"]', { timeout: 10000 }).should('exist')
    cy.get('[data-testid="checkout-grand-total"]').should('contain', '153,95')
    cy.get('[data-testid="place-order"]').click()

    // 9) Bestellabschluss mit Bestellnummer
    cy.get('[data-testid="order-status"]', { timeout: 10000 }).should('exist')
    cy.get('[data-testid="order-number"]').should('contain', '000000042')
  })

  it('zeigt den Confirm-Gate, bevor der Agent etwas in den Warenkorb legt', () => {
    cy.chatMessage('Zeig mir wasserdichte Sachen unter 150 €')
    cy.get('[data-testid="product-card"]').should('have.length', 3)

    cy.chatMessage('Lege das erste in den Warenkorb')
    cy.get('[data-testid="confirm-dialog"]', { timeout: 10000 }).should('exist')
    cy.get('[data-testid="confirm-tool"]').should('contain', 'cart_add')
    cy.get('[data-testid="confirm-args"]').should('contain', 'BE-JACKE-03')

    // Ohne Bestätigung ist noch nichts im Warenkorb
    cy.get('[data-testid="cart-badge"]').should('not.exist')

    cy.get('[data-testid="confirm-dialog"]').contains('button', 'Bestätigen').click()
    cy.get('[data-testid="cart-badge"]').should('contain', '1')
    // Der ausgeführte Tool-Call erscheint mit Parametern im Trace der neuen Antwort
    cy.get('[data-testid="tool-step"]').last().find('[data-testid="tool-name"]').should('contain', 'cart_add')
  })

  it('zeigt einen leeren Warenkorb korrekt an', () => {
    cy.get('header').contains('button', 'Warenkorb').click()
    cy.get('[data-testid="cart-empty"]').should('contain', 'leer')
  })
})
