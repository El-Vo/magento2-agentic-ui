"""Thin GraphQL client for the Magento 2 storefront API.

All product data (prices, stock, totals) is read deterministically from
Magento through this gateway. The LLM never sees raw SQL or free-form
database access.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings


class MagentoGraphQLError(RuntimeError):
    pass


class MagentoClient:
    def __init__(self, base_url: str | None = None, token: str | None = None) -> None:
        if token is None:
            # Dauerhaft angemeldeter Demo-Customer: alle Calls laufen mit dessen Token.
            from app.customer import get_cached_token
            token = get_cached_token()
        self.base_url = (base_url or settings.magento_graphql_url).rstrip("/")
        self.token = token

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Store": settings.magento_store_code}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def execute(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(self.base_url, json=payload, headers=self._headers())
        resp.raise_for_status()
        data = resp.json()
        if data.get("errors"):
            raise MagentoGraphQLError(str(data["errors"]))
        return data["data"]

    async def create_empty_cart(self) -> str:
        data = await self.execute("mutation { createEmptyCart }")
        return data["createEmptyCart"]
