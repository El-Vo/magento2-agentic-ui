/// <reference types="cypress" />

/**
 * Widgetbereich & Chat-Verhalten:
 * - Warenkorb-Badge und Warenkorbansicht zeigen dieselbe Anzahl (sortiert, immer gleich)
 * - Chat scrollt bei neuen Nachrichten automatisch nach unten
 * - nicht-konversationelle Uebersichten ersetzen alte Widgets
 */
describe('Warenkorb-Ansicht und Chat-Scroll', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('Badge und Warenkorbansicht zeigen dieselbe Anzahl Produkte in stabiler Reihenfolge', () => {
    cy.chatMessage('Zeig mir wasserdichte Sachen unter 150 €')
    cy.get('[data-testid="product-card"]').should('have.length', 3)

    // zwei verschiedene Produkte in den Warenkorb legen
    cy.get('[data-testid="product-card"]').eq(0).contains('db-button', 'In den Warenkorb').click()
    cy.get('[data-testid="cart-badge"]').should('contain', '1')
    cy.get('[data-testid="product-card"]').eq(1).contains('db-button', 'In den Warenkorb').click()
    cy.get('[data-testid="cart-badge"]').should('contain', '2')

    // Warenkorb oeffnen: beide Produkte gerendert, Reihenfolge stabil (nach id)
    cy.get('header').contains('db-button', 'Warenkorb').click()
    cy.get('[data-testid="cart-panel"]').should('exist')
    cy.get('[data-testid="cart-item"]').should('have.length', 2)
    cy.get('[data-testid="cart-item"]').first().should('contain', 'Wasserdichte Outdoor-Jacke')
    cy.get('[data-testid="cart-item"]').eq(1).should('contain', 'Kabellose Over-Ear-Kopfhörer')
    cy.get('[data-testid="cart-grand-total"]').should('contain', '278,99')

    // erneut oeffnen -> gleiche Reihenfolge (immer gleiche Darstellung)
    cy.contains('db-button', 'Zurück').click()
    cy.get('header').contains('db-button', 'Warenkorb').click()
    cy.get('[data-testid="cart-item"]').first().should('contain', 'Wasserdichte Outdoor-Jacke')
  })

  it('scrollt bei neuen Nachrichten automatisch nach unten', () => {
    cy.chatMessage('Zeig mir Produkte')
    cy.chatMessage('Zeig mir mehr Produkte')
    cy.chatMessage('Und noch mehr')
    cy.chatMessage('Zeig mir alles unter 150 €')

    // 4 User- + 4 Agent-Turns unten im Chat sichtbar
    cy.get('.turn.user').should('have.length', 4)
    cy.get('.turn.agent').should('have.length', 4)
    cy.get('.turn.agent').last().should('be.visible')
    cy.get('.conversation').then(($el) => {
      const el = $el[0] as HTMLElement
      expect(el.scrollTop + el.clientHeight).to.be.greaterThan(el.scrollHeight - 4)
    })
  })

  it('ersetzt alte Widgets, sobald eine neue Uebersicht kommt', () => {
    cy.chatMessage('Zeig mir wasserdichte Sachen unter 150 €')
    cy.get('[data-testid="widget-products"]').should('exist')

    cy.chatMessage('Erstelle einen Vergleich der Treffer als Grafik')
    cy.get('[data-testid="showcase"]').should('exist')
    // alte Produktgrid-Ansicht wurde entfernt
    cy.get('[data-testid="widget-products"]').should('not.exist')
  })
})
