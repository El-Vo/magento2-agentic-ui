# Magento 2 Agentic UI

Konversationeller Shop-Agent auf Magento 2: Ein LLM-Agent mit typisierten Tools gegen die öffentliche
Magento-2-GraphQL-Storefront-API, gerendert durch maßgeschneiderte React-UI-Komponenten (kein Luma-Theme).

> Status: **Scaffolding** – lauffähiges Grundgerüst mit lokalem Demo-Shop, Agent-Service und Chat-Widget.
> **Kein Docker nötig:** Alle Dienste laufen als normale Prozesse auf der lokalen Maschine.

## Architektur

```
Chat-Widget (React/Vite)  ──HTTP/SSE──  Agent-Layer (FastAPI)  ──Tool Calls──  LLM (Mistral)
                                            │
                                            └── GraphQL/REST ──► Magento 2 Demo-Shop (lokal: php -S + MariaDB + Elasticsearch)
```

Grundsätze (aus dem Konzept):

- Das LLM erzeugt **niemals SQL** oder freie Produktdaten – nur Tool-Calls mit typisierten Parametern.
- Preise, Lagerbestand, Totals kommen **immer deterministisch aus Magento**, nie aus dem Modell.
- Jede schreibende Aktion läuft durch ein **Confirm-Gate** (Confirm-Card im Frontend).
- Der Agent liefert **UI-Intents** (Produktkarten, Warenkorb-Panel, Filter-Chips), kein reinen Text.
- Storefront-Berechtigungen only: Guest-Cart-Token bzw. Customer-Token, niemals Admin-Tokens.

## Repository-Layout

```
agent/                  FastAPI-Agent: Tool-Registry, Session/Memory, Guardrails, Mistral-Client
  app/tools/            Ein Tool = ein GraphQL-Consumer (search, product_details, cart_add, ...)
frontend/               React/Vite-Chat-Widget mit UI-Komponenten (ProductCard, CartPanel, ...)
magento-graphql-ext/    Skeleton für ein eigenes Magento-GraphQL-Modul (Lücken der Storefront-API)
scripts/                Lokale Dev-Skripte – kein Docker: setup-local.sh (Toolchain), db.sh (MariaDB),
                        search.sh (Elasticsearch), magento.sh (php -S), agent.sh (uvicorn), seed-demo-data.php
docs/                   arc42-Architekturdokumentation (docs/arc42/, veröffentlicht via GitHub Pages) + Konzept-Notizen
frontend/cypress/       Cypress-e2e-Suite (Userflow, Live-Tool-Trace, Showcase-Grafiken)
devcontainer/           Codespaces-/Devcontainer-Definition (ohne docker-in-docker)
```

## Schnellstart lokal (ohne Docker)

Voraussetzungen: Linux oder macOS, passwortloses `sudo` für die Paketinstallation (einmalig),
ca. 8 GB RAM und 10 GB freier Speicher. Python 3.11+ und Node 20+ sollten vorhanden sein.

```bash
# 1. Einmalig: Toolchain installieren – PHP 8.3 + Extensions, Composer, MariaDB via apt,
#    Elasticsearch-Tarball und Magento 2 Open Source (GitHub-Tag + Packagist, kein Adobe-Login)
make setup

# 2. Alle Dienste lokal starten: MariaDB + Elasticsearch + Magento (php -S) + Agent.
#    Beim ersten Start wird Magento installiert (setup:install) und mit Demo-Daten geseedet.
make demo

# 3. Health-Checks
make ps
curl -s http://localhost:8000/health
curl -s -G 'http://localhost:8080/graphql' --data-urlencode 'query={storeConfig{store_code}}'

# 4. Chat-Widget (Dev-Server, Port 5173; /api wird auf den Agent auf :8000 proxied)
make widget
```

| Dienst | URL / Adresse | Prozess |
| --- | --- | --- |
| Magento Demo-Shop | http://localhost:8080 | `php -S` mit `scripts/php-router.php` |
| Agent-API | http://localhost:8000 | `uvicorn` aus `.local/venv` |
| Chat-Widget | http://localhost:5173 | Vite Dev-Server |
| MariaDB | 127.0.0.1:3306 (Socket `.local/mysql.sock`) | `mariadbd`, Daten unter `.local/mysql` |
| Elasticsearch | http://127.0.0.1:9200 | Tarball unter `.local/elasticsearch-*` |

Admin-Backend des Demo-Shops: http://localhost:8080/admin (admin/admin123).

Dienste stoppen mit `make demo-stop`, Status siehe `make ps`. Alles inklusive Daten und
Installationen entfernen: `make purge` (löscht `.local/` und `magento2/`).

## Konfiguration

`.env.example` kopieren nach `.env` und ausfüllen:

