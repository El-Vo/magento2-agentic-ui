"""Tests for the tool registry and confirm-gate against a fake GraphQL gateway."""

from __future__ import annotations

import json

import pytest
import respx
from httpx import Response

from app.agent import AgentService
from app.session import Session
from app.tools import build_registry

SEARCH_RESPONSE = {
    "data": {
        "products": {
            "total_count": 1,
            "items": [
                {
                    "id": 1,
                    "uid": "MQ==",
                    "sku": "hiking-boot-01",
                    "name": "Wasserdichter Wanderschuh",
                    "url_key": "hiking-boot",
                    "stock_status": "IN_STOCK",
                    "price_range": {"minimum_price": {"final_price": {"value": 129.9, "currency": "EUR"}}},
                }
            ],
            "aggregations": [],
        }
    }
}


async def test_registry_manifest_and_phases():
    registry = build_registry()
    names = {t["name"] for t in registry.manifest()}
    assert {"search_products", "product_details", "cart_add"} <= names
    schemas = registry.llm_schemas("browse")
    assert any(s["function"]["name"] == "search_products" for s in schemas)
    assert all(s["function"]["name"] != "cart_add" for s in schemas)


@respx.mock
async def test_search_products_returns_cards():
    respx.post("http://magento-test/graphql").mock(
        return_value=Response(200, json=SEARCH_RESPONSE)
    )
    from app.magento import MagentoClient

    from app.tools.catalog import search_products

    result = await search_products(MagentoClient("http://magento-test/graphql"), {"search": "wanderschuh"})
    assert result["intent"] == "product_list"
    assert result["total_count"] == 1
    assert result["results"][0]["sku"] == "hiking-boot-01"
    assert result["results"][0]["price"]["value"] == pytest.approx(129.9)


async def test_confirm_gate_blocks_mutations():
    registry = build_registry()
    service = AgentService(registry)
    session = Session()
    result = await service._dispatch(session, "cart_add", {"sku": "hiking-boot-01"})
    assert result["intent"] == "confirm_required"
    assert result["tool"] == "cart_add"
    assert session.cart_id is None


async def test_session_resolves_positions():
    session = Session()
    session.last_results = [{"sku": "a"}, {"sku": "b"}]
    assert session.resolve_position(2)["sku"] == "b"
    assert session.resolve_position(3) is None
