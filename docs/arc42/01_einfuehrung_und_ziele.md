---
layout: default
title: 01 – Einführung und Ziele
---

# 1. Einführung und Ziele

## 1.1 Aufgabenstellung

Ein **konversationeller Shop-Agent** für Magento 2: Kunden recherchieren Produkte, lassen sich vom
Agenten beraten, legen Produkte in den Warenkorb und schließen den **kompletten Checkout** ab –
alles über ein Chatfenster, das neben der Shopansicht liegt. Die Shopansicht (rechte Spalte) wird
dabei vom Agenten **dynamisch gestaltet**: Produktkarten, Filter-Chips, Warenkorb-Panel,
Checkout-Stepper und **vom Agenten generierte Grafiken (SVG) mit den Produkten**, die die Wünsche
des Kunden abbilden (z. B. Produktvergleich, Moodboard, Preis-Chart, Hero-Banner).

Zentrale Leitplanken des Konzepts:

- Das LLM erzeugt **niemals SQL** oder freie Produktdaten – nur Tool-Calls mit typisierten Parametern.
- Preise, Lagerbestand und Totals kommen **immer deterministisch aus Magento**, nie aus dem Modell.
- Jede schreibende Aktion läuft durch ein **Confirm-Gate** (Confirm-Card im Frontend).
- Der Agent liefert **UI-Intents**, keinen reinen Text.
- Der Agent **narratiert, was er tut**, und jeder Tool-Aufruf ist **live mit Namen und Parametern**
  im Chat sichtbar (SSE-Streaming).
- Storefront-Berechtigungen only: Guest-Cart-Token bzw. Customer-Token, niemals Admin-Tokens.

## 1.2 Qualitätsziele

| Priorität | Qualitätsziel | Motivation |
| --- | --- | --- |
| 1 | **Vollständiger Userflow** (Recherche → Warenkorb → Checkout → Bestellung) | Kernnutzen der Anwendung |
| 2 | **Datenintegrität** (Preise/Totals nur aus Magento) | Vermeidung von Halluzinationen bei Geldbeträgen |
| 3 | **Sicherheit/Guardrails** (Confirm-Gate, Prompt-Injection-Redaktion, XSS-Schutz bei generierten Grafiken) | Schreibende Aktionen und untrusted Produkttexte |
| 4 | **Transparenz** (live Tool-Trace mit Parametern + Narration) | Nachvollziehbarkeit des Agenten für Kunden |
| 5 | **Testbarkeit** (pytest für Agent, Cypress-e2e für den kompletten UI-Flow) | CI ohne Magento lauffähig |

## 1.3 Stakeholder

| Stakeholder | Interesse |
| --- | --- |
| Kunde (Shopper) | schneller, vertrauenswürdiger Kauf; sichtbarer Ablauf; Kontrolle über schreibende Aktionen |
| Shop-Betreiber | Storefront-API genügt, keine Admin-Rechte nötig, DSGVO-konformes Memory |
| Entwickler | lokales Setup ohne Docker, Mock-Modus ohne LLM-Key, e2e-Suite, arc42-Doku |
| Auditor/DSB | DSGVO: keine Adressdaten im LLM-Memory, Confirm-Gate, Tracing |

[Zurück zur Übersicht](index.md)
