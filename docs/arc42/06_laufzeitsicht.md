---
layout: default
title: 06 – Laufzeitsicht
---

# 6. Laufzeitsicht

Die wichtigsten Szenarien als Abläufe. Alle Geldbeträge/Totals stammen aus Magento-Tool-Output.

## 6.1 Produktrecherche mit Live-Tool-Trace (SSE)

```
Kunde      Widget            Agent                    Magento
  │  „Zeig mir wasserdichte │                        │
  │   Sachen unter 150 €“   │                        │
  │ ──POST /chat/stream──▶ │                        │
  │                        │ ──products(search,    │
  │                        │   filter price<150)──▶ │
  │                        │ ◀──items+aggregations─ │
  │ ◀──event tool_start──  │   (LLM wählt Tool+Args)│
  │   {tool, args, narr.}  │                        │
  │ ◀──event tool_end────  │                        │
  │   {intent:product_list}│                        │
  │ ◀──event done────────  │                        │
  │ ──rendert: Tool-Trace + Narration im Chat,     │
  │    Produktkarten + Filter-Chips im Widget-Pane  │
```

## 6.2 In den Warenkorb über den Agenten (Confirm-Gate)

```
Kunde: „Lege das erste in den Warenkorb“
Agent: Position 1 gegen session.last_results auflösen → cart_add(sku) ist requires_confirmation
     → intent confirm_required (noch keine Mutation!)
UI:   ConfirmDialog mit Toolname + JSON-Parametern + Narration
Kunde: „Bestätigen“ → POST /confirm → Agent führt addSimpleProductsToCart aus
     → intent cart_updated mit Cart aus Magento → Badge + CartPanel aktualisieren sich
```

## 6.3 Kompletter Checkout (Widget-Stepper auf dem Kunden-Warenkorb)

```
CheckoutView (Stepper)              Agent-API                 Magento
  Adresse-Formular ──POST /checkout/address──▶ setShippingAddressesOnCart
  Versandart wählen ──POST /checkout/shipping─▶ setShippingMethodsOnCart   (Totals inkl. Versand)
  Zahlung wählen ───POST /checkout/payment──▶ setPaymentMethodOnCart (nur Code, z. B. checkmo)
  Prüfen & bestellen─POST /checkout/place───▶ placeOrder → order_number
  → OrderStatusCard mit Bestellnummer; Warenkorb wird zurückgesetzt
```

Der gleiche Ablauf ist agentengetrieben als Tool-Kette möglich (Phase `checkout`, jedes Tool per
Confirm-Gate): `checkout_overview → set_shipping_address → set_shipping_method → set_payment_method → place_order`.

## 6.4 Agenten-generierte Grafik (Showcase)

```
Kunde: „Erstelle einen Vergleich der Treffer als Grafik“
Agent: compose_showcase(layout=compare, positions=[1,2,3], headline, accent)
     → Positionen gegen last_results auflösen, SVG serverseitig rendern
       (Produkttexte XML-escaped, Akzentfarbe aus Whitelist, Bilder nur vom Magento-Host)
UI:   ShowcaseView rendert das SVG in der Shopansicht + Produktkarten darunter
      (inkl. „In den Warenkorb“)
```

## 6.5 Maßgeschneiderte Ansicht (compose_view) & Widget-Wechsel

```
Kunde: „Baue mir eine Übersichtsseite für die Treffer“
Agent: compose_view(title, blocks=[headline, text, tags, product_cards, actions])
     → Blocktypen/Varianten/Aktionen gegen Whitelist validiert, Produkt-Positionen
       gegen last_results aufgelöst, Showcase-SVG serverseitig gerendert
UI:   DynamicView rendert die Blöcke 1:1 als DB-UI-Komponenten im Widgetbereich
      (ersetzt die alte Produktgrid-Ansicht); jede Produktkarte/Aktion hat einen
      „In den Warenkorb“-Button
```

Warenkorb-Darstellung: Items werden serverseitig stabil nach Positions-id sortiert
(`normalize_cart`), sodass Badge-Anzahl und Warenkorbansicht immer konsistent und
in derselben Reihenfolge gerendert werden. Der Chat scrollt bei jeder neuen
Nachricht/Live-Event automatisch nach unten.

## 6.6 Phasenmodell der Session

`browse` (Katalog-Tools) → nach Cart-Intent `cart` → nach Checkout-Übersicht `checkout` → nach
`order_placed` zurück auf `browse` mit geleertem Warenkorb. Dem LLM werden pro Phase nur die
passenden Tools angeboten (`ToolRegistry.for_phase`), `compose_showcase` ist phasenunabhängig (`*`).

[Zurück zur Übersicht](index.md)
