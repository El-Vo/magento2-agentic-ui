# Architektur

Siehe `README.md` für Schnellstart. Dieses Dokument beschreibt die Umsetzung des Konzepts im Scaffolding.

## Bausteine

```
frontend (React/Vite)          agent (FastAPI)                     magento (Demo-Shop)
  ChatWidget                     ToolRegistry (JSON-Schemas)          GraphQL /graphql
  ProductCardView   ──/chat──►    AgentService ──tool_calls──► Mistral   Storefront API
  CartPanel                       ConfirmGate (/confirm)              Sample Data
  ConfirmDialog                   SessionStore (In-Memory)
  FilterChips                     MagentoClient (GraphQL-Gateway)
```

## Agent-Layer (`agent/`)

- `app/tools/base.py` – Tool-Registry. Jedes Tool hat JSON-Schema-Parameter, eine Phase
  (`browse`, `cart`, `support`) und ein `requires_confirmation`-Flag. Dem LLM werden nur
  die Tools der aktuellen Phase angeboten.
- `app/tools/catalog.py` – `search_products`, `product_details`, `categories`. Jedes Tool ist
  ein kleiner GraphQL-Consumer, der exakt die Felder der UI-Komponenten abfragt (inkl.
  `aggregations` für Filter-Chips).
- `app/tools/cart.py` – `cart_get`, `cart_add`, `cart_update`, `cart_remove`. Alle Mutationen sind
  als `requires_confirmation=True` registriert.
- `app/tools/cms.py` – `cms_page` als RAG-Korpus für Versand-/Retour-/Datenschutzfragen.
- `app/agent.py` – Tool-Calling-Loop (Mistral), Mock-Modus ohne API-Key, Confirm-Gate:
  schreibende Tools erzeugen `intent: "confirm_required"` und werden erst über `POST /confirm`
  ausgeführt. Totals/Preise fließen unverändert aus Magento-Tool-Output ins UI.
- `app/session.py` – In-Memory-Sessions: Guest-Cart-ID, Phase, `last_results` mit stabilen
  Positionen („das zweite“ → `resolve_position(2)`), Chat-History nur pro Session.
- `app/magento.py` – Einziger GraphQL-Gateway. Kein SQL, keine Admin-Tokens.

## Guardrails (implementiert bzw. vorgesehen)

| Guardrail | Status |
| --- | --- |
| Confirm-Gate für Mutationen | ✅ `AgentService._dispatch` + `/confirm` |
| Preise/Totals nur aus Magento | ✅ Tools zitieren Magento-Output |
| Phase-Scoping der Tools | ✅ `ToolRegistry.for_phase` |
| Prompt-Injection-Redaktion | ✅ System-Prompt markiert Produkttexte als untrusted Daten |
| Tool-Output-Validierung (SKU existiert, Varianten erlaubt) | ⏳ Roadmap Phase 2 |
| Rate-Limits / Tagesbudget | ⏳ Roadmap Phase 2 |
| Tracing pro Tool-Call | ⏳ Roadmap Phase 2 |
| DSGVO: keine Adressdaten im LLM-Memory | ⏳ Checkout-Phase (Formular-Hybrid) |

## Frontend (`frontend/`)

Jede Komponente ist ein eigener GraphQL-Consumer-Renderer, gefüttert aus Agent-Intents:

| Komponente | Intent | Konzept-Referenz |
| --- | --- | --- |
| `ProductCardView` | `product_list` | ProductCard |
| `FilterChips` | `product_list.aggregations` | FilterSuggestionChips |
| `CartPanel` | `cart`, `cart_updated` | CartPanel (live Totals) |
| `ConfirmDialog` | `confirm_required` | ConfirmDialog |
| `PolicyAnswer` | `policy_answer` | PolicyAnswer (RAG + Quellenlink) |

Noch offen aus der Komponentenbibliothek: `CompareTray`, `AddressForm`, `CheckoutStepper`,
`OrderStatusCard` (Roadmap Phase 2–3). Jede Karte verlinkt auf die reguläre Produktseite.

## Magento-Anbindung

- Demo-Shop: `alexcheng/magento2` (Magento Open Source + Sample Data) via docker-compose.
  Für einen echten Shop einfach `MAGENTO_BASE_URL` auf die Storefront-GraphQL-Endpunkt-URL zeigen,
  statt des Demo-Containers.
- Lücken der Storefront-API (Bestellstatus nach placeOrder, semantische Suche) werden im
  eigenen Modul `magento-graphql-ext/` ergänzt (Skeleton vorhanden).

## Betriebsaspekte

- Der Agent hält nur Storefront-Berechtigungen (Guest-Cart bzw. Customer-Token).
- Alle Tool-Calls laufen serverseitig; das Widget spricht nie direkt mit Magento.
- Observability: FastAPI-Access-Logs + `/health`; strukturiertes Tool-Tracing siehe Roadmap.
