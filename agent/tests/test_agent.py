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


def _completion(tool_calls=None, content=None):
    """Build a real mistralai 3.x ChatCompletionResponse for the stubbed client."""
    from mistralai.client.models import (
        AssistantMessage,
        ChatCompletionChoice,
        ChatCompletionResponse,
        FunctionCall,
        ToolCall,
        UsageInfo,
    )

    calls = [
        ToolCall(id=f"call_{i}", function=FunctionCall(name=c[0], arguments=c[1]))
        for i, c in enumerate(tool_calls or [])
    ]
    message = AssistantMessage(role="assistant", content=content, tool_calls=calls or None)
    choice = ChatCompletionChoice(finish_reason="tool_calls" if calls else "stop", index=0, message=message)
    return ChatCompletionResponse(
        id="chat-test",
        object="chat.completion",
        model="test-model",
        created=0,
        choices=[choice],
        usage=UsageInfo(prompt_tokens=1, completion_tokens=1, total_tokens=2),
    )


class _StubChat:
    def __init__(self, responses):
        self._responses = list(responses)

    def complete(self, **kwargs):  # mistralai 3.x: chat.complete is synchronous
        return self._responses.pop(0)


class _StubClient:
    def __init__(self, responses):
        self.chat = _StubChat(responses)


@respx.mock
async def test_llm_tool_call_loop_dispatches_via_function_name(monkeypatch):
    """Regression: mistralai 3.x ToolCall has no .name – the tool name is call.function.name."""
    respx.post("http://magento-test/graphql").mock(return_value=Response(200, json=SEARCH_RESPONSE))
    from app.magento import MagentoClient

    monkeypatch.setattr("app.agent.MagentoClient", lambda: MagentoClient("http://magento-test/graphql"))

    registry = build_registry()
    service = AgentService(registry)
    service.client = _StubClient([
        _completion(tool_calls=[
            ("search_products", '{"search": "wanderschuh", "page_size": 4}'),  # arguments as JSON str
            ("search_products", {"search": "schuh", "page_size": 2}),           # arguments as dict
        ]),
        _completion(content="Hier sind die Treffer."),
    ])
    session = Session()
    result = await service._run_llm(session, "zeig mir wanderschuhe")

    assert result["text"] == "Hier sind die Treffer."
    product_lists = [i for i in result["intents"] if i["intent"] == "product_list"]
    assert len(product_lists) == 2
    assert product_lists[0]["results"][0]["sku"] == "hiking-boot-01"
    assert session.last_results[0]["sku"] == "hiking-boot-01"
