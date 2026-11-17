"""FastAPI app: /chat, /confirm, /health, /tools."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.agent import AgentService
from app.config import settings
from app.session import session_store
from app.tools import build_registry

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
