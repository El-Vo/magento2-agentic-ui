---
layout: default
title: 10 – Qualitätsanforderungen
---

# 10. Qualitätsanforderungen

## 10.1 Qualitätsszenarien

| # | Szenario | stimulus | erwartete Reaktion | Maßnahme |
| --- | --- | --- | --- | --- |
| Q1 | Kompletter Kauf | Kunde recherchiert, legt in Warenkorb, checkt out | Bestellung mit Bestellnummer aus Magento | Cypress `userflow.cy.ts`; pytest Mock-Flow |
| Q2 | Keine erfundenen Preise | Agent antwortet auf Preisfrage | Betrag exakt aus Magento-Tool-Output | Tool-Only-Architektur (ADR-001); Tests gegen Fake-Gateway |
| Q3 | Schreibende Aktion ohne Bestätigung | Agent will `cart_add` ausführen | zuerst `confirm_required`, keine Mutation | Confirm-Gate (ADR-002); `test_confirm_gate_blocks_mutations` |
| Q4 | Transparenz des Agenten | Chat-Nachricht wird bearbeitet | live `tool_start/tool_end` mit Tool + JSON-Parametern + Narration im Chat | SSE (ADR-003); Cypress `tool-trace.cy.ts` |
| Q5 | Dynamische Grafik | „Erstelle einen Vergleich“ | SVG-Grafik mit den Produkten in der Shopansicht | `compose_showcase` + `ShowcaseView`; Cypress `showcase.cy.ts` |
| Q6 | XSS über Produkttexte | Produktname enthält `<script>` | SVG/text escaped, kein Script ausführbar | XML-Escaping + Whitelist; `test_showcase.py` |
| Q7 | CI ohne Magento/LLM | Push auf main | e2e grün via Intercept-Mocks, Doku deployt | `.github/workflows/e2e.yml`, `docs.yml` |

## 10.2 Testpyramide

- **Unit/Integration (pytest, `agent/tests/`)**: Tool-Registry & Phasen, Katalog/Cart/Checkout-Tools gegen
  respx-Fake-Gateway, Confirm-Gate, SSE-Stream (ASGI-Transport), Showcase-Escaping/Whitelist,
  Session-Positionen & Phasen, Mock-Full-Flow. Ausführung: `make agent-test`.
- **e2e (Cypress, `frontend/cypress/`)**: kompletter Userflow (Recherche → Live-Trace → Warenkorb →
  Checkout-Stepper → Bestellung), Confirm-Gate, Tool-Trace-Sichtbarkeit, Showcase-Grafiken.
  Ausführung: `make e2e` (mock) / `make e2e-live` (echter Stack), CI siehe Kap. 7.
- **Build/Typecheck**: `tsc -b && vite build` (Frontend), pytest (Agent).

[Zurück zur Übersicht](index.md)
