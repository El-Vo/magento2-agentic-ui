---
layout: default
title: 04 – Lösungsstrategie
---

# 4. Lösungsstrategie

| Problem | Lösung | Kernidee |
| --- | --- | --- |
| LLM soll keine Daten erfinden | **Tool-Calling mit typisierten Schemas** gegen die Storefront-GraphQL-API; Preise/Totals nur aus Tool-Output | Deterministische Datenquelle Magento |
| Schreibende Aktionen müssen kontrollierbar sein | **Confirm-Gate**: Mutationstools liefern `confirm_required`, Ausführung erst nach `POST /confirm` | Explizite Kundenbestätigung im UI |
| Kunde soll verstehen, was der Agent tut | **SSE-Streaming** (`POST /chat/stream`): Narration + `tool_start`/`tool_end` mit Toolname und JSON-Parametern live im Chat | Transparenz statt „Black Box“ |
| Shopansicht soll sich an den Kunden anpassen | **UI-Intents** (`product_list`, `cart`, `checkout`, `order_placed`, `ui_layout`) rendern dedizierte React-Komponenten in der Widget-Spalte | Agent steuert die Ansicht, nicht nur Text |
| Agent soll Grafiken mit den Produkten erstellen | **`compose_showcase`**: wählt Layout (hero/compare/moodboard/price_chart), Headline, Akzentfarbe, Produkt-Positionen; SVG wird serverseitig aus Magento-Daten gerendert (escaped) | Dynamische, sichere Grafiken |
| Kompletter Kauf ohne Admin-Rechte | **Checkout-Toolkette** `checkout_overview → set_shipping_address → set_shipping_method → set_payment_method → place_order` auf Guest-/Customer-Cart; Widget-Checkout-Endpunkte `/checkout/*` für den formularbasierten Ablauf | Storefront-only, Payment nie im LLM |
| Entwicklung ohne Magento/LLM-Key | **Mock-Modus** des Agenten (regelbasierte Tool-Auswahl) + **Cypress-Intercepts** für e2e ohne Backend | CI und lokale UI-Tests |
| Doku auffindbar veröffentlichen | **arc42 unter `docs/` + GitHub Pages** (Jekyll, Actions-Workflow) | Doku lebt im Repo |

Die Entscheidungen im Detail mit Alternativen und Begründung: [Kapitel 9](09_architekturentscheidungen.md).

[Zurück zur Übersicht](index.md)
