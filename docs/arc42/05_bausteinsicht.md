---
layout: default
title: 05 – Bausteinsicht
---

# 5. Bausteinsicht

## 5.1 Überblick (Ebene 1)

```
┌────────────────────────────┐     ┌──────────────────────────────┐     ┌─────────────────────────┐
│  frontend/  Chat-Widget    │────▶│  agent/  FastAPI-Agent       │────▶│  Mistral LLM            │
│  React/Vite, DB-UI         │SSE  │  Tool-Registry, Sessions,    │     │  (Function-Calling)     │
│  Chat-Pane + Widget-Pane   │◀────│  Confirm-Gate, SSE-Stream    │◀────│                         │
└────────────────────────────┘     └──────────────┬───────────────┘     └─────────────────────────┘
                                                      │ GraphQL (Storefront-Only)
                                                      ▼
                                     ┌──────────────────────────────┐     ┌─────────────────────────┐
                                     │  magento2/  Demo-Shop        │     │  MariaDB + Elasticsearch│
                                     │  php -S + php-router.php     │◀───▶│  lokale Prozesse        │
                                     └──────────────────────────────┘     └─────────────────────────┘
```

Begleitend: `scripts/` (lokale Dienste, kein Docker), `magento-graphql-ext/` (eigenes GraphQL-Modul,
Skeleton), `frontend/cypress/` (e2e), `docs/` (arc42 + Pages), `.github/workflows/` (CI: e2e + docs),
`.devcontainer/` (Codespaces ohne docker-in-docker).

## 5.2 Ebene 2: agent/ (FastAPI)

| Baustein | Datei | Verantwortung |
| --- | --- | --- |
| HTTP-API | `app/main.py` | `POST /chat`, `POST /chat/stream` (SSE), `POST /confirm`, `GET /cart`, `POST /cart/add`, `GET /checkout/overview`, `POST /checkout/{address,shipping,payment,place}`, `/health`, `/tools` |
| Agent-Kern | `app/agent.py` | LLM-Tool-Calling-Loop **und** Mock-Modus; Event-Stream (`tool_start`/`tool_end` mit args + Narration); Confirm-Gate (`_dispatch`); Phasen (`browse`/`cart`/`checkout`); Positionsauflösung („das zweite“) |
| Tool-Registry | `app/tools/base.py` | JSON-Schemas fürs LLM, Phase-Scoping, `requires_confirmation`, `uses_session` |
| Katalog-Tools | `app/tools/catalog.py` | `search_products`, `product_details`, `categories` (inkl. Aggregations für Filter-Chips, Medien für Grafiken) |
| Warenkorb-Tools | `app/tools/cart.py` | `cart_get`, `cart_add` (simple/configurable), `cart_update`, `cart_remove` – Mutationen nur über Confirm-Gate |
| Checkout-Tools | `app/tools/checkout.py` | `checkout_overview`, `set_checkout_email`, `set_shipping_address`, `set_shipping_method`, `set_payment_method`, `place_order` |
| Showcase-Tool | `app/tools/showcase.py` | `compose_showcase`: layout + Positionen → serverseitig gerendertes SVG (XML-escaped, Farb-Whitelist, Medien-URL nur vom Magento-Host) |
| View-Tool | `app/tools/view.py` | `compose_view`: maßgeschneiderte Ansicht aus whitelist-validierten DB-UI-Blöcken (Headline/Text/Tags/Chips/Produktkarten/Showcase/Warenkorb/Aktionen) |
| CMS-Tool | `app/tools/cms.py` | `cms_page` (RAG-Korpus für Versand/Retoure/Datenschutz) |
| Magento-Gateway | `app/magento.py` | einziger GraphQL-Client; Store-Header, Bearer-Token; `createEmptyCart` |
| Demo-Kunde | `app/customer.py` | `createCustomerV2` + `generateCustomerToken`, prozessweit gecacht – Agent handelt im Namen des Demo-Kunden |
| Sessions | `app/session.py` | In-Memory: Cart-ID, Phase, `last_results` (stabile Positionen), Chat-History pro Session |
| Config | `app/config.py` | pydantic-settings aus `.env` |

## 5.3 Ebene 2: frontend/ (React/Vite)

| Baustein | Datei | Verantwortung |
| --- | --- | --- |
| App-Shell | `src/App.tsx` | Chat-Pane (auto-scrollt bei neuen Nachrichten) + Widget-Pane (neueste nicht-konversationelle Übersicht ersetzt alte Widgets); SSE-Streaming; **ToolTrace** live; Confirm-Dialog; State (Cart, Overview, Order) |
| Komponenten | `src/components/IntentRenderer.tsx` | `ProductCardView`, `FilterChips`, `ShowcaseView` (SVG-Grafik), `DynamicView` (agenten-gebaute DB-UI-Ansicht), `ProductDetailView`, `CartView` (sortierte Items), `CheckoutView` (Stepper), `OrderStatusCard`, `ConfirmDialog`, `PolicyAnswer` |
| API-Client | `src/lib/api.ts` | `streamChat` (SSE-Parser), `sendChat`, `confirmAction`, Cart-/Checkout-Endpunkte, Typen |
| e2e | `cypress/` | `userflow.cy.ts` (kompletter Flow), `tool-trace.cy.ts` (live Tools+Parameter), `showcase.cy.ts` (Grafiken); Mock-API per `cy.intercept` (default), Live-Modus via `E2E_MOCK_API=false` |

## 5.4 Schnittstellen (Auswahl)

**SSE-Protokoll `POST /chat/stream`** (siehe auch Kap. 8.2):

```
event: tool_start   data: {"tool":"search_products","args":{"search":"jacken","filter":{"price":{"lt":"150"}}},"narration":"Ich durchsuche den Katalog …"}
event: tool_end     data: {"tool":"search_products","args":{…},"intent":"product_list","narration":"… 3 Treffer."}
event: text         data: {"text":"Hier sind …"}
event: done         data: {"result":{"text":"…","intents":[…]},"tool_trace":[{tool,args,status,intent,narration}]}
```

**UI-Intents** (JSON in `intents[]`): `product_list`, `product_details`, `category_list`, `cart`, `cart_updated`,
`checkout`, `order_placed`, `confirm_required`, `ui_layout`, `policy_answer`, `error` – jedes Intent hat ein
`product_list`-Card mit `position`, `sku`, `name`, `price`, `stock_status`, `image`.

[Zurück zur Übersicht](index.md)
