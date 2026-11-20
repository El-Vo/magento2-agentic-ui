/// <reference types="cypress" />

/**
 * Live-Sichtbarkeit der Agenten-Aktivitaet: Der Agent beschreibt im Chat,
 * was er tut (Narration) und jeder Tool-Aufruf erscheint live mit Namen und
 * exakten Parametern.
 */
describe('Live-Tool-Trace und Agenten-Narration im Chat', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('zeigt jeden Tool-Aufruf mit Parametern und Erklaerung', () => {
    cy.chatMessage('Zeig mir wasserdichte Sachen unter 150 €')

    // Tool-Name (technisch) + sprechendes Label + JSON-Parameter
    cy.get('[data-testid="tool-step"]').should('have.length.at.least', 1)
    cy.get('[data-testid="tool-step"]').first().within(() => {
      cy.get('[data-testid="tool-name"]').should('have.text', 'search_products')
      cy.get('.tool-label').should('contain', 'Produktsuche')
      cy.get('[data-testid="tool-args"]').should('contain', '"search":"wasserdichte sachen"')
      cy.get('[data-testid="tool-args"]').should('contain', '"price":{"lt":"150"}')
    })

    // Narration: der Agent erklaert, was er gerade tut
    cy.get('.narration').should('have.length.at.least', 1)
    cy.get('.narration').first().should('contain', 'Ich durchsuche den Katalog')

    // Finale Antwort des Agenten im Chat
    cy.get('.turn.agent .bubble').should('contain', 'Magento')
  })

  it('zeigt den Status "wartet auf Bestätigung" beim Confirm-Gate an', () => {
    cy.chatMessage('Zeig mir jacken')
    cy.get('[data-testid="product-card"]').should('exist')
    cy.chatMessage('Lege das erste in den Warenkorb')

    cy.get('[data-testid="tool-step"]').last().as('step')
    cy.get('@step').find('[data-testid="tool-name"]').should('contain', 'cart_add')
    cy.get('@step').find('[data-testid="tool-args"]').should('contain', 'BE-JACKE-03')
    cy.get('@step').should('contain', 'wartet auf Bestätigung')
    cy.get('@step').find('.tool-narration').should('contain', 'bestätige')
  })
})
