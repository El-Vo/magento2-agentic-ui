"""FastAPI app: /chat, /cart, /confirm, /health, /tools."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.agent import AgentService
from app.config import settings
from app.customer import ensure_customer, get_cached_token
from app.magento import MagentoClient
from app.session import session_store
from app.tools import build_registry
from app.tools.cart import cart_add, CART_QUERY, CART_QUERY

app = FastAPI(title="Magento Agentic UI Agent", version="0.1.0")
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


@app.post("/confirm")
async def confirm(req: ConfirmRequest) -> dict[str, Any]:
    session = session_store.get(req.session_id)
    if session.id != req.session_id:
        raise HTTPException(status_code=404, detail="unknown session")
    result = await agent.execute_confirmed(session, req.tool, req.args)
    session_store.save(session)
    return {"session_id": session.id, **result}


async def _customer_client() -> MagentoClient:
    """Client im Namen des dauerhaften Kunden (Token lazy holen)."""
    if not get_cached_token():
        await ensure_customer()
    return MagentoClient(token=get_cached_token())


@app.post("/cart/add")
async def cart_add_item(req: CartAddRequest) -> dict[str, Any]:
    """Widget: direktes Hinzufuegen ohne Confirm-Gate (explizite UI-Aktion)."""
    global _customer_cart_id
    client = await _customer_client()
    cart_id = _customer_cart_id or await client.create_empty_cart()
    result = await cart_add(client, {
        "cart_id": cart_id,
        "sku": req.sku,
        "quantity": req.quantity,
    })
    _customer_cart_id = cart_id
    return {"cart": result.get("cart")}


@app.get("/cart")
async def read_cart() -> dict[str, Any]:
    """Warenkorb-Inhalt des dauerhaften Kunden."""
    global _customer_cart_id
    client = await _customer_client()
    if not _customer_cart_id:
        return {"cart": None}
    data = await client.execute(CART_QUERY, {"cart_id": _customer_cart_id})
    return {"cart": data["cart"]}


@app.get("/cart")
async def get_cart() -> dict[str, Any]:
    return await read_cart()