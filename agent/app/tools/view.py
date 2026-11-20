"""View tool: the agent composes a custom shop view from DB-UI building blocks.

`compose_view` answers requests like "bau mir eine Übersichtsseite" / "gestalte eine
Ansicht für die Treffer". The LLM only picks a whitelisted set of block types and
props; product references are resolved against the session's last_results (never
invented), showcase blocks get their SVG rendered server-side (escaped, see
tools/showcase.py). The frontend maps the blocks 1:1 onto DB-UI components
(DbHeadline, DbTag, DbChip, DbButton, product cards, ...).

Guardrails:
- Block types, headline variants, tag variants and actions come from fixed
  whitelists; unknown values are dropped or defaulted.
- No raw HTML/JS is ever part of the intent (React renders everything as text),
  except the showcase SVG which is XML-escaped server-side.
"""

from __future__ import annotations

from typing import Any

from app.magento import MagentoClient
from app.session import Session
from app.tools.base import Tool, ToolRegistry
from app.tools.showcase import ACCENTS, LAYOUTS, _accent, render_svg, _resolve_products

BLOCK_TYPES = ("headline", "text", "tags", "chips", "product_cards", "showcase", "cart_summary", "actions", "divider")
HEADLINE_VARIANTS = ("1", "2", "3", "4", "5", "6")
TAG_VARIANTS = ("success", "error", "warning", "informative", "light")  # DB-UI DbTag-Varianten
ACTIONS = ("add_to_cart", "open_cart", "checkout")

MAX_BLOCKS = 12


def _clip(value: Any, n: int) -> str:
    return str(value or "")[:n]


def _validate_block(raw: Any, session: Session) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    btype = raw.get("type")
    if btype == "headline":
        variant = str(raw.get("variant", "2"))
        if variant not in HEADLINE_VARIANTS:
            variant = "2"
        return {"type": "headline", "text": _clip(raw.get("text"), 200), "variant": variant}
    if btype == "text":
        return {"type": "text", "text": _clip(raw.get("text"), 1000)}
    if btype == "tags":
        items = [
            {"label": _clip(t.get("label"), 80), "variant": t.get("variant") if t.get("variant") in TAG_VARIANTS else "light"}
            for t in (raw.get("items") or [])[:8]
            if isinstance(t, dict) and t.get("label")
        ]
        return {"type": "tags", "items": items} if items else None
    if btype == "chips":
        items = [
            {
                "label": _clip(c.get("label"), 80),
                "filter_code": _clip(c.get("filter_code"), 60) or None,
                "filter_value": _clip(c.get("filter_value"), 60) or None,
            }
            for c in (raw.get("items") or [])[:10]
            if isinstance(c, dict) and c.get("label")
        ]
        return {"type": "chips", "items": items} if items else None
    if btype == "product_cards":
        products = _resolve_products(session, {"positions": raw.get("positions")})
        return {"type": "product_cards", "products": products} if products else None
    if btype == "showcase":
        layout = raw.get("layout") if raw.get("layout") in LAYOUTS else "hero"
        headline = _clip(raw.get("headline"), 120) or "Deine Auswahl"
        note = _clip(raw.get("note"), 200)
        accent = _accent({"accent": raw.get("accent")})
        products = _resolve_products(session, {"positions": raw.get("positions")})
        if not products:
            return None
        return {
            "type": "showcase",
            "layout": layout,
            "headline": headline,
            "note": note,
            "accent": accent,
            "svg": render_svg(layout, headline, note, accent, products),
            "products": products,
        }
    if btype == "cart_summary":
        return {"type": "cart_summary"}
    if btype == "actions":
        items = []
        for a in (raw.get("items") or [])[:6]:
            if not isinstance(a, dict) or a.get("action") not in ACTIONS:
                continue
            item: dict[str, Any] = {"label": _clip(a.get("label"), 60) or a["action"], "action": a["action"]}
            if a["action"] == "add_to_cart":
                card = session.resolve_position(int(a.get("position") or 1)) if a.get("position") else None
                if card:
                    item["sku"] = card.get("sku")
                    item["name"] = card.get("name")
                else:
                    continue
            items.append(item)
        return {"type": "actions", "items": items} if items else None
    if btype == "divider":
        return {"type": "divider"}
    return None


async def compose_view(client: MagentoClient, args: dict[str, Any], session: Session) -> dict[str, Any]:
    title = _clip(args.get("title"), 120) or "Deine Ansicht"
    blocks: list[dict[str, Any]] = []
    for raw in (args.get("blocks") or [])[:MAX_BLOCKS]:
        block = _validate_block(raw, session)
        if block:
            blocks.append(block)
    if not blocks:
        # Fallback: Produktkarten der letzten Suche mit Add-to-Cart-Aktion
        products = _resolve_products(session, {})
        if products:
            blocks.append({"type": "product_cards", "products": products})
        blocks.append({"type": "actions", "items": [{"label": "Warenkorb öffnen", "action": "open_cart"}]})
    return {
        "intent": "ui_view",
        "title": title,
        "blocks": blocks,
        "narration": (
            f"Ich habe eine maßgeschneiderte Ansicht „{title}“ mit {len(blocks)} Bausteinen "
            "(DB-UI-Komponenten) zusammengestellt – Produktdaten kommen aus Magento."
        ),
    }


def register_view_tools(registry: ToolRegistry) -> None:
    registry.register(Tool(
        name="compose_view",
        description=(
            "Compose a custom shop view in the widget area from DB-UI building blocks, tailored to the "
            "customer's request (e.g. 'build me an overview page of the results'). Block types: "
            "headline {text, variant 1-6}, text {text}, tags {items:[{label, variant}]}, "
            "chips {items:[{label, filter_code, filter_value}]}, product_cards {positions:[1-based]}, "
            "showcase {layout, headline, note, accent, positions}, cart_summary, "
            "actions {items:[{label, action: add_to_cart|open_cart|checkout, position?}]}, divider. "
            "Product positions refer to the last search results; every product view includes an "
            "add-to-cart action."
        ),
        parameters={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Headline of the view, customer's language"},
                "blocks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": list(BLOCK_TYPES)},
                            "text": {"type": "string"},
                            "variant": {"type": "string"},
                            "items": {"type": "array", "items": {"type": "object"}},
                            "positions": {"type": "array", "items": {"type": "integer", "minimum": 1}},
                            "layout": {"type": "string", "enum": list(LAYOUTS)},
                            "headline": {"type": "string"},
                            "note": {"type": "string"},
                            "accent": {"type": "string", "enum": list(ACCENTS)},
                        },
                    },
                },
            },
            "required": ["title", "blocks"],
        },
        phase="*",
        uses_session=True,
        handler=compose_view,  # type: ignore[arg-type]
    ))
