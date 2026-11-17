# ElVo_AgenticGraphql

Skeleton für ein eigenes Magento-2-GraphQL-Modul, das Lücken der Storefront-API schließt:

- `guestOrderStatus` – Bestell-/Versandstatus für Gäste nach `placeOrder` (Konzept §2)
- Semantische Suche (OpenSearch kNN) – Roadmap Phase 4

Installation: `bin/magento module:enable ElVo_AgenticGraphql && bin/magento setup:upgrade`

Ablageort im Zielsystem: `app/code/ElVo/AgenticGraphql/`.
