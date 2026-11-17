---
layout: default
title: 07 – Verteilungssicht
---

# 7. Verteilungssicht

## 7.1 Lokale Entwicklung / Devcontainer (kein Docker)

Alle Dienste sind normale Prozesse auf localhost (Verwaltung via `scripts/*.sh`, `make demo`):

| Dienst | Adresse | Prozess | Daten |
| --- | --- | --- | --- |
| Magento 2 Demo-Shop | http://localhost:8080 (Admin: `/admin`, admin/admin123) | `php -S` + `scripts/php-router.php` | `magento2/` |
| Agent-API | http://localhost:8000 (`/health`, `/docs`) | `uvicorn app.main:app` aus `.local/venv` | In-Memory-Sessions |
| Chat-Widget (Dev) | http://localhost:5173, `/api` → Proxy auf :8000 | Vite Dev-Server | – |
| Chat-Widget (Build/e2e) | http://localhost:4173, `/api` → Proxy auf :8000 | `vite preview` | `frontend/dist/` |
| MariaDB | 127.0.0.1:3306 / Socket `.local/mysql.sock` | `mariadbd` | `.local/mysql` |
| Elasticsearch | http://127.0.0.1:9200 | Tarball `.local/elasticsearch-*` | `.local/es-data` |

Devcontainer (`.devcontainer/devcontainer.json`, kein docker-in-docker): `updateContentCommand` →
`scripts/codespace-up.sh` (idempotent: `.env` anlegen, `setup-local.sh --all` falls nötig, `npm install`,
alle Dienste starten inkl. Widget im Hintergrund); Ports 3306/5173/8000/8080/9200 werden geforwarded.
GitHub Prebuilds cachen das schwere Setup.

## 7.2 Produktion/CI (verteilte Sicht)

| Umgebung | Aufbau |
| --- | --- |
| GitHub Actions – e2e | `ubuntu-latest`: `npm ci` (inkl. Cypress-Binary) → `npm run build` → `vite preview :4173` → `cypress run` (Agent-API per Intercept gemockt; Live-Modus optional mit `make demo`) – Workflow `.github/workflows/e2e.yml` |
| GitHub Actions – Docs | push auf `main` mit Änderungen unter `docs/`: `configure-pages` + `upload-pages-artifact` (Pfad `docs/`) + `deploy-pages` – Workflow `.github/workflows/docs.yml`. Jekyll baut `docs/` mit `theme: minima` (siehe `docs/_config.yml`). Repo-Settings → Pages → Source „GitHub Actions“ einmalig setzen. URL: `https://<owner>.github.io/<repo>/` |
| Echter Shop | `MAGENTO_BASE_URL` auf die Storefront-URL des echten Shops; Agent als Prozess/Container hinter Reverse Proxy; Widget statisch hostbar (`vite build`, `VITE_AGENT_URL` setzen) |

## 7.3 Sicherheitszonen

- **Storefront-Zone**: Agent hält nur Guest-Cart-/Customer-Token (Demo-Kunde `demo.kunde@agentic.local`).
- **Admin-Zone**: Magento-Admin nur manuell (localhost), nie vom Agenten.
- **CI-Zone**: GitHub Actions baut und testet; Pages-Deployment nur aus `main` via geschütztem Workflow.

[Zurück zur Übersicht](index.md)
