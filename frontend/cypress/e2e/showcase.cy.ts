/// <reference types="cypress" />

/**
 * Dynamische Grafiken: Der Agent erstellt auf Wunsch eine Grafik (SVG) mit
 * den Produkten der letzten Suche – die Shopansicht wird so an die Wuensche
 * des Nutzers angepasst.
 */
describe('Agenten-generierte Produktgrafiken (Showcase)', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('erstellt auf Zuruf einen Produktvergleich als Grafik in der Shopansicht', () => {
    cy.chatMessage('Zeig mir wasserdichte Sachen unter 150 €')
    cy.get('[data-testid="product-card"]').should('have.length', 3)

    cy.chatMessage('Erstelle einen Vergleich der Treffer als Grafik')

    // Tool-Aufruf compose_showcase mit Parametern sichtbar
    cy.get('[data-testid="tool-step"]').last().within(() => {
      cy.get('[data-testid="tool-name"]').should('contain', 'compose_showcase')
      cy.get('[data-testid="tool-args"]').should('contain', '"layout":"compare"')
    })

    // Die Grafik (SVG) erscheint in der Shopansicht und enthaelt die Produkte
    cy.get('[data-testid="showcase"]', { timeout: 10000 }).should('exist')
    cy.get('[data-testid="showcase-svg"] svg').should('exist')
    cy.get('[data-testid="showcase-svg"]').should('contain', 'Wasserdichte Outdoor-Jacke')
    cy.get('[data-testid="showcase-svg"]').should('contain', '149.00')
    cy.get('[data-testid="showcase"]').should('contain', 'Vom Agenten generiert')

    // Zugehörige Produktkarten inkl. "In den Warenkorb" unter der Grafik
    cy.get('[data-testid="showcase"] [data-testid="product-card"]').should('have.length', 3)
    cy.get('[data-testid="showcase"] [data-testid="product-card"]').first().contains('button', 'In den Warenkorb').click()
    cy.get('[data-testid="cart-badge"]').should('contain', '1')
  })

  it('erstellt ein Moodboard, wenn danach gefragt wird', () => {
    cy.chatMessage('Zeig mir Produkte')
    cy.chatMessage('Mach ein Moodboard daraus')

    cy.get('[data-testid="tool-step"]').last().find('[data-testid="tool-args"]').should('contain', '"layout":"moodboard"')
    cy.get('[data-testid="showcase-svg"] svg', { timeout: 10000 }).should('exist')
  })
})
