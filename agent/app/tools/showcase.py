"""Showcase tool: the agent composes a dynamic graphic (SVG) from products.

`compose_showcase` picks a layout (hero / compare / moodboard / price_chart),
resolves the referenced result positions against the session's last_results
(never free-text guesses) and renders a deterministic SVG server-side from
Magento product data (name, price, stock, media). The LLM only chooses layout,
headline, accent color and positions – all product facts come from Magento.

Guardrails:
- Product text is untrusted: every string is XML-escaped before it enters the SVG.
- Accent colors come from a fixed whitelist (no arbitrary CSS/URL injection).
- Media URLs are only embedded if they start with the Magento base URL or https.
"""

from __future__ import annotations

import html
from typing import Any

from app.config import settings
from app.magento import MagentoClient
from app.session import Session
from app.tools.base import Tool, ToolRegistry

LAYOUTS = ("hero", "compare", "moodboard", "price_chart")

ACCENTS = {
    "rot": "#e30613",
    "blau": "#003a70",
    "tuerkis": "#009fb0",
    "gruen": "#4c8c2b",
    "dunkel": "#131821",
    "gold": "#c8a24b",
}

LAYOUT_LABELS = {
    "hero": "Hero-Banner",
    "compare": "Produktvergleich",
    "moodboard": "Moodboard",
    "price_chart": "Preisvergleich",
}

_W = 800
_H = 360


def _esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _accent(args: dict[str, Any]) -> str:
    return ACCENTS.get(str(args.get("accent", "")).lower(), ACCENTS["rot"])


def _money(price: dict[str, Any] | None) -> str:
    if not price:
        return "–"
    return f"{price.get('value', 0):.2f} {price.get('currency', 'EUR')}"


def _image_url(product: dict[str, Any]) -> str | None:
    url = product.get("image")
    if not url:
        return None
    base = settings.magento_base_url.rstrip("/")
    if url.startswith(base) or url.startswith("https://"):
        return url
    return None


def _resolve_products(session: Session, args: dict[str, Any]) -> list[dict[str, Any]]:
    positions = args.get("positions")
    if not positions:
        positions = [p.get("position") for p in session.last_results if p.get("position")]
    products = []
    for pos in positions:
        try:
            pos = int(pos)
        except (TypeError, ValueError):
            continue
        card = session.resolve_position(pos)
        if card:
            products.append(card)
    if not products and session.last_results:
        products = list(session.last_results)
    return products[:6]


def _svg_hero(headline: str, note: str, accent: str, products: list[dict[str, Any]]) -> str:
    first = products[0] if products else {}
    img = _image_url(first)
    img_tag = f'<image href="{_esc(img)}" x="520" y="40" width="240" height="240" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)" />' if img else ""
    price = _money(first.get("price"))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_W} {_H}" role="img" aria-label="{_esc(headline)}">
  <defs><clipPath id="c"><rect x="520" y="40" width="240" height="240" rx="12"/></clipPath>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{accent}"/><stop offset="1" stop-color="#131821"/></linearGradient></defs>
  <rect width="{_W}" height="{_H}" fill="url(#g)"/>
  {img_tag}
  <text x="40" y="110" fill="#fff" font-size="34" font-weight="700" font-family="sans-serif">{_esc(headline)}</text>
  <text x="40" y="160" fill="#fff" font-size="20" font-family="sans-serif">{_esc(first.get('name') or '')}</text>
  <text x="40" y="200" fill="#fff" font-size="24" font-weight="700" font-family="sans-serif">{_esc(price)}</text>
  <text x="40" y="250" fill="#e8e8e8" font-size="15" font-family="sans-serif">{_esc(note)}</text>
  <text x="40" y="320" fill="#e8e8e8" font-size="13" font-family="sans-serif">{len(products)} Produkt(e) ausgewählt</text>
</svg>"""


def _svg_compare(headline: str, accent: str, products: list[dict[str, Any]]) -> str:
    rows = []
    y = 110
    for p in products:
        stock = "auf Lager" if p.get("stock_status") == "IN_STOCK" else "nicht verfügbar"
        rows.append(
            f'<text x="40" y="{y}" font-size="17" fill="#131821" font-family="sans-serif">{_esc(p.get("name") or "")}</text>'
            f'<text x="560" y="{y}" font-size="17" font-weight="700" fill="{accent}" font-family="sans-serif">{_esc(_money(p.get("price")))}</text>'
            f'<text x="680" y="{y}" font-size="13" fill="#5a6472" font-family="sans-serif">{_esc(stock)}</text>'
        )
        y += 42
        rows.append(f'<line x1="40" y1="{y - 30}" x2="760" y2="{y - 30}" stroke="#e3e6ea" stroke-width="1"/>')
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_W} {_H}" role="img" aria-label="{_esc(headline)}">
  <rect width="{_W}" height="{_H}" fill="#ffffff"/>
  <rect width="{_W}" height="70" fill="{accent}"/>
  <text x="40" y="45" fill="#fff" font-size="26" font-weight="700" font-family="sans-serif">{_esc(headline)}</text>
  {''.join(rows)}
</svg>"""


