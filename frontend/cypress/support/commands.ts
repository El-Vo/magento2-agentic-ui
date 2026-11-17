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
  // db-input rendert das native input im Shadow DOM (includeShadowDom: true)
  cy.get('.composer db-input input', { timeout: 10000 }).clear().type(message, { delay: 5 })
  // sicherstellen, dass der React-State das Eingabefeld mitgenommen hat
  cy.get('.composer db-input').should(($el) => {
    expect(($el[0] as unknown as { value: string }).value).to.eq(message)
  })
  // Formular deterministisch absenden (db-button-Text liegt im Slot -> requestSubmit statt Klick)
  cy.get('.composer').then(($form) => {
    ($form[0] as HTMLFormElement).requestSubmit()
  })
})

export {}
