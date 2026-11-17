/// <reference types="cypress" />

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Tippt eine Nachricht in den Composer und schickt sie ab. */
      chatMessage(message: string): Chainable<void>
    }
  }
}

Cypress.Commands.add('chatMessage', (message: string) => {
  cy.get('.composer db-input input', { timeout: 10000 }).clear().type(message, { delay: 5 })
  cy.get('.composer').contains('button', 'Senden').click()
})

export {}
