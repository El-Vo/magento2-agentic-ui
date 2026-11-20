"""Tests for the checkout tool chain and the widget checkout endpoints."""

from __future__ import annotations

import json

import pytest
import respx
from httpx import ASGITransport, AsyncClient, Response

from app.session import Session
from app.tools import build_registry
from app.tools.checkout import checkout_overview, place_order

CART_QUERY_RESPONSE = {
    "data": {
        "cart": {
            "id": "abc123",
            "email": "demo.kunde@agentic.local",
            "total_quantity": 2,
            "prices": {
                "grand_total": {"value": 154.89, "currency": "EUR"},
                "subtotal_including_tax": {"value": 150.0, "currency": "EUR"},
            },
            "items": [
                {
                    "id": 1,
                    "uid": "u1",
                    "product": {"sku": "EL-KOPFHOERER-01", "name": "Kabellose Over-Ear-Kopfhörer"},
                    "quantity": 2,
                    "prices": {"row_total": {"value": 259.98, "currency": "EUR"}, "price": {"value": 129.99, "currency": "EUR"}},
                }
            ],
            "shipping_addresses": [
                {
                    "firstname": None,
                    "lastname": None,
                    "street": None,
                    "city": None,
                    "region": None,
                    "postcode": None,
                    "country_code": None,
                    "telephone": None,
                    "selected_shipping_method": None,
                    "available_shipping_methods": [
                        {
                            "available": True,
                            "carrier_code": "flatrate",
                            "carrier_title": "Flat Rate",
                            "method_code": "flatrate",
                            "method_title": "Fixed",
                            "amount": {"value": 4.95, "currency": "EUR"},
                            "error_message": None,
                        }
                    ],
                }
            ],
            "available_payment_methods": [{"code": "checkmo", "name": "Check / Money order"}],
            "selected_payment_method": None,
        }
    }
}

PLACE_ORDER_RESPONSE = {"data": {"placeOrder": {"order": {"id": "5", "order_number": "000000005"}}}}


def test_checkout_tools_registered_with_confirm_gate():
    registry = build_registry()
    names = {t["name"]: t for t in registry.manifest()}
    for name in ("checkout_overview", "set_checkout_email", "set_shipping_address",
                 "set_shipping_method", "set_payment_method", "place_order"):
        assert name in names, name
    assert names["checkout_overview"]["requires_confirmation"] is False
    for name in ("set_shipping_address", "set_shipping_method", "set_payment_method", "place_order"):
        assert names[name]["requires_confirmation"] is True
    schemas = registry.llm_schemas("checkout")
    assert {s["function"]["name"] for s in schemas} >= {
        "checkout_overview", "set_shipping_address", "set_shipping_method", "set_payment_method", "place_order"
    }


@respx.mock
async def test_checkout_overview_returns_live_magento_state():
    respx.post("http://magento-test/graphql").mock(return_value=Response(200, json=CART_QUERY_RESPONSE))
    from app.magento import MagentoClient

    result = await checkout_overview(MagentoClient("http://magento-test/graphql"), {"cart_id": "abc123"})
    assert result["intent"] == "checkout"
    assert result["cart_id"] == "abc123"
    assert result["cart"]["total_quantity"] == 2
    assert result["available_payment_methods"][0]["code"] == "checkmo"
    assert result["available_shipping_methods"][0]["carrier_code"] == "flatrate"
    assert "narration" in result and result["narration"]


@respx.mock
async def test_place_order_returns_order_number():
    respx.post("http://magento-test/graphql").mock(return_value=Response(200, json=PLACE_ORDER_RESPONSE))
    from app.magento import MagentoClient

    result = await place_order(MagentoClient("http://magento-test/graphql"), {"cart_id": "abc123"})
    assert result["intent"] == "order_placed"
    assert result["order"]["order_number"] == "000000005"
    assert "000000005" in result["narration"]


