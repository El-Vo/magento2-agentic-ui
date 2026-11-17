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
docs/                   Architektur- und Konzept-Dokumentation
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

## Agent-Tools (MVP)

| Tool | Magento-GraphQL-Basis | Phase |
| --- | --- | --- |
| `search_products` | `products(search:, filter:, pageSize:)` + `aggregations` | browse |
| `product_details` | `products` mit `attributes`, `media_gallery` | browse |
| `categories` | `categories` (Kontext/Navigation) | browse |
| `cart_get` | `cart` query (Totals live aus Magento) | cart |
| `cart_add` | `createEmptyCart`, `addSimpleProductsToCart`, `addConfigurableProductsToCart` | cart (Confirm-Gate) |
| `cart_update` / `cart_remove` | `updateCartItems`, `removeItemFromCart` | cart (Confirm-Gate) |
| `cms_page` | CMS-Pages/Blocks (RAG-Korpus, read-only) | support |

Checkout-Kette (`setShippingAddressesOnCart` → `setShippingMethod` → `setPaymentMethod` → `placeOrder`)
ist als Phase 2 vorgesehen, siehe `docs/roadmap.md` und `docs/architecture.md`.

## Entwicklung

```bash
make setup          # einmalig: Toolchain + Magento lokal installieren
make demo           # alle Dienste starten (db, elasticsearch, magento, agent)
make ps             # Status aller Dienste
make agent-dev      # Agent im Vordergrund mit Reload (uvicorn)
make agent-test     # pytest (Tools gegen Fake-Gateway)
make widget         # Frontend-Dev-Server
make widget-build   # Production-Build des Widgets
make demo-stop      # alle Dienste stoppen
```

## Devcontainer / Codespace

Der Devcontainer (`devcontainer/devcontainer.json`) enthält **kein docker-in-docker**.
**Beim Erstellen eines neuen Codespace startet automatisch alles** – `postCreateCommand` ruft
`scripts/codespace-up.sh` auf, das idempotent folgendes erledigt:

1. `.env` und `agent/.env` aus den Beispielen anlegen (ohne `MISTRAL_API_KEY` läuft der Agent im Mock-Modus),
2. komplettes Setup, falls nötig: `scripts/setup-local.sh --all` (PHP/Composer/MariaDB via apt, Elasticsearch-Tarball, Magento 2 vom GitHub-Tag + Packagist),
3. `npm install` im Frontend,
4. alle Dienste starten: MariaDB, Elasticsearch, Magento (`php -S`, installiert und mit Demo-Daten geseedet beim ersten Lauf), Agent (uvicorn) und Chat-Widget (Vite im Hintergrund, `scripts/widget.sh`).

`postStartCommand` ruft dasselbe Skript erneut auf – nach einem Codespace-Neustart sind die Dienste
(deren Daten liegen unter `.local/` bzw. `magento2/` im Workspace) sofort wieder da. `postAttachCommand`
zeigt den Status via `make ps`.

Alle Dienste binden an localhost und sind über die forwarded Ports 3306/5173/8000/8080/9200
erreichbar – nach dem Erstellen direkt öffnen: **http://localhost:5173** (Chat-Widget).
Manuell lässt sich derselbe Ablauf jederzeit mit `make codespace` auslösen.

## Roadmap

1. **MVP**: search/details/cart_add + Confirm-Gate + Chat-Widget neben dem Shop *(dieses Scaffolding)*
2. Checkout-Kette als Tool-Abfolge mit Formular-Hybrid (kein Payment im LLM)
