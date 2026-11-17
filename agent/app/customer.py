"""Dauerhaft angemeldeter Demo-Customer.

Legt beim ersten Bedarf ein Kundekonto an (GraphQL createCustomerV2), holt
ein Customer-Token und cacht es prozessweit. Der Agent fuehrt alle
Warenkorb-Mutationen damit im Namen dieses Kunden aus.
"""

from __future__ import annotations

import httpx

from app.config import settings

_token: str | None = None

_LOGIN_MUTATION = """
mutation($email: String!, $password: String!) {
  generateCustomerToken(email: $email, password: $password) { token }
}
"""

_CREATE_MUTATION = """
mutation($input: CustomerCreateInput!) {
  createCustomerV2(input: $input) { customer { email } }
}
"""


async def _fetch_token() -> str:
    payload = {
        "query": _LOGIN_MUTATION,
        "variables": {
            "email": settings.persistent_customer_email,
            "password": settings.persistent_customer_password,
        },
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(settings.magento_graphql_url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        errors = data.get("errors")
        if errors:
            raise RuntimeError(str(errors))
        token = data["data"]["generateCustomerToken"]["token"]
    return token


async def _create_account() -> bool:
    """Konto via createCustomerV2 anlegen; False bei 'existiert bereits' o.ae."""
    payload = {
        "query": _CREATE_MUTATION,
        "variables": {
            "input": {
                "firstname": "Demo",
                "lastname": "Kunde",
                "email": settings.persistent_customer_email,
                "password": settings.persistent_customer_password,
            }
        },
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(settings.magento_graphql_url, json=payload)
        resp.raise_for_status()
        return not resp.json().get("errors")


async def ensure_customer() -> None:
    """Konto anlegen (falls noetig) und Token cachen."""
    global _token
    if _token:
        return
    try:
        _token = await _fetch_token()
        return
    except Exception:
        pass
    await _create_account()
    _token = await _fetch_token()


def get_cached_token() -> str | None:
    return _token