def _graphql_router(request):
    """Route fake GraphQL responses by the mutation/query keyword in the body."""
    query = json.loads(request.content)["query"]
    if "placeOrder" in query:
        return Response(200, json=PLACE_ORDER_RESPONSE)
    if "setPaymentMethodOnCart" in query:
        return Response(200, json={"data": {"setPaymentMethodOnCart": {"cart": {
            "id": "abc123",
            "selected_payment_method": {"code": "checkmo", "name": "Check / Money order"},
            "prices": {"grand_total": {"value": 154.89, "currency": "EUR"}},
        }}}})
    if "setShippingMethodsOnCart" in query or "setShippingAddressesOnCart" in query or "cart(" in query:
        return Response(200, json=CART_QUERY_RESPONSE)
    raise AssertionError(f"unexpected query: {query[:80]}")


@respx.mock
async def test_widget_checkout_endpoints(monkeypatch):
    """The widget drives the same handlers via /checkout/* on the persistent customer cart."""
    respx.post("http://magento-test/graphql").mock(side_effect=_graphql_router)
    import app.main as main
    from app.magento import MagentoClient

    class _StubClient(MagentoClient):
        def __init__(self):
            super().__init__("http://magento-test/graphql")

    async def _stub_customer_client():
        return _StubClient()

    monkeypatch.setattr(main, "_customer_client", _stub_customer_client)
    main._customer_cart_id = "abc123"

    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/checkout/overview")
        assert resp.status_code == 200
        body = resp.json()
        assert body["intent"] == "checkout"
        assert body["available_payment_methods"][0]["code"] == "checkmo"

        resp = await client.post("/checkout/payment", json={"code": "checkmo"})
        assert resp.status_code == 200
        assert resp.json()["intent"] == "checkout"
        assert resp.json()["selected_payment_method"]["code"] == "checkmo"

        resp = await client.post("/checkout/place")
        assert resp.status_code == 200
        assert resp.json()["intent"] == "order_placed"
        assert resp.json()["order"]["order_number"] == "000000005"
        assert main._customer_cart_id is None  # nach Bestellung zurückgesetzt


@respx.mock
async def test_sse_chat_stream_emits_tool_calls_with_args(monkeypatch):
    """POST /chat/stream streams tool_start/tool_end with args + narration (mock mode)."""
    from app.tools.catalog import SEARCH_QUERY  # noqa: F401  (ensure module import side effects)

    search_response = {
        "data": {
            "products": {
                "total_count": 1,
                "items": [
                    {
                        "id": 1,
                        "uid": "MQ==",
                        "sku": "BE-JACKE-03",
                        "name": "Wasserdichte Outdoor-Jacke",
                        "url_key": "outdoor-jacke",
                        "stock_status": "IN_STOCK",
                        "media_gallery": [],
                        "price_range": {"minimum_price": {"final_price": {"value": 149.0, "currency": "EUR"}}},
                    }
                ],
                "aggregations": [],
            }
        }
    }
    respx.post("http://magento-test/graphql").mock(return_value=Response(200, json=search_response))

    import app.main as main
    from app.magento import MagentoClient

    monkeypatch.setattr(
        "app.agent.MagentoClient",
        lambda: MagentoClient("http://magento-test/graphql"),
    )
    main.agent.client = None  # Mock-Modus

    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/chat/stream", json={"message": "zeig mir jacken unter 150 €"})
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = resp.text

    events = []
    for block in body.split("\n\n"):
        if block.startswith("event: "):
            name, _, data = block.partition("\ndata: ")
            events.append((name.removeprefix("event: "), json.loads(data)))

    names = [e[0] for e in events]
    assert "tool_start" in names and "tool_end" in names and "done" in names
    start = next(d for n, d in events if n == "tool_start")
    assert start["tool"] == "search_products"
    assert start["args"]["filter"] == {"price": {"lt": "150"}}
    assert "Katalog" in start["narration"]  # Agent beschreibt, was er tut
    done = next(d for n, d in events if n == "done")
    assert done["result"]["intents"][0]["intent"] == "product_list"
    assert done["tool_trace"][0]["args"]["search"] == "jacken"


