---
layout: default
title: 08 – Querschnittliche Konzepte
---

# 8. Querschnittliche Konzepte

## 8.1 Guardrails (Sicherheit & Datenintegrität)

| Guardrail | Umsetzung |
| --- | --- |
| LLM erzeugt nie SQL/freie Daten | nur typisierte Tool-Calls gegen Storefront-GraphQL (`app/magento.py` ist einziges Gateway) |
| Preise/Totals nur aus Magento | Tools zitieren Magento-Output; UI rendert `prices` unverändert |
| Confirm-Gate | alle Mutationen `requires_confirmation=True` → `confirm_required`-Intent → Ausführung erst nach `POST /confirm` |
| Prompt-Injection-Redaktion | System-Prompt markiert Produkt-/CMS-Texte als untrusted |
| XSS-Schutz bei generierten Grafiken | `compose_showcase` XML-escaped alle Produkttexte, Akzentfarben nur aus Whitelist, Medien-URLs nur vom Magento-Host (`app/tools/showcase.py`) |
| Payment nie im LLM | nur Zahlungsart-**Code** (z. B. `checkmo`); Formulare erfassen Zahlungsdaten im Shop |
| Storefront-only | Guest-/Customer-Token, kein Admin-Token |

## 8.2 SSE-Protokoll & Live-Transparenz

`POST /chat/stream` liefert `text/event-stream`:

- `tool_start {tool, args, narration}` – sobald der Agent ein Tool aufruft (Parameter live sichtbar)
- `tool_end {tool, args, intent, narration}` – mit Ergebnis-Intent und erzeugter Narration
- `text {text}` – Antworttext des Modells
- `done {result:{text, intents}, tool_trace:[…]}` – kompletter Trace mit `args`, `status` (`running|done|confirm_required`), `narration`

Das Frontend rendert daraus den **ToolTrace** (Toolname + JSON-Parameter + „läuft…“) und die
**Narration** („Ich durchsuche den Katalog nach …“) – der Agent beschreibt also, was er tut, statt
nur Tool-Calls anzuzeigen. Gleiches Protokoll im Mock-Modus (regelbasiert), dadurch e2e-testbar.

## 8.3 UI-Intents & dynamische Shopansicht

Der Agent antwortet mit strukturierten Intents, die dedizierte Komponenten rendern:
`product_list` (Karten + Filter-Chips), `product_details` (Detailansicht mit Add-to-Cart),
`cart`/`cart_updated` (Warenkorb-Panel), `checkout`, `order_placed` (Bestellkarte),
`confirm_required` (Confirm-Dialog), `ui_layout` (**Showcase-Grafik**), `ui_view`
(**agenten-gebaute DB-UI-Ansicht**), `policy_answer` (CMS-Quelle). Nicht-konversationelle
Übersichten erscheinen im Widgetbereich und ersetzen dort die vorherige Ansicht; der Chat
zeigt nur Konversation (Text, Narration, Tool-Trace, Confirm, Policy) und scrollt auto. nach unten.

## 8.4 Sessions & Memory

In-Memory pro Session (`app/session.py`): Guest-/Customer-Cart-ID, Phase, `last_results` mit stabilen
Positionen („das zweite“ → `resolve_position(2)`), Chat-History. **Keine Adressdaten im LLM-Memory**
(Formular-Hybrid im Checkout); Aufbewahrung nur prozessweit – Persistenz und Löschfristen siehe Kap. 11.

## 8.5 Phasen-Scoping der Tools

`browse` (search/details/categories) → `cart` → `checkout`; `compose_showcase` und `cms_page` sind
phasenunabhängig. Dem LLM werden nur die Tools der aktuellen Phase angeboten.

## 8.6 Observability & Tests

- Agent: `/health`, `/tools` (Manifest), strukturierter `tool_trace` pro Turn; pytest mit respx
  (Fake-Gateway) deckt Tools, Confirm-Gate, SSE und Mock-Flow ab (`agent/tests/`).
- UI: Cypress-e2e (`frontend/cypress/`) prüft den kompletten Userflow inkl. Live-Tool-Trace und
  Showcase gegen gemocktes API (default) oder live (`E2E_MOCK_API=false`).
- CI: `.github/workflows/e2e.yml` (Cypress), `.github/workflows/docs.yml` (Pages).

[Zurück zur Übersicht](index.md)
