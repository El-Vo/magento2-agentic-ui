import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    // Default: vite preview (scripts/e2e.sh). Override per CLI: --config baseUrl=https://...
    baseUrl: 'http://localhost:4173',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    fixturesFolder: 'cypress/fixtures',
    video: false,
    screenshotOnRunFailure: true,
    // db-ui Web Components rendern native Elemente im Shadow DOM (db-button -> button, db-input -> input)
    includeShadowDom: true,
    env: {
      // Default: Agent-API wird per cy.intercept gemockt (Self-contained, kein Magento noetig).
      // Live-Modus gegen echten Agent+Magento: cypress run --env E2E_MOCK_API=false
      E2E_MOCK_API: true,
    },
    setupNodeEvents() {
      // keine Node-Events noetig – alles laeuft ueber cy.intercept im Support-File
    },
  },
})
