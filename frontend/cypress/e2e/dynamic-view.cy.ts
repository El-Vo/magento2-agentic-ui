/// <reference types="cypress" />

/**
 * Vom Agenten gebaute Ansichten (compose_view): DB-UI-Bausteine, die auf den
 * Request des Nutzers eingehen – inkl. Add-to-Cart fuer jedes genannte Produkt.
 */
describe('Agenten-gebaute DB-UI-Ansicht (compose_view)', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('baut auf Request eine Uebersichtsseite mit Produktkarten und Add-to-Cart-Aktionen', () => {
    cy.chatMessage('Zeig mir wasserdichte Sachen unter 150 €')
    cy.get('[data-testid="product-card"]').should('have.length', 3)

    cy.chatMessage('Baue mir eine Übersichtsseite für die Treffer')

    // Tool-Aufruf mit Parametern live sichtbar
    cy.get('[data-testid="tool-step"]').last().within(() => {
      cy.get('[data-testid="tool-name"]').should('contain', 'compose_view')
      cy.get('[data-testid="tool-args"]').should('contain', '"blocks"')
    })

    // Ansicht im Widgetbereich (alte Produktgrid wurde ersetzt)
    cy.get('[data-testid="dynamic-view"]', { timeout: 10000 }).should('exist')
    cy.get('[data-testid="widget-products"]').should('not.exist')
    cy.get('[data-testid="dynamic-view"]').should('contain', 'Deine Übersicht')
    cy.get('[data-testid="dynamic-view"]').should('contain', 'DB-UI')

    // Produktkarten mit Add-to-Cart-Button in der Ansicht
    cy.get('[data-testid="view-product-cards"] [data-testid="product-card"]').should('have.length', 3)
    cy.get('[data-testid="view-product-cards"] [data-testid="product-card"]').first().should('contain', 'In den Warenkorb')

    // Action-Button "Erstes in den Warenkorb" funktioniert
    cy.get('[data-testid="view-actions"]').contains('db-button', 'Erstes in den Warenkorb').click()
    cy.get('[data-testid="cart-badge"]').should('contain', '1')

    // direkter Button auf der Produktkarte ebenfalls vorhanden
    cy.get('[data-testid="view-product-cards"] [data-testid="product-card"]').eq(1).contains('db-button', 'In den Warenkorb').click()
    cy.get('[data-testid="cart-badge"]').should('contain', '2')
  })
})
