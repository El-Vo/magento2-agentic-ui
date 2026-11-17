---
layout: default
title: 09 – Architekturentscheidungen
---

# 9. Architekturentscheidungen (ADRs)

## ADR-001: LLM orchestriert nur typisierte Tools, nie Rohdaten
- **Status:** angenommen
- **Kontext:** LLM-Antworten dürfen keine erfundenen Preise/SKUs enthalten.
- **Entscheidung:** Alle fachlichen Daten kommen über Tool-Calls aus der Magento-Storefront-GraphQL-API
  (`app/magento.py` ist das einzige Gateway). Das LLM erhält JSON-Schemas (`ToolRegistry`) und wählt
  nur Tool + Parameter.
- **Alternativen:** SQL-Tool (abgelehnt: Sicherheit), RAG-only (abgelehnt: keine Live-Daten).
- **Folgen:** neue Datenquellen brauchen neue Tools; Tool-Output-Validierung (SKU existiert) ist Roadmap.

## ADR-002: Confirm-Gate für alle schreibenden Aktionen
- **Status:** angenommen
- **Entscheidung:** Mutationstools (`cart_add/update/remove`, `set_*`, `place_order`) sind
  `requires_confirmation=True`; der Agent liefert `confirm_required`, ausgeführt wird erst nach
  `POST /confirm` mit exakt den angezeigten Parametern.
- **Folgen:** Widget-Direktaktionen (`/cart/add`, `/checkout/*`) gelten als explizite UI-Aktion und
  umgehen das Gate – dokumentiert in Kap. 6.

## ADR-003: SSE-Streaming statt reiner Request/Response für den Chat
- **Status:** angenommen
- **Entscheidung:** `POST /chat/stream` (text/event-stream) mit `tool_start`/`tool_end` (inkl. args +
  narration) und `done`; das Widget rendert den Tool-Trace live mit Parametern und die Narration des
  Agenten. `POST /chat` bleibt als nicht-streamende Variante bestehen.
- **Alternativen:** Polling (verworfen: Latenz), WebSockets (Overkill für unidirektionalen Flow).

## ADR-004: UI-Intents statt Freitext-Rendering
- **Status:** angenommen
- **Entscheidung:** Agenten-Antworten enthalten `intents[]` (strukturierte JSON-Objekte), die
  `IntentRenderer.tsx` in Komponenten mapped (Produktkarten, Warenkorb, Checkout-Stepper, Showcase …).
- **Folgen:** neue UI-Fähigkeiten = neues Intent + Komponente; siehe Kap. 5.4.

## ADR-005: Agenten-generierte Grafiken serverseitig als SVG mit Escaping
- **Status:** angenommen
- **Entscheidung:** `compose_showcase` rendert SVG serverseitig aus Session-Produkten (Magento-Daten):
  alle Texte XML-escaped, Akzentfarben aus Whitelist, `<image>` nur mit Magento-Host-URL. Layouts:
  `hero`, `compare`, `moodboard`, `price_chart`. Produkt-Positionen werden gegen `last_results`
  aufgelöst, nie frei erfunden.
- **Alternativen:** Bildgenerierungs-API (abgelehnt: Kosten, Lizenz, nicht deterministisch);
  clientseitiges Rendering (abgelehnt: Escaping-Schicht soll serverseitig liegen).

## ADR-006: Lokaler Stack ohne Docker
- **Status:** angenommen
- **Entscheidung:** Magento 2 (GitHub-Tag + Packagist) läuft per `php -S` mit `scripts/php-router.php`,
  MariaDB und Elasticsearch als lokale Prozesse unter `.local/`; Devcontainer ohne docker-in-docker,
  Setup idempotent via `scripts/codespace-up.sh` (auch für GitHub Prebuilds).
- **Alternativen:** Docker Compose (abgelehnt für dieses Repo: Sandbox/Codespaces-freundlich ohne dind).

## ADR-007: Demo-Kunde serverseitig (Customer-Token)
- **Status:** angenommen
- **Entscheidung:** Der Agent handelt im Namen eines dauerhaften Demo-Kunden
  (`createCustomerV2` + `generateCustomerToken`, gecacht). Widget-Endpunkte nutzen dessen Warenkorb.
  Session-basierte Chats nutzen Guest-Carts.
- **Folgen:** DSGVO-Konzept für Adressdaten siehe Kap. 11; echtes Kunden-Login ist Phase 3.

## ADR-008: Mock-Modus + Cypress-Intercepts für testbares e2e ohne LLM/Magento
- **Status:** angenommen
- **Entscheidung:** Ohne `MISTRAL_API_KEY` wählt der Agent regelbasiert Tools (voller Flow inkl.
  Confirm-Gate und Showcase). Cypress specced gegen `cy.intercept`-Fixtures (default) oder live
  (`E2E_MOCK_API=false`).
- **Folgen:** CI ist self-contained; Live-e2e gegen echten Stack optional (`make e2e-live`).

## ADR-009: arc42-Dokumentation auf GitHub Pages
- **Status:** angenommen
- **Entscheidung:** arc42-Kapitel unter `docs/arc42/`, Jekyll (`docs/_config.yml`, theme minima),
  Deployment via GitHub Actions (`.github/workflows/docs.yml`) mit `pages: write`.

[Zurück zur Übersicht](index.md)
