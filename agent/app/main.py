"""FastAPI app: /chat, /chat/stream (SSE), /cart, /checkout/*, /confirm, /health, /tools."""

from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent import AgentService
from app.config import settings
from app.customer import ensure_customer, get_cached_token
from app.magento import MagentoClient
from app.session import session_store
from app.tools import build_registry
from app.tools.cart import CART_QUERY, cart_add
from app.tools.checkout import (
    checkout_overview,
    place_order,
    set_payment_method,
    set_shipping_address,
    set_shipping_method,
)

app = FastAPI(title="Magento Agentic UI Agent", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.agent_allowed_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

registry = build_registry()
agent = AgentService(registry)


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str


class ConfirmRequest(BaseModel):
    session_id: str
    tool: str
    args: dict[str, Any]


class CartAddRequest(BaseModel):
    sku: str
    quantity: float = 1.0


class AddressRequest(BaseModel):
    firstname: str
    lastname: str
    street: list[str]
    city: str
    postcode: str
    country_code: str = "DE"
    region: str | None = None
    telephone: str = ""


class ShippingMethodRequest(BaseModel):
    carrier_code: str
    method_code: str


class PaymentMethodRequest(BaseModel):
    code: str


# Warenkorb-ID des dauerhaften Kunden (Demo: Cart wird einmalig angelegt)
_customer_cart_id: str | None = None


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "llm_enabled": settings.llm_enabled,
        "magento_graphql_url": settings.magento_graphql_url,
    }


@app.get("/tools")
async def tools() -> dict[str, Any]:
    return {"tools": registry.manifest()}


@app.post("/chat")
async def chat(req: ChatRequest) -> dict[str, Any]:
    session = session_store.get(req.session_id)
    result = await agent.run(session, req.message)
    session_store.save(session)
    return {"session_id": session.id, **result}


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """SSE stream: narration + live tool calls (with args) + intents + final text.

    Events: text, tool_start {tool,args,narration}, tool_end {tool,args,intent,narration},
    done {result:{text,intents}, tool_trace}.
    """
    session = session_store.get(req.session_id)

    async def events() -> Any:
        trace: list[dict[str, Any]] = []
        async for ev in agent.run_events(session, req.message, trace):
            if ev["event"] == "done":
                yield f"event: done\ndata: {json.dumps({'session_id': session.id, 'result': ev['result'], 'tool_trace': trace}, default=str)}\n\n"
            else:
                yield f"event: {ev['event']}\ndata: {json.dumps(ev, default=str)}\n\n"
        session_store.save(session)

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/confirm")
async def confirm(req: ConfirmRequest) -> dict[str, Any]:
    session = session_store.get(req.session_id)
    if session.id != req.session_id:
        raise HTTPException(status_code=404, detail="unknown session")
    result = await agent.execute_confirmed(session, req.tool, req.args)
    session_store.save(session)
    return {
        "session_id": session.id,
        "text": result.get("narration", "Aktion ausgeführt."),
        "intents": [result],
        "tool_trace": [{"tool": req.tool, "args": req.args, "status": "done", "intent": result.get("intent")}],
    }


async def _customer_client() -> MagentoClient:
    """Client im Namen des dauerhaften Kunden (Token lazy holen)."""
    if not get_cached_token():
        await ensure_customer()
    return MagentoClient(token=get_cached_token())


async def _widget_cart_id(client: MagentoClient) -> str:
    global _customer_cart_id
    if not _customer_cart_id:
        _customer_cart_id = await client.create_empty_cart()
    return _customer_cart_id


@app.post("/cart/add")
async def cart_add_item(req: CartAddRequest) -> dict[str, Any]:
    """Widget: direktes Hinzufuegen ohne Confirm-Gate (explizite UI-Aktion)."""
    client = await _customer_client()
    cart_id = await _widget_cart_id(client)
    result = await cart_add(client, {
        "cart_id": cart_id,
        "sku": req.sku,
        "quantity": req.quantity,
    })
    return {"cart": result.get("cart")}


@app.get("/cart")
async def get_cart() -> dict[str, Any]:
    """Warenkorb-Inhalt des dauerhaften Kunden."""
    client = await _customer_client()
    if not _customer_cart_id:
        return {"cart": None}
    data = await client.execute(CART_QUERY, {"cart_id": _customer_cart_id})
    return {"cart": data["cart"]}


# ---------------------------------------------------------------- Checkout
# Widget-Checkout auf dem Warenkorb des dauerhaften Kunden. Jede Stufe ist
# eine explizite UI-Aktion (Formular/Buttons) und ruft die gleich benannten
# Tool-Handler direkt – das LLM sieht nur die Method-Codes, nie Zahlungsdaten.


@app.get("/checkout/overview")
async def checkout_overview_widget() -> dict[str, Any]:
    client = await _customer_client()
    if not _customer_cart_id:
        return {"intent": "checkout", "cart": None}
    return await checkout_overview(client, {"cart_id": _customer_cart_id})


@app.post("/checkout/address")
async def checkout_address(req: AddressRequest) -> dict[str, Any]:
    client = await _customer_client()
    cart_id = await _widget_cart_id(client)
    return await set_shipping_address(client, {"cart_id": cart_id, **req.model_dump()})


@app.post("/checkout/shipping")
async def checkout_shipping(req: ShippingMethodRequest) -> dict[str, Any]:
    client = await _customer_client()
    if not _customer_cart_id:
        raise HTTPException(status_code=400, detail="no cart yet")
    return await set_shipping_method(client, {"cart_id": _customer_cart_id, **req.model_dump()})


@app.post("/checkout/payment")
async def checkout_payment(req: PaymentMethodRequest) -> dict[str, Any]:
    client = await _customer_client()
    if not _customer_cart_id:
        raise HTTPException(status_code=400, detail="no cart yet")
    return await set_payment_method(client, {"cart_id": _customer_cart_id, **req.model_dump()})


@app.post("/checkout/place")
async def checkout_place() -> dict[str, Any]:
    global _customer_cart_id
    client = await _customer_client()
    if not _customer_cart_id:
        raise HTTPException(status_code=400, detail="no cart yet")
    result = await place_order(client, {"cart_id": _customer_cart_id})
    _customer_cart_id = None  # nach Bestellung: neuer leerer Warenkorb beim nächsten Add
    return result
