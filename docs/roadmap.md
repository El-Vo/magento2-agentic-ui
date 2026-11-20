---
layout: default
title: Roadmap
---

# Roadmap

## Phase 1 – MVP ✅
- [x] Tool-Registry mit JSON-Schemas, Phase-Scoping
- [x] Tools: `search_products`, `product_details`, `categories`, `cart_get`, `cart_add`,
      `cart_update`, `cart_remove`, `cms_page`
- [x] Confirm-Gate für alle Mutationen
- [x] Session-Store mit `last_results` (Positions-Auflösung)
- [x] Chat-Widget: ProductCard, FilterChips, CartView, ConfirmDialog, PolicyAnswer
- [x] Magento-Demo-Shop lokal ohne Docker (php -S + MariaDB + Elasticsearch via `scripts/`, Devcontainer ohne docker-in-docker)
- [x] Mock-Modus ohne LLM-Kosten (voller Flow: Suche, Warenkorb+Confirm, Checkout, Showcase)
- [x] Live-Transparenz: SSE (`/chat/stream`) mit `tool_start`/`tool_end` (Tool + JSON-Parameter) und Narration im Chat
- [ ] LLM-Prompt-Tuning für Filterübersetzung („wasserdicht unter 150 €“ → `price.lt` + Attribute)

## Phase 2 – Checkout-Kette & dynamische Grafiken ✅
- [x] Tools: `checkout_overview`, `set_checkout_email`, `set_shipping_address`,
      `set_shipping_method`, `set_payment_method`, `place_order` (immer mit Magento-Totals, Payment nie im LLM)
- [x] Komponenten: `CheckoutView`-Stepper (Adresse → Versand → Zahlung → Prüfen & bestellen),
      `OrderStatusCard` (Bestellnummer)
- [x] Widget-Endpunkte `/checkout/*` auf dem Warenkorb des Demo-Kunden
- [x] `compose_showcase`: agenten-generierte SVG-Grafiken (hero/compare/moodboard/price_chart)
      mit XML-Escaping, Farb-Whitelist und Magento-Host-Prüfung
- [x] Cypress-e2e-Suite (`frontend/cypress/`): kompletter Userflow, Tool-Trace, Showcase (`make e2e`)
- [x] arc42-Doku unter `docs/arc42/` + GitHub Pages (`.github/workflows/docs.yml`)
- [ ] Tool-Output-Validierung: SKU existiert, konfigurierbare Optionen erlaubt
- [ ] Rate-Limits pro Session, LLM-Tagesbudget

## Phase 3 – Konto & Support
- [ ] echtes Kunden-Login im UI (heute: serverseitiger Demo-Kunde), `OrderStatusCard` für Kunden-Orders, `createProductReview`
- [ ] RAG über CMS-Policies mit Embeddings statt fixer `page_id`
- [ ] DSGVO-Review: Memory-Konzept, Aufbewahrungsfristen, Session-Persistenz

## Phase 4 – Semantik & Personalisierung
- [ ] Vektorindex über Produktdaten (OpenSearch kNN, eigenes Modul `magento-graphql-ext`)
- [ ] Personalisierte Vorschläge
- [ ] Merchant-Assistent (Admin-Seite, getrennte Berechtigungssphäre)