| Variable | Bedeutung |
| --- | --- |
| `MISTRAL_API_KEY` | API-Key für das LLM (Tool-Calling) |
| `MAGENTO_BASE_URL` | Basis-URL des Shops (lokal `http://localhost:8080`; für einen echten Shop dessen Storefront-URL) |
| `AGENT_MODEL` | Mistral-Modell mit Function-Calling, Default `mistral-large-latest` |
| `DB_*`, `ES_*` | Zugangsdaten der lokalen Dienste (Defaults in `scripts/common.sh`) |
| `INSTALL_SAMPLE_DATA` | `1` = Demo-Produkte/CMS-Seite seeden (eigener Seeder, kein Marketplace-Login) |

Ohne `MISTRAL_API_KEY` läuft der Agent im **Mock-Modus** (regelbasierte Tool-Auswahl) – nützlich für
UI- und Magento-Integrationstests ohne LLM-Kosten.

## Agent-Tools

| Tool | Magento-GraphQL-Basis | Phase |
| --- | --- | --- |
| `search_products` | `products(search:, filter:, pageSize:)` + `aggregations` + `media_gallery` | browse |
| `product_details` | `products` mit `attributes`, `media_gallery` | browse |
| `categories` | `categories` (Kontext/Navigation) | browse |
| `cart_get` | `cart` query (Totals live aus Magento) | cart |
| `cart_add` | `createEmptyCart`, `addSimpleProductsToCart`, `addConfigurableProductsToCart` | cart (Confirm-Gate) |
| `cart_update` / `cart_remove` | `updateCartItems`, `removeItemFromCart` | cart (Confirm-Gate) |
| `checkout_overview` | `cart` inkl. `shipping_addresses`, `available_shipping_methods`, `available_payment_methods` | checkout |
| `set_checkout_email` | `setGuestEmailOnCart` | checkout (Confirm-Gate) |
| `set_shipping_address` | `setShippingAddressesOnCart` | checkout (Confirm-Gate) |
| `set_shipping_method` | `setShippingMethodsOnCart` | checkout (Confirm-Gate) |
| `set_payment_method` | `setPaymentMethodOnCart` (nur Code, z. B. `checkmo` – nie Zahlungsdaten) | checkout (Confirm-Gate) |
| `place_order` | `placeOrder` → Bestellnummer | checkout (Confirm-Gate) |
| `compose_showcase` | rendert serverseitig eine SVG-Grafik (hero/compare/moodboard/price_chart) aus den Produkten der letzten Suche | * (alle Phasen) |
| `cms_page` | CMS-Pages/Blocks (RAG-Korpus, read-only) | support |

## Userflow, Transparenz & dynamische Grafiken

- **Kompletter Userflow abgebildet:** Produktrecherche → Produktkarten → Warenkorb → Checkout
  (Adresse → Versand → Zahlung → „Jetzt verbindlich bestellen“) → Bestellnummer. Agentengetrieben
  über die Tool-Kette mit Confirm-Gate oder formularbasiert über den Widget-Checkout
  (`GET /checkout/overview`, `POST /checkout/{address,shipping,payment,place}`).
- **Der Agent beschreibt, was er tut:** Jedes Tool-Ergebnis trägt eine `narration`, zusätzlich
  streamt `POST /chat/stream` (SSE) `text`-Events – im Chat steht also eine Erklärung, nicht nur ein Tool-Call.
- **Live-Tool-Trace mit Parametern:** Der SSE-Stream liefert `tool_start`/`tool_end` mit
  `tool`, `args` (JSON) und `status` – das Widget zeigt jeden Aufruf live mit Namen und exakten
  Parametern an (`data-testid="tool-step"` / `tool-args`).
- **Dynamische Grafiken:** Auf Wunsch („Erstelle einen Vergleich der Treffer“) ruft der Agent
  `compose_showcase` auf und rendert eine Grafik (SVG) mit den Produkten in der Shopansicht –
  Layout, Headline und Akzentfarbe wählt der Agent, alle Produktdaten kommen aus Magento
  (XML-escaped, Farb-Whitelist, Bilder nur vom Magento-Host). Die Shopansicht wird so dynamisch
  an die Wünsche des Nutzers angepasst.

## e2e-Tests (Cypress)

```bash
make e2e        # Cypress gegen das gebaute Widget (vite preview :4173), Agent-API per cy.intercept gemockt
make e2e-live   # Live-Modus gegen Agent + Magento (make demo zuerst starten; E2E_MOCK_API=false)
```

Specs in `frontend/cypress/e2e/`: `userflow.cy.ts` (kompletter Flow Recherche → Warenkorb → Checkout →
Bestellung + Confirm-Gate), `tool-trace.cy.ts` (live Tool-Aufrufe mit Parametern + Narration),
`showcase.cy.ts` (agenten-generierte Grafiken). CI: `.github/workflows/e2e.yml`.

## Dokumentation (arc42) auf GitHub Pages

