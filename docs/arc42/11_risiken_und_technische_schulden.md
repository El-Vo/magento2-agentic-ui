---
layout: default
title: 11 – Risiken und technische Schulden
---

# 11. Risiken und technische Schulden

| Risiko/Schuld | Auswirkung | Maßnahme/Status |
| --- | --- | --- |
| In-Memory-Sessions (Cart-ID, History) gehen bei Neustart verloren | Kunde verliert Chat-Kontext | bewusst für Demo; Persistenz (Redis/DB) als Roadmap |
| DSGVO: keine Adressdaten im LLM-Memory | rechtliches Risiko bei echtem Einsatz | Formular-Hybrid (Checkout-Formular statt Chat); Löschkonzept/Persistenz noch offen – Phase 3 |
| Tool-Output-Validierung fehlt (SKU existiert, Varianten erlaubt) | ungültige cart_add-Versuche erst von Magento abgelehnt | Validierung vor Mutation – Roadmap Phase 2 |
| Rate-Limits/LLM-Tagesbudget fehlen | Kostenrisiko | Roadmap Phase 2 |
| Mock-Modus ist heuristisch (Keyword-Matching) | deckt nicht alle Formulierungen ab | nur für Dev/e2e gedacht; Produktiv immer LLM-Modus |
| `php -S` ist kein Produktiv-Webserver | Performance/Sicherheit | nur lokaler Demo-Shop; Produktion hinter echten Webserver |
| Elasticsearch 7.17 mit Magento 2.4.7 | bekannte Kombination, aber EOL-nahe | Update-Pfad dokumentieren |
| Cypress-Live-Modus braucht laufenden Stack | e2e-live lokal abhängig | CI läuft gemockt; Live optional |
| DB-UI-Assets (Schriften) werden neutralisiert | UI nutzt Fallback-Schriften | bewusst (Lizenz), siehe `vite.config.ts` |
| Semantische Suche / Vektorsuche fehlt | exakte Suche only | Roadmap Phase 4 (eigenes Modul `magento-graphql-ext/`) |

[Zurück zur Übersicht](index.md)
