---
layout: default
title: 12 – Glossar
---

# 12. Glossar

| Begriff | Bedeutung |
| --- | --- |
| **Agent** | FastAPI-Service (`agent/`), der LLM-Tool-Calls orchestriert und Intents liefert |
| **Chat-Widget** | React-App (`frontend/`): Chat-Pane (links) + Widget-Pane/Shopansicht (rechts) |
| **Confirm-Gate** | Mechanismus: schreibende Tools liefern `confirm_required` und laufen erst nach `POST /confirm` |
| **Guest-Cart / Customer-Cart** | anonymer bzw. kundenbezogener Warenkorb in Magento (Token-basiert) |
| **Intent / UI-Intent** | strukturiertes JSON in der Agent-Antwort, das eine UI-Komponente rendert (`product_list`, `cart`, `checkout`, `order_placed`, `ui_layout`, …) |
| **Mock-Modus** | Betrieb des Agenten ohne `MISTRAL_API_KEY`: regelbasierte Tool-Auswahl für Dev/e2e |
| **Narration** | vom Agenten erzeugter erklärender Satz zu jedem Schritt („Ich durchsuche den Katalog …“) |
| **SSE** | Server-Sent Events (`POST /chat/stream`, `text/event-stream`) für Live-Tool-Trace + Narration |
| **Showcase / `compose_showcase`** | Tool + Intent für agenten-generierte Produktgrafiken (SVG: hero/compare/moodboard/price_chart) |
| **Tool** | typisierter GraphQL-Consumer mit JSON-Schema (z. B. `search_products`, `cart_add`, `place_order`) |
| **Tool-Trace** | Liste der Tool-Aufrufe eines Turns mit `tool`, `args`, `status`, `narration` – live im Chat sichtbar |
| **Phase** | Session-Zustand (`browse`/`cart`/`checkout`), steuert welche Tools dem LLM angeboten werden |
| **Storefront-API** | öffentliche Magento-2-GraphQL-Schnittstelle `/graphql` (keine Admin-API) |
| **arc42** | Template für Architekturdokumentation (12 Kapitel), hier unter `docs/arc42/` |
| **e2e-Suite** | Cypress-Tests unter `frontend/cypress/` (Userflow, Tool-Trace, Showcase) |
| **Demo-Kunde** | serverseitig angelegtes Kundenkonto (`demo.kunde@agentic.local`), dessen Token der Agent nutzt |

[Zurück zur Übersicht](index.md)
