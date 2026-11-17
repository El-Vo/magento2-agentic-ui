# Magento 2 Agentic UI

Konversationeller Shop-Agent auf Magento 2: Ein LLM-Agent mit typisierten Tools gegen die öffentliche
Magento-2-GraphQL-Storefront-API, gerendert durch maßgeschneiderte React-UI-Komponenten (kein Luma-Theme).

> Status: **Scaffolding** – lauffähiges Grundgerüst mit Demo-Shop, Agent-Service, Chat-Widget und Devcontainer.

## Architektur

```
Chat-Widget (React/Vite)  ──HTTP/SSE──  Agent-Layer (FastAPI)  ──Tool Calls──  LLM (Mistral)
                                            │
                                            └── GraphQL/REST ──► Magento 2 Demo-Shop (Docker)
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
docs/                   Architektur- und Konzept-Dokumentation
devcontainer/           Codespaces-/Devcontainer-Definition
docker-compose.yml      Magento-2-Demo-Shop + Agent + Frontend
```

## Schnellstart im Codespace

Der Devcontainer bringt Docker (docker-in-docker), Python 3.12 und Node 20 mit.

```bash
# 1. Magento-Demo-Shop + Agent starten ( erster Start holt Images + Sample Data, ~5-10 Min )
make demo

# 2. Health-Checks
make ps
curl -s http://localhost:8000/health

# 3. Chat-Widget (Dev-Server, forwarded port 5173)
make widget
```

| Dienst | URL | Zweck |
| --- | --- | --- |
| Magento Demo-Shop | http://localhost:8080 | Storefront + GraphQL-Endpoint `/graphql` |
| Agent-API | http://localhost:8000 | `/chat`, `/confirm`, `/health`, `/tools` |
| Chat-Widget | http://localhost:5173 | Agenten-UI (React) |

Admin-Backend des Demo-Shops: http://localhost:8080/admin (Demo-Image: `admin/admin123`).

## Konfiguration

`.env.example` kopieren nach `.env` und ausfüllen:

| Variable | Bedeutung |
| --- | --- |
| `MISTRAL_API_KEY` | API-Key für das LLM (Tool-Calling) |
| `MAGENTO_BASE_URL` | Basis-URL des Shops (im Codespace `http://magento:8080` für Container-Netz, lokal `http://localhost:8080`) |
| `AGENT_MODEL` | Mistral-Modell mit Function-Calling, Default `mistral-large-latest` |

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
make agent-dev      # Agent mit Reload (uvicorn)
make agent-test    # pytest (Tools gegen Fake-Gateway)
make widget        # Frontend-Dev-Server
make widget-build   # Production-Build des Widgets
```

## Roadmap

1. **MVP**: search/details/cart_add + Confirm-Gate + Chat-Widget neben dem Shop *(dieses Scaffolding)*
2. Checkout-Kette als Tool-Abfolge mit Formular-Hybrid (kein Payment im LLM)
3. Kundenkonto-/Bestellstatus-Tools, RAG über CMS-Policies
4. Semantische Suche (Vektorindex), Merchant-Assistent (getrennte Berechtigungssphäre)

Details: `docs/architecture.md`, `docs/roadmap.md`.
