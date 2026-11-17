---
layout: default
title: 02 – Rahmenbedingungen
---

# 2. Rahmenbedingungen

## 2.1 Organisatorisch

- Open-Source-Projekt (Magento 2 Open Source als Demo-Shop); kein Adobe-Commerce-Cloud-Login nötig.
- Lokale Entwicklung **ohne Docker**: alle Dienste als normale Prozesse (PHP built-in server,
  MariaDB, Elasticsearch-Tarball, uvicorn, Vite).
- Devcontainer/Codespaces ohne docker-in-docker; komplettes Setup idempotent über
  `scripts/codespace-up.sh` (auch von GitHub Prebuilds ausgeführt).
- Dokumentation wird über **GitHub Pages** veröffentlicht (Jekyll, Workflow
  `.github/workflows/docs.yml`).

## 2.2 Technisch

| Bereich | Vorgabe |
| --- | --- |
| Agent | Python 3.11+, FastAPI, httpx, Mistral-SDK (`mistralai`), pydantic-settings |
| Frontend | React 18 + TypeScript + Vite 5, DB-UI Web Components (`@db-ui/react-elements`, Assets neutralisiert, siehe `vite.config.ts`) |
| Shop | Magento 2 Open Source 2.4.7 (GitHub-Tag + Packagist), Storefront-GraphQL `/graphql` |
| Tests | Agent: pytest + respx (Fake-Gateway); UI: Cypress 16 (`frontend/cypress/`) |
| LLM | Mistral-Modell mit Function-Calling (`AGENT_MODEL`, default `mistral-large-latest`); ohne `MISTRAL_API_KEY` läuft der regelbasierte **Mock-Modus** |
| Netzwerk | keine Admin-API, kein SQL vom Agenten; nur Storefront-GraphQL |

## 2.3 Konventionen

- Deutschsprachige Doku und UI; Code/Kommentare englisch oder deutsch konsistent pro Datei.
- Preise/Totals werden vom Backend unverändert aus Magento-Tool-Output ins UI durchgereicht.
- Schreibende Agent-Tools immer `requires_confirmation=True`.
- Generierte Grafiken (SVG) serverseitig mit XML-Escaping und Farb-Whitelist erzeugen.

[Zurück zur Übersicht](index.md)