async def test_session_phase_transitions():
    from app.agent import AgentService

    service = AgentService(build_registry())
    session = Session()
    service._absorb(session, {"intent": "product_list", "results": []})
    assert session.phase == "browse"
    service._absorb(session, {"intent": "cart_updated", "cart_id": "c1"})
    assert session.phase == "cart" and session.cart_id == "c1"
    service._absorb(session, {"intent": "checkout"})
    assert session.phase == "checkout"
    service._absorb(session, {"intent": "order_placed"})
    assert session.phase == "browse" and session.cart_id is None


@respx.mock
async def test_mock_full_userflow_search_to_confirm(monkeypatch):
    """Mock mode: research -> 'das erste in den warenkorb' -> confirm-gate -> cart."""
    from app.agent import AgentService
    from app.magento import MagentoClient

    search_response = {
        "data": {
            "products": {
                "total_count": 2,
                "items": [
                    {"id": 1, "uid": "MQ==", "sku": "BE-JACKE-03", "name": "Outdoor-Jacke", "url_key": "jacke",
                     "stock_status": "IN_STOCK", "media_gallery": [],
                     "price_range": {"minimum_price": {"final_price": {"value": 149.0, "currency": "EUR"}}}},
                    {"id": 2, "uid": "Mg==", "sku": "BE-TSHIRT-01", "name": "T-Shirt", "url_key": "tshirt",
                     "stock_status": "IN_STOCK", "media_gallery": [],
                     "price_range": {"minimum_price": {"final_price": {"value": 24.99, "currency": "EUR"}}}},
                ],
                "aggregations": [],
            }
        }
    }
    add_response = {"data": {"addSimpleProductsToCart": {"cart": {
        "total_quantity": 1,
        "prices": {"grand_total": {"value": 149.0, "currency": "EUR"}},
    }}}}

    def router(request):
        query = json.loads(request.content)["query"]
        if "addSimpleProductsToCart" in query:
            return Response(200, json=add_response)
        if "createEmptyCart" in query:
            return Response(200, json={"data": {"createEmptyCart": "newcart1"}})
        return Response(200, json=search_response)

    respx.post("http://magento-test/graphql").mock(side_effect=router)
    monkeypatch.setattr("app.agent.MagentoClient", lambda: MagentoClient("http://magento-test/graphql"))

    service = AgentService(build_registry())
    service.client = None
    session = Session()

    r1 = await service.run(session, "zeig mir outdoor jacken")
    assert r1["intents"][0]["intent"] == "product_list"
    assert r1["tool_trace"][0]["args"]["search"] == "outdoor jacken"
    assert r1["tool_trace"][0]["narration"]

    r2 = await service.run(session, "das erste in den warenkorb")
    confirm = r2["intents"][0]
    assert confirm["intent"] == "confirm_required"
    assert confirm["tool"] == "cart_add"
    assert confirm["args"]["sku"] == "BE-JACKE-03"  # Position 1 aufgelöst
    assert "bestätige" in confirm["narration"]

    r3 = await service.execute_confirmed(session, confirm["tool"], confirm["args"])
    assert r3["intent"] == "cart_updated"
    assert session.cart_id is not None
    assert session.phase == "cart"


# ---------------------------------------------------------------- Cart-Bug


def test_normalize_cart_sorts_items_stably_by_id():
    from app.tools.cart import normalize_cart

    cart = {"id": "c1", "total_quantity": 3, "items": [
        {"id": 7, "product": {"sku": "B"}}, {"id": 2, "product": {"sku": "A"}}, {"id": 5, "product": {"sku": "C"}},
    ]}
    out = normalize_cart(cart)
    assert [i["id"] for i in out["items"]] == [2, 5, 7]
    assert normalize_cart(None) is None
    # erneutes Sortieren ändert nichts (immer gleiche Reihenfolge)
    assert [i["id"] for i in normalize_cart(out)["items"]] == [2, 5, 7]


