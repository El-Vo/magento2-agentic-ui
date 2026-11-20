---
layout: default
title: Dokumentation
---

# Magento 2 Agentic UI – Dokumentation

Konversationeller Shop-Agent auf Magento 2: Ein LLM-Agent mit typisierten Tools gegen die
öffentliche Magento-2-GraphQL-Storefront-API, gerendert durch maßgeschneiderte React-UI-Komponenten.

- **[arc42- Architekturdokumentation](arc42/index.md)** – vollständige Dokumentation nach dem
  arc42-Template (Einführung/Ziele, Kontext, Bausteine, Laufzeitsicht, Verteilung, Querschnitt,
  Entscheidungen, Qualität, Risiken, Glossar)
- **[Architektur-Notizen (kurz)](architecture.md)** – Umsetzung im Scaffolding, Guardrails
- **[Roadmap](roadmap.md)** – Phasen und Ausbaustufen
- **[README](../README.md)** – Schnellstart lokal (kein Docker), Devcontainer, Konfiguration

## Kernidee

```
Chat-Widget (React/Vite) ──HTTP/SSE──▶ Agent-Layer (FastAPI) ──Tool Calls──▶ LLM (Mistral)
                                             │
                                             └── GraphQL ──▶ Magento 2 Storefront (lokal oder echt)
```

Der Agent **beschreibt im Chat, was er tut**, zeigt **live jeden Tool-Aufruf mit Parametern**
(SSE-Stream) und rendert **UI-Intents** (Produktkarten, Warenkorb, Checkout-Stepper, vom Agenten
generierte Produktgrafiken) in der Shopansicht – das UI wird so dynamisch an die Wünsche des
Nutzers angepasst.

Der komplette Userflow – Produktrecherche → Warenkorb → Checkout → Bestellung – ist abgebildet
und per **Cypress-e2e-Suite** (`frontend/cypress/`) abgesichert.
