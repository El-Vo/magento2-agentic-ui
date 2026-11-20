---
layout: default
title: Architektur-Notizen
---

# Architektur

Siehe `README.md` für Schnellstart und `arc42/` für die vollständige Architekturdokumentation.
Dieses Dokument beschreibt die Umsetzung des Konzepts im Scaffolding.

## Bausteine

```
frontend (React/Vite)          agent (FastAPI)                     magento (Demo-Shop)
  ChatWidget                     ToolRegistry (JSON-Schemas)          GraphQL /graphql
  ProductCardView   ──/chat──►    AgentService ──tool_calls──► Mistral   Storefront API
  CartPanel                       ConfirmGate (/confirm)              Sample Data
  ConfirmDialog                   SessionStore (In-Memory)
  FilterChips                     MagentoClient (GraphQL-Gateway)
```

## Agent-Layer (`agent/`)

- `app/tools/base.py` – Tool-Registry. Jedes Tool hat JSON-Schema-Parameter, eine Phase
  (`browse`, `cart`, `checkout`, `support`, `*`), ein `requires_confirmation`-Flag und optional
  `uses_session`. Dem LLM werden nur die Tools der aktuellen Phase angeboten.
- `app/tools/catalog.py` – `search_products`, `product_details`, `categories`. Jedes Tool ist
  ein kleiner GraphQL-Consumer, der exakt die Felder der UI-Komponenten abfragt (inkl.
  `aggregations` für Filter-Chips und `media_gallery` für Produktbilder/Grafiken).
- `app/tools/cart.py` – `cart_get`, `cart_add`, `cart_update`, `cart_remove`. Alle Mutationen sind
  als `requires_confirmation=True` registriert und liefern den **vollen Warenkorb inkl. items**
  (`normalize_cart` sortiert Items stabil nach id – Badge und Warenkorbansicht sind konsistent).
- `app/tools/checkout.py` – kompletter Checkout: `checkout_overview`, `set_checkout_email`,
  `set_shipping_address`, `set_shipping_method`, `set_payment_method`, `place_order` (alle Mutationen
  mit Confirm-Gate; Zahlungsart nur als Code, nie Zahlungsdaten im LLM).
- `app/tools/showcase.py` – `compose_showcase`: der Agent wählt Layout (hero/compare/moodboard/
  price_chart), Headline, Akzentfarbe (Whitelist) und Produkt-Positionen; das SVG wird serverseitig
  aus den Magento-Produktdaten gerendert (XML-Escaping gegen XSS, Medien-URLs nur vom Magento-Host).
- `app/tools/view.py` – `compose_view`: maßgeschneiderte Ansichten aus DB-UI-Bausteinen
  (Whitelist für Blocktypen/Varianten/Aktionen; Produkt-Positionen gegen `last_results` aufgelöst;
  Showcase-Blöcke mit serverseitigem SVG).
- `app/tools/cms.py` – `cms_page` als RAG-Korpus für Versand-/Retour-/Datenschutzfragen.
- `app/agent.py` – Tool-Calling-Loop (Mistral) **und** Mock-Modus ohne API-Key (voller Flow inkl.
  Confirm-Gate und Showcase). Confirm-Gate: schreibende Tools erzeugen `intent: "confirm_required"`
  und werden erst über `POST /confirm` ausgeführt. Jedem Tool-Ergebnis hängt eine
  `narration` an (der Agent beschreibt, was er tut). `run_events()` liefert außerdem einen
  Live-Event-Stream (`tool_start`/`tool_end` mit Toolname + JSON-Parametern), den
  `POST /chat/stream` als SSE an das Widget streamt. Totals/Preise fließen unverändert aus
  Magento-Tool-Output ins UI.
- `app/session.py` – In-Memory-Sessions: Cart-ID, Phase (`browse`/`cart`/`checkout`), `last_results`
  mit stabilen Positionen („das zweite“ → `resolve_position(2)`), Chat-History nur pro Session.
- `app/magento.py` – Einziger GraphQL-Gateway. Kein SQL, keine Admin-Tokens.
- `app/main.py` – HTTP-API: `POST /chat`, `POST /chat/stream` (SSE), `POST /confirm`, `GET /cart`,
  `POST /cart/add`, `GET /checkout/overview`, `POST /checkout/{address,shipping,payment,place}`,
  `/health`, `/tools`. Die `/checkout/*`-Endpunkte treiben den Widget-Checkout auf dem Warenkorb
  des Demo-Kunden (jede Stufe = explizite UI-Aktion).

## Guardrails (implementiert bzw. vorgesehen)