Die vollständige Architekturdokumentation nach **arc42** liegt unter `docs/arc42/`
(12 Kapitel: Ziele, Kontext, Bausteine, Laufzeitsicht, Verteilung, Querschnitt, ADRs, Qualität,
Risiken, Glossar). Veröffentlichung über GitHub Pages: Workflow `.github/workflows/docs.yml`
(Jekyll, `docs/_config.yml`) deployt bei jedem Push auf `main`, der `docs/` ändert.
Einmalig in den Repo-Settings unter *Settings → Pages → Build and deployment → Source: „GitHub Actions“*
setzen – danach liegt die Doku unter `https://<owner>.github.io/<repo>/`.

## Entwicklung

```bash
make setup          # einmalig: Toolchain + Magento lokal installieren
make demo           # alle Dienste starten (db, elasticsearch, magento, agent)
make ps             # Status aller Dienste
make agent-dev      # Agent im Vordergrund mit Reload (uvicorn)
make agent-test     # pytest (Tools, Confirm-Gate, SSE, Showcase gegen Fake-Gateway)
make widget         # Frontend-Dev-Server
make widget-build   # Production-Build des Widgets
make e2e            # Cypress-e2e gegen das gebaute Widget (Agent-API gemockt)
make e2e-live       # Cypress-e2e live gegen Agent + Magento (make demo zuerst)
make demo-stop      # alle Dienste stoppen
```

## Devcontainer / Codespace

Der Devcontainer (`devcontainer/devcontainer.json`) enthält **kein docker-in-docker**.
**Beim Erstellen eines neuen Codespace startet automatisch alles** – `updateContentCommand` ruft
(außerdem von GitHub Prebuilds ausgeführt, siehe unten) `scripts/codespace-up.sh` auf, das idempotent
folgendes erledigt:

1. `.env` und `agent/.env` aus den Beispielen anlegen (ohne `MISTRAL_API_KEY` läuft der Agent im Mock-Modus),
2. komplettes Setup, falls nötig: `scripts/setup-local.sh --all` (PHP/Composer/MariaDB via apt, Elasticsearch-Tarball, Magento 2 vom GitHub-Tag + Packagist),
3. `npm install` im Frontend,
4. alle Dienste starten: MariaDB, Elasticsearch, Magento (`php -S`, installiert und mit Demo-Daten geseedet beim ersten Lauf), Agent (uvicorn) und Chat-Widget (Vite im Hintergrund, `scripts/widget.sh`).

Daneben installiert der Devcontainer die VS Code Extension **Mistral Vibe** (`mistralai.mistral-vibe-code`,
siehe `customizations.vscode.extensions`). Die Extension bündelt den Agent selbst – keine separate
CLI-Installation nötig; `vibe` läuft im Sidepanel mit Zugriff auf Workspace, Selektion und Diffs.
`postCreateCommand`/`postStartCommand` rufen dasselbe
idempotente Skript erneut auf – nach einem Codespace-Neustart sind die Dienste (deren Daten liegen unter
`.local/` bzw. `magento2/` im Workspace) sofort wieder da. `postAttachCommand` zeigt den Status via `make ps`.

**Schnelle Codespace-Erstellung:** Das schwere Setup liegt in `updateContentCommand`, weil GitHub Prebuilds
nur `onCreateCommand`/`updateContentCommand` ausführen (nicht `postCreateCommand`). Prebuilds in den
Repo-Settings unter *Settings → Codespaces → Prebuild* aktivieren – dann wird das komplette Setup
(apt, Elasticsearch, Magento, composer, npm) einmalig im Prebuild gecached und neue Codespaces starten
in Sekunden statt Minuten. Ohne Prebuild wiederholt sich das volle Setup bei jedem *Rebuild* des Containers.

Alle Dienste binden an localhost und sind über die forwarded Ports 3306/5173/8000/8080/9200
erreichbar – nach dem Erstellen direkt öffnen: **http://localhost:5173** (Chat-Widget, `onAutoForward: openPreview`).
In GitHub Codespaces öffnet der Browser die URL `https://<codespace>-5173.app.github.dev`; dafür ist in
`frontend/vite.config.ts` `server.allowedHosts` gesetzt (Vite >= 5.4 blockiert externe Host-Header sonst
mit 403). Sichtbarkeit des Ports ggf. auf *public* stellen (`gh codespace ports visibility 5173 public`).
Manuell lässt sich derselbe Ablauf jederzeit mit `make codespace` auslösen.

## Roadmap

1. **MVP**: search/details/cart_add + Confirm-Gate + Chat-Widget neben dem Shop ✅
2. **Checkout-Kette** als Tool-Abfolge mit Formular-Hybrid (kein Payment im LLM) + Live-Tool-Trace (SSE)
   + agenten-generierte Grafiken + Cypress-e2e + arc42-Doku auf GitHub Pages ✅
3. Konto & Support: echtes Kunden-Login, Bestellstatus für Kunden, RAG mit Embeddings, DSGVO-Review
4. Semantik & Personalisierung: Vektorindex (eigenes Modul `magento-graphql-ext`), personalisierte Vorschläge

Details siehe `docs/roadmap.md` und `docs/arc42/`.