def _svg_price_chart(headline: str, accent: str, products: list[dict[str, Any]]) -> str:
    priced = [p for p in products if p.get("price")]
    max_v = max((p["price"].get("value") or 0) for p in priced) or 1
    bars = []
    x = 60
    for p in priced:
        v = p["price"].get("value") or 0
        h = int(220 * v / max_v)
        bars.append(
            f'<rect x="{x}" y="{300 - h}" width="90" height="{h}" fill="{accent}" rx="4"/>'
            f'<text x="{x + 45}" y="{318}" font-size="14" text-anchor="middle" fill="#131821" font-family="sans-serif">{_esc(_money(p.get("price")))}</text>'
            f'<text x="{x + 45}" y="{336}" font-size="11" text-anchor="middle" fill="#5a6472" font-family="sans-serif">{_esc((p.get("name") or "")[:14])}</text>'
        )
        x += 120
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_W} {_H}" role="img" aria-label="{_esc(headline)}">
  <rect width="{_W}" height="{_H}" fill="#ffffff"/>
  <text x="40" y="45" font-size="26" font-weight="700" fill="#131821" font-family="sans-serif">{_esc(headline)}</text>
  <line x1="40" y1="300" x2="760" y2="300" stroke="#131821" stroke-width="2"/>
  {''.join(bars)}
</svg>"""


def _svg_moodboard(headline: str, accent: str, products: list[dict[str, Any]]) -> str:
    cells = []
    positions = [(40, 90), (280, 90), (520, 90), (40, 220), (280, 220), (520, 220)]
    for (x, y), p in zip(positions, products):
        img = _image_url(p)
        img_tag = f'<image href="{_esc(img)}" x="{x}" y="{y}" width="220" height="110" preserveAspectRatio="xMidYMid slice" clip-path="url(#m{x}_{y})" />' if img else f'<rect x="{x}" y="{y}" width="220" height="110" fill="{accent}" opacity="0.15" rx="8"/>'
        cells.append(
            f'<defs><clipPath id="m{x}_{y}"><rect x="{x}" y="{y}" width="220" height="110" rx="8"/></clipPath></defs>'
            f'{img_tag}'
            f'<text x="{x}" y="{y + 132}" font-size="13" fill="#131821" font-family="sans-serif">{_esc((p.get("name") or "")[:28])}</text>'
            f'<text x="{x}" y="{y + 150}" font-size="13" font-weight="700" fill="{accent}" font-family="sans-serif">{_esc(_money(p.get("price")))}</text>'
        )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_W} {_H}" role="img" aria-label="{_esc(headline)}">
  <rect width="{_W}" height="{_H}" fill="#f4f5f7"/>
  <text x="40" y="50" font-size="26" font-weight="700" fill="{accent}" font-family="sans-serif">{_esc(headline)}</text>
  {''.join(cells)}
</svg>"""


def render_svg(layout: str, headline: str, note: str, accent: str, products: list[dict[str, Any]]) -> str:
    if layout == "compare":
        return _svg_compare(headline, accent, products)
    if layout == "price_chart":
        return _svg_price_chart(headline, accent, products)
    if layout == "moodboard":
        return _svg_moodboard(headline, accent, products)
    return _svg_hero(headline, note, accent, products)


async def compose_showcase(client: MagentoClient, args: dict[str, Any], session: Session) -> dict[str, Any]:
    layout = args.get("layout", "hero")
    if layout not in LAYOUTS:
        layout = "hero"
    headline = str(args.get("headline") or "Deine Auswahl").strip() or "Deine Auswahl"
    note = str(args.get("note") or "").strip()
    accent = _accent(args)
    products = _resolve_products(session, args)
    if not products:
        return {
            "intent": "error",
            "message": "no products in session – run search_products first",
            "narration": " Dafür brauche ich zuerst Suchergebnisse – ich suche kurz im Katalog.",
        }
    svg = render_svg(layout, headline, note, accent, products)
    return {
        "intent": "ui_layout",
        "layout": layout,
        "layout_label": LAYOUT_LABELS[layout],
        "headline": headline,
        "note": note,
        "accent": accent,
        "svg": svg,
        "products": products,
        "narration": (
            f"Ich habe eine Grafik „{LAYOUT_LABELS[layout]}“ mit {len(products)} Produkt(en) "
            f"aus der letzten Suche erstellt – alle Daten (Preise, Lager, Bilder) kommen aus Magento."
        ),
    }


def register_showcase_tools(registry: ToolRegistry) -> None:
    registry.register(Tool(
        name="compose_showcase",
        description=(
            "Compose a dynamic graphic (SVG) in the shop view from the current result list: "
            "layout hero|compare|moodboard|price_chart, headline, accent color (rot|blau|tuerkis|gruen|dunkel|gold) "
            "and product positions (1-based, from the last search). Use it when the customer asks for a "
            "visualization, comparison, moodboard or poster of the products. Product data always comes "
            "from the session's search results (Magento), never invented."
        ),
        parameters={
            "type": "object",
            "properties": {
                "layout": {"type": "string", "enum": list(LAYOUTS)},
                "headline": {"type": "string", "description": "Headline of the graphic, in the customer's language"},
                "note": {"type": "string", "description": "Short subline, e.g. the customer's wish"},
                "accent": {"type": "string", "enum": list(ACCENTS)},
                "positions": {
                    "type": "array",
                    "items": {"type": "integer", "minimum": 1},
                    "description": "1-based positions from the last result list (default: all)",
                },
            },
            "required": ["layout"],
        },
        phase="*",
        uses_session=True,
        handler=compose_showcase,  # type: ignore[arg-type]
    ))