@respx.mock
async def test_cart_add_returns_full_items(monkeypatch):
    """Bugfix: Mutationen liefern items mit -> Badge und Warenkorbansicht konsistent."""
    from app.magento import MagentoClient
    from app.tools.cart import cart_add

    add_response = {"data": {"addSimpleProductsToCart": {"cart": {
        "id": "c1",
        "total_quantity": 2,
        "prices": {"grand_total": {"value": 298.0, "currency": "EUR"}, "subtotal_including_tax": {"value": 298.0, "currency": "EUR"}},
        "items": [
            {"id": 9, "uid": "u9", "product": {"sku": "B", "name": "B"}, "quantity": 1, "prices": {"row_total": {"value": 149.0, "currency": "EUR"}}},
            {"id": 3, "uid": "u3", "product": {"sku": "A", "name": "A"}, "quantity": 1, "prices": {"row_total": {"value": 149.0, "currency": "EUR"}}},
        ],
    }}}}
    respx.post("http://magento-test/graphql").mock(return_value=Response(200, json=add_response))
    result = await cart_add(MagentoClient("http://magento-test/graphql"), {"cart_id": "c1", "sku": "B", "quantity": 1})
    assert result["intent"] == "cart_updated"
    assert [i["id"] for i in result["cart"]["items"]] == [3, 9]  # sortiert
    assert result["cart"]["total_quantity"] == 2


# ---------------------------------------------------------------- compose_view


async def test_compose_view_validates_blocks_and_resolves_products():
    from app.session import Session
    from app.tools.view import compose_view

    session = Session()
    session.last_results = [
        {"position": 1, "sku": "A", "name": "Produkt A", "price": {"value": 10.0, "currency": "EUR"}, "stock_status": "IN_STOCK"},
        {"position": 2, "sku": "B", "name": "Produkt B", "price": {"value": 20.0, "currency": "EUR"}, "stock_status": "IN_STOCK"},
    ]
    result = await compose_view(None, {
        "title": "Meine Seite",
        "blocks": [
            {"type": "headline", "text": "Hallo", "variant": "99"},          # -> variant default 2
            {"type": "hack", "text": "<script>"},                              # unbekannter Typ -> verworfen
            {"type": "product_cards", "positions": [2, 1]},
            {"type": "showcase", "layout": "compare", "headline": "Vgl", "accent": "blau"},
            {"type": "actions", "items": [
                {"label": "A in den Warenkorb", "action": "add_to_cart", "position": 1},
                {"label": "böse", "action": "delete_everything"},              # nicht whitelisted -> verworfen
                {"label": "Cart", "action": "open_cart"},
            ]},
            {"type": "text", "text": "Fertig."},
        ],
    }, session)
    assert result["intent"] == "ui_view"
    types = [b["type"] for b in result["blocks"]]
    assert types == ["headline", "product_cards", "showcase", "actions", "text"]
    assert result["blocks"][0]["variant"] == "2"
    assert [p["sku"] for p in result["blocks"][1]["products"]] == ["B", "A"]
    assert result["blocks"][2]["svg"].startswith("<svg")
    actions = result["blocks"][3]["items"]
    assert [a["action"] for a in actions] == ["add_to_cart", "open_cart"]
    assert actions[0]["sku"] == "A"


async def test_compose_view_fallback_and_mock_branch():
    from app.agent import AgentService
    from app.session import Session
    from app.tools import build_registry

    session = Session()
    session.last_results = [{"position": 1, "sku": "A", "name": "A", "price": {"value": 1, "currency": "EUR"}}]
    service = AgentService(build_registry())
    service.client = None
    result = await service.run(session, "baue mir eine übersicht")
    assert result["intents"][0]["intent"] == "ui_view"
    assert result["tool_trace"][0]["tool"] == "compose_view"
    assert result["tool_trace"][0]["args"]["blocks"]