| Guardrail | Status |
| --- | --- |
| Confirm-Gate für Mutationen | ✅ `AgentService._dispatch` + `/confirm` |
| Preise/Totals nur aus Magento | ✅ Tools zitieren Magento-Output |
| Phase-Scoping der Tools | ✅ `ToolRegistry.for_phase` |
| Prompt-Injection-Redaktion | ✅ System-Prompt markiert Produkttexte als untrusted Daten |
| Live-Tracing pro Tool-Call mit Parametern | ✅ `tool_trace` + SSE `tool_start`/`tool_end` (`/chat/stream`) |
| Narration: Agent beschreibt, was er tut | ✅ `narration` pro Tool + `text`-Events |
| XSS-Schutz bei generierten Grafiken | ✅ XML-Escaping + Farb-Whitelist + Host-Prüfung (`tools/showcase.py`) |
| Payment nie im LLM | ✅ nur Zahlungsart-Code (`set_payment_method`) |
| Tool-Output-Validierung (SKU existiert, Varianten erlaubt) | ⏳ Roadmap |
| Rate-Limits / Tagesbudget | ⏳ Roadmap |
| DSGVO: keine Adressdaten im LLM-Memory | ✅ Formular-Hybrid (Checkout-Formular), Memory nur prozessweit |

## Frontend (`frontend/`)

Jede Komponente ist ein eigener GraphQL-Consumer-Renderer, gefüttert aus Agent-Intents:

| Komponente | Intent | Konzept-Referenz |
| --- | --- | --- |
| `ProductCardView` | `product_list`, `ui_layout.products` | ProductCard |
| `FilterChips` | `product_list.aggregations` | FilterSuggestionChips (Klick sendet Filter als Chat-Nachricht) |
| `CartView` | `cart`, `cart_updated` | CartPanel (live Totals) |
| `CheckoutView` | Widget-Stepper (Adresse → Versand → Zahlung → Prüfen & bestellen) | AddressForm + CheckoutStepper (Formular-Hybrid) |
| `OrderStatusCard` | `order_placed` | OrderStatusCard (Bestellnummer) |
| `ShowcaseView` | `ui_layout` | vom Agenten generierte Grafik (SVG) + Produktkarten |
| `DynamicView` | `ui_view` | maßgeschneiderte Ansicht aus DB-UI-Bausteinen (Whitelist serverseitig) |
| `ProductDetailView` | `product_details` | Detailansicht im Widgetbereich, immer mit Add-to-Cart |
| `ConfirmDialog` | `confirm_required` | ConfirmDialog (zeigt Tool + JSON-Parameter) |
| `PolicyAnswer` | `policy_answer` | PolicyAnswer (RAG + Quellenlink) |
| `ToolTrace` | `tool_trace` / SSE-Events | Live-Anzeige: Toolname + Parameter + Narration im Chat |

Noch offen aus der Komponentenbibliothek: `CompareTray`. Jede Karte verlinkt auf die reguläre Produktseite.

## Magento-Anbindung

- Demo-Shop: Magento Open Source lokal, ohne Docker – Bezug als GitHub-Tag + Packagist
  (`scripts/setup-local.sh`), betrieben mit `php -S` + `scripts/php-router.php` auf Port 8080,
  MariaDB und Elasticsearch als lokale Prozesse unter `.local/` (`scripts/db.sh`, `scripts/search.sh`).
  Demo-Daten kommen aus `scripts/seed-demo-data.php` (kein Marketplace-Login nötig).
  Für einen echten Shop einfach `MAGENTO_BASE_URL` auf dessen Storefront-URL zeigen.
- Lücken der Storefront-API (Bestellstatus nach placeOrder, semantische Suche) werden im
  eigenen Modul `magento-graphql-ext/` ergänzt (Skeleton vorhanden).

## Tests & Doku

- Agent: `make agent-test` (pytest + respx gegen Fake-Gateway: Tools, Confirm-Gate, SSE-Stream,
  Showcase-Escaping, Mock-Full-Flow).
- UI: `make e2e` – Cypress-Suite (`frontend/cypress/`) gegen das gebaute Widget (`vite preview :4173`),
  Agent-API per `cy.intercept` gemockt; Live-Modus: `make e2e-live` (Stack via `make demo`).
  CI: `.github/workflows/e2e.yml`.
- Doku: arc42 unter `docs/arc42/`, veröffentlicht über GitHub Pages (`.github/workflows/docs.yml`,
  `docs/_config.yml`).

## Betriebsaspekte

- Der Agent hält nur Storefront-Berechtigungen (Guest-Cart bzw. Customer-Token des Demo-Kunden).
- Alle Tool-Calls laufen serverseitig; das Widget spricht nie direkt mit Magento.
- Observability: FastAPI-Access-Logs + `/health` + `tool_trace`/SSE pro Turn.
