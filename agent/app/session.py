"""Session and memory: guest cart id, last search results with stable positions.

References like "das zweite" are resolved against the last result list, never
against free-text search. Chat history is kept per session in memory only.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from pydantic import BaseModel, Field


class Session(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    created_at: float = Field(default_factory=time.time)
    cart_id: str | None = None
    phase: str = "browse"
    last_results: list[dict[str, Any]] = Field(default_factory=list)
    history: list[dict[str, str]] = Field(default_factory=list)

    def resolve_position(self, position: int) -> dict[str, Any] | None:
        if 1 <= position <= len(self.last_results):
            return self.last_results[position - 1]
        return None


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def get(self, session_id: str | None) -> Session:
        if session_id and session_id in self._sessions:
            return self._sessions[session_id]
        session = Session()
        self._sessions[session.id] = session
        return session

    def save(self, session: Session) -> None:
        self._sessions[session.id] = session


session_store = SessionStore()
