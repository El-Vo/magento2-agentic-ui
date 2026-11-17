# Roadmap

## Phase 1 – MVP (dieses Scaffolding) ✅
- [x] Tool-Registry mit JSON-Schemas, Phase-Scoping
- [x] Tools: `search_products`, `product_details`, `categories`, `cart_get`, `cart_add`,
      `cart_update`, `cart_remove`, `cms_page`
- [x] Confirm-Gate für alle Mutationen
- [x] Session-Store mit `last_results` (Positions-Auflösung)
- [x] Chat-Widget: ProductCard, FilterChips, CartPanel, ConfirmDialog, PolicyAnswer
- [x] Magento-Demo-Shop via docker-compose, Codespace-fähig (Devcontainer)
- [x] Mock-Modus ohne LLM-Kosten
- [ ] LLM-Prompt-Tuning für Filterübersetzung („wasserdicht unter 150 €“ → `price.lt` + Attribute)

## Phase 2 – Checkout-Kette
- [ ] Tools: `setGuestEmailOnCart`, `setShippingAddressesOnCart`, `setShippingMethod`,
      `setPaymentMethod`, `placeOrder` (immer mit Magento-Totals, Payment nie im LLM)
- [ ] Komponenten: `AddressForm` (Agent extrahiert, Formular validiert), `CheckoutStepper`
- [ ] Tool-Output-Validierung: SKU existiert, konfigurierbare Optionen erlaubt
- [ ] Rate-Limits pro Session, LLM-Tagesbudget, Tool-Call-Tracing

## Phase 3 – Konto & Support
- [ ] `generateCustomerToken`, Customer-Queries, `OrderStatusCard`, `createProductReview`
- [ ] RAG über CMS-Policies mit Embeddings statt fixer `page_id`
- [ ] DSGVO-Review: Memory-Konzept, Aufbewahrungsfristen

## Phase 4 – Semantik & Personalisierung
- [ ] Vektorindex über Produktdaten (OpenSearch kNN, eigenes Modul `magento-graphql-ext`)
- [ ] Personalisierte Vorschläge
- [ ] Merchant-Assistent (Admin-Seite, getrennte Berechtigungssphäre)
