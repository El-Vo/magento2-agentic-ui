"""Tool registry: JSON-schema definitions handed to the LLM (phase-scoped)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from pydantic import BaseModel


class ToolContext(BaseModel):
    session: Any = None


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    phase: str = "browse"
    requires_confirmation: bool = False
    # Handler receives (client, args, session) instead of (client, args)
    uses_session: bool = False
    handler: Callable[..., Awaitable[dict[str, Any]]] | None = None
    _schema: dict[str, Any] = field(default_factory=dict, init=False, repr=False)

    def to_llm_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def for_phase(self, phase: str) -> list[Tool]:
        return [t for t in self._tools.values() if t.phase in (phase, "*")]

    def llm_schemas(self, phase: str) -> list[dict[str, Any]]:
        return [t.to_llm_schema() for t in self.for_phase(phase)]

    def manifest(self) -> list[dict[str, Any]]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "phase": t.phase,
                "requires_confirmation": t.requires_confirmation,
            }
            for t in self._tools.values()
        ]
