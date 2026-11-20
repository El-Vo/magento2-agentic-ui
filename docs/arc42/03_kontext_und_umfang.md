---
layout: default
title: 03 – Kontext und Umfang
---

# 3. Kontext und Umfang

## 3.1 Fachlicher Kontext

```
Kunde ──Browser──▶ Chat-Widget (React) ──HTTP/SSE──▶ Agent-API (FastAPI) ──▶ Mistral LLM (Tool-Calling)
                                                          │
                                                          └── GraphQL ──▶ Magento 2 Storefront
                                                          │              (Katalog, Warenkorb, Checkout, CMS)
                                                          └── /confirm, /cart, /checkout/* (Widget-Aktionen)
```

Der Kunde interagiert ausschließlich über das Chat-Widget und die davon gesteuerte Shopansicht.
Alle fachlichen Daten (Produkte, Preise, Lager, Warenkorb, Versandarten, Zahlungsarten, Bestellung)
kommen aus Magento; das LLM orchestriert nur Tool-Aufrufe.

## 3.2 Technischer Kontext (externe Systeme)

| System | Schnittstelle | Zweck |
| --- | --- | --- |
| Magento 2 Storefront | `POST {MAGENTO_BASE_URL}/graphql` (Store-Header, Bearer-Token des Demo-Kunden bzw. Guest-Cart) | Katalog, Warenkorb, Checkout-Mutationen, CMS |
| Mistral API | Chat Completions mit Function-Calling | Tool-Auswahl, Formulierung, Narration |
| Browser des Kunden | HTTP + SSE (`text/event-stream`) gegen Agent-API, Vite-Proxy `/api` | Chat-UI, Live-Tool-Trace, Widgets |

## 3.3 Abgrenzung

**Im Umfang:** Produktrecherche (Suche/Details/Kategorien/Filter), Warenkorb (anzeigen/hinzufügen/ändern/entfernen
mit Confirm-Gate), kompletter Checkout (Adresse → Versand → Zahlung → Bestellung aufgeben mit Bestellnummer),
Support-Antworten aus CMS-Seiten, agenten-generierte Produktgrafiken (Showcase), Live-Tool-Trace mit Parametern,
e2e-Tests (Cypress), arc42-Doku auf GitHub Pages.

**Außerhalb:** Admin-Backend des Agenten, Zahlungsabwicklung mit echten Payment-Providern (nur `checkmo` als
Storefront-Standard), Kundenkonto-Login im UI (Demo-Kunde serverseitig), semantische Vektorsuche (Roadmap Phase 4),
Mehrsprachigkeit, Multi-Store.

[Zurück zur Übersicht](index.md)
