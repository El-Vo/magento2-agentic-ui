"""Tests for compose_showcase: dynamic SVG graphics composed from session products.

Guardrails under test: XML-escaping of untrusted product text, accent-color
whitelist, media-URL restriction, position resolution against last_results.
"""

from __future__ import annotations

import pytest

from app.session import Session
from app.tools.showcase import ACCENTS, compose_showcase, render_svg


def _session_with_results() -> Session:
    session = Session()
    session.last_results = [
        {
            "position": 1,
            "sku": "BE-JACKE-03",
            "name": 'Outdoor-Jacke <script>alert("x")</script>',
            "price": {"value": 149.0, "currency": "EUR"},
            "stock_status": "IN_STOCK",
            "image": "http://localhost:8080/media/catalog/product/jacke.jpg",
        },
        {
            "position": 2,
            "sku": "EL-KOPFHOERER-01",
            "name": "Kopfhörer",
            "price": {"value": 129.99, "currency": "EUR"},
            "stock_status": "IN_STOCK",
            "image": "javascript:alert(1)",  # nicht vom Magento-Host -> wird verworfen
        },
        {
            "position": 3,
            "sku": "BE-TSHIRT-01",
            "name": "T-Shirt",
            "price": {"value": 24.99, "currency": "EUR"},
            "stock_status": "OUT_OF_STOCK",
            "image": None,
        },
    ]
    return session


class _NoopClient:
    pass


async def test_compose_showcase_resolves_positions_and_narrates():
    session = _session_with_results()
    result = await compose_showcase(_NoopClient(), {"layout": "compare", "positions": [1, 3], "headline": "Mein Vergleich"}, session)
    assert result["intent"] == "ui_layout"
    assert result["layout"] == "compare"
    assert [p["sku"] for p in result["products"]] == ["BE-JACKE-03", "BE-TSHIRT-01"]
    assert result["svg"].startswith("<svg")
    assert "Mein Vergleich" in result["svg"]
    assert result["narration"]


async def test_svg_escapes_untrusted_product_text():
    session = _session_with_results()
    result = await compose_showcase(_NoopClient(), {"layout": "hero", "headline": "Outdoor <b>fett</b>"}, session)
    svg = result["svg"]
    assert "<script>" not in svg
    assert "&lt;script&gt;" in svg
    assert "&lt;b&gt;" in svg


async def test_accent_color_is_whitelisted():
    session = _session_with_results()
    evil = await compose_showcase(_NoopClient(), {"layout": "hero", "accent": "red;fill:url(#x)"}, session)
    assert evil["accent"] == ACCENTS["rot"]
    ok = await compose_showcase(_NoopClient(), {"layout": "hero", "accent": "blau"}, session)
    assert ok["accent"] == ACCENTS["blau"]


async def test_media_url_must_come_from_magento_host():
    session = _session_with_results()
    result = await compose_showcase(_NoopClient(), {"layout": "moodboard", "positions": [1, 2]}, session)
    svg = result["svg"]
    assert "javascript:alert(1)" not in svg
    assert "http://localhost:8080/media/catalog/product/jacke.jpg" in svg


async def test_unknown_layout_falls_back_and_empty_session_errors():
    session = _session_with_results()
    result = await compose_showcase(_NoopClient(), {"layout": "does-not-exist"}, session)
    assert result["layout"] == "hero"
    empty = Session()
    result = await compose_showcase(_NoopClient(), {"layout": "hero"}, empty)
    assert result["intent"] == "error"


@pytest.mark.parametrize("layout", ["hero", "compare", "moodboard", "price_chart"])
def test_render_svg_all_layouts(layout: str):
    session = _session_with_results()
    products = session.last_results
    svg = render_svg(layout, "Kopfzeile", "Notiz", ACCENTS["rot"], products)
    assert svg.startswith("<svg") and svg.endswith("</svg>")
    assert "Kopfzeile" in svg
