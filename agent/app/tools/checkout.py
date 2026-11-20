"""Checkout tools: the full chain from cart to placed order.

Chain (all against the Magento storefront API, customer/guest cart only):
  checkout_overview -> set_shipping_address -> set_shipping_method
  -> set_payment_method -> place_order

Every mutation is registered with requires_confirmation=True and therefore
runs through the confirm-gate (see app/agent.py). Payment credentials never
touch the LLM: only the payment method code (e.g. "checkmo") is passed.
"""

from __future__ import annotations

from typing import Any

from app.magento import MagentoClient
from app.tools.base import Tool, ToolRegistry

CHECKOUT_QUERY = """
query Checkout($cart_id: String!) {
  cart(cart_id: $cart_id) {
    id
    email
    total_quantity
    prices {
      grand_total { value currency }
      subtotal_including_tax { value currency }
    }
    items {
      id
      uid
      product { sku name }
      quantity
      prices { row_total { value currency } price { value currency } }
    }
    shipping_addresses {
      firstname
      lastname
      street
      city
      region { region region_code }
      postcode
      country_code
      telephone
      selected_shipping_method {
        carrier_code
        method_code
        carrier_title
        method_title
        amount { value currency }
      }
      available_shipping_methods {
        available
        carrier_code
        carrier_title
        method_code
        method_title
        amount { value currency }
        error_message
      }
    }
    available_payment_methods { code name }
    selected_payment_method { code name }
  }
}
"""

GUEST_EMAIL_MUTATION = """
mutation SetGuestEmail($cart_id: String!, $email: String!) {
  setGuestEmailOnCart(input: { cart_id: $cart_id, email: $email }) { cart { id email } }
}
"""

SHIPPING_ADDRESS_MUTATION = """
mutation SetShippingAddress($cart_id: String!, $address: AddressInput!) {
  setShippingAddressesOnCart(
    input: { cart_id: $cart_id, shipping_addresses: [{ address: $address }] }
  ) {
    cart { id shipping_addresses { city postcode selected_shipping_method { carrier_code method_code } } }
  }
}
"""

SHIPPING_METHOD_MUTATION = """
mutation SetShippingMethod($cart_id: String!, $carrier_code: String!, $method_code: String!) {
  setShippingMethodsOnCart(
    input: { cart_id: $cart_id, shipping_methods: [{ carrier_code: $carrier_code, method_code: $method_code }] }
  ) {
    cart { id prices { grand_total { value currency } } shipping_addresses { selected_shipping_method { carrier_title method_title amount { value currency } } } }
  }
}
"""

PAYMENT_METHOD_MUTATION = """
mutation SetPaymentMethod($cart_id: String!, $code: String!) {
  setPaymentMethodOnCart(input: { cart_id: $cart_id, payment_method: { code: $code } }) {
    cart { id selected_payment_method { code name } prices { grand_total { value currency } } }
  }
}
"""

PLACE_ORDER_MUTATION = """
mutation PlaceOrder($cart_id: String!) {
  placeOrder(input: { cart_id: $cart_id }) {
    order { id order_number }
  }
}
"""


def _overview(cart: dict[str, Any]) -> dict[str, Any]:
    shipping = (cart.get("shipping_addresses") or [None])[0] or {}
    return {
        "intent": "checkout",
        "cart": {
            "id": cart.get("id"),
            "email": cart.get("email"),
            "total_quantity": cart.get("total_quantity"),
            "items": cart.get("items") or [],
            "prices": cart.get("prices"),
        },
        "shipping_address": {
            k: shipping.get(k)
            for k in ("firstname", "lastname", "street", "city", "postcode", "country_code", "telephone")
        },
        "selected_shipping_method": shipping.get("selected_shipping_method"),
        "available_shipping_methods": shipping.get("available_shipping_methods") or [],
        "available_payment_methods": cart.get("available_payment_methods") or [],
        "selected_payment_method": cart.get("selected_payment_method"),
    }


async def checkout_overview(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    cart_id = args.get("cart_id")
    if not cart_id:
        return {
            "intent": "checkout",
            "cart": None,
            "message": "No cart yet.",
            "narration": "Es gibt noch keinen Warenkorb – ich lege zuerst Produkte hinein.",
        }
    data = await client.execute(CHECKOUT_QUERY, {"cart_id": cart_id})
    result = _overview(data["cart"])
    result["cart_id"] = cart_id
    result["narration"] = (
        "Ich prüfe den aktuellen Stand deines Checkouts: "
        f"{result['cart'].get('total_quantity', 0)} Artikel, "
        "Versand- und Zahlungsarten live aus Magento."
    )
    return result


async def set_checkout_email(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    data = await client.execute(GUEST_EMAIL_MUTATION, {"cart_id": args["cart_id"], "email": args["email"]})
    cart = data["setGuestEmailOnCart"]["cart"]
    return {
        "intent": "checkout",
        "cart_id": args["cart_id"],
        "email": cart.get("email"),
        "narration": f"Ich hinterlege die E-Mail-Adresse {args['email']} für den Gast-Warenkorb.",
    }


async def set_shipping_address(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    address = {
        "firstname": args["firstname"],
        "lastname": args["lastname"],
        "street": args.get("street") or [args.get("street_line1", "")],
        "city": args["city"],
        "postcode": args["postcode"],
        "country_code": args.get("country_code", "DE"),
        "telephone": args.get("telephone", ""),
    }
    if args.get("region"):
        address["region"] = {"region": args["region"]}
    data = await client.execute(SHIPPING_ADDRESS_MUTATION, {"cart_id": args["cart_id"], "address": address})
    cart = data["setShippingAddressesOnCart"]["cart"]
    result = {"intent": "checkout", "cart_id": args["cart_id"], "cart": {"id": cart["id"]}}
    overview = await checkout_overview(client, {"cart_id": args["cart_id"]})
    result.update({k: v for k, v in overview.items() if k not in ("intent", "narration")})
    result["narration"] = (
        f"Ich übernehme die Lieferadresse: {args['firstname']} {args['lastname']}, "
        f"{', '.join(address['street'])}, {args['postcode']} {args['city']}."
    )
    return result


async def set_shipping_method(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    data = await client.execute(SHIPPING_METHOD_MUTATION, {
        "cart_id": args["cart_id"],
        "carrier_code": args["carrier_code"],
        "method_code": args["method_code"],
    })
    cart = data["setShippingMethodsOnCart"]["cart"]
    result = {
        "intent": "checkout",
        "cart_id": args["cart_id"],
        "cart": {"id": cart["id"], "prices": cart.get("prices")},
        "selected_shipping_method": (cart.get("shipping_addresses") or [{}])[0].get("selected_shipping_method"),
    }
    result["narration"] = (
        "Ich setze die Versandart auf "
        f"„{(result['selected_shipping_method'] or {}).get('carrier_title') or args['carrier_code']}“."
    )
    return result


async def set_payment_method(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    data = await client.execute(PAYMENT_METHOD_MUTATION, {"cart_id": args["cart_id"], "code": args["code"]})
    cart = data["setPaymentMethodOnCart"]["cart"]
    return {
        "intent": "checkout",
        "cart_id": args["cart_id"],
        "cart": {"id": cart["id"], "prices": cart.get("prices")},
        "selected_payment_method": cart.get("selected_payment_method"),
        "narration": f"Ich setze die Zahlungsart „{args['code']}“ – Zahlungsdaten erfasst nur das Formular, nie das LLM.",
    }


async def place_order(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    data = await client.execute(PLACE_ORDER_MUTATION, {"cart_id": args["cart_id"]})
    order = data["placeOrder"]["order"]
    return {
        "intent": "order_placed",
        "order": {"id": order.get("id"), "order_number": order.get("order_number")},
        "narration": f"Bestellung aufgegeben! Deine Bestellnummer lautet {order.get('order_number')}.",
    }


_ADDRESS_PROPERTIES = {
    "cart_id": {"type": "string"},
    "firstname": {"type": "string"},
    "lastname": {"type": "string"},
    "street": {"type": "array", "items": {"type": "string"}},
    "city": {"type": "string"},
    "postcode": {"type": "string"},
    "country_code": {"type": "string", "default": "DE"},
    "region": {"type": "string"},
    "telephone": {"type": "string"},
}


def register_checkout_tools(registry: ToolRegistry) -> None:
    registry.register(Tool(
        name="checkout_overview",
        description=(
            "Read the checkout state of the cart: items, totals, shipping address, "
            "available/selected shipping methods and payment methods (live from Magento)."
        ),
        parameters={"type": "object", "properties": {"cart_id": {"type": "string"}}},
        phase="checkout",
        handler=checkout_overview,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="set_checkout_email",
        description="Set the guest email on a guest cart (setGuestEmailOnCart). Requires confirmation.",
        parameters={
            "type": "object",
            "properties": {"cart_id": {"type": "string"}, "email": {"type": "string", "format": "email"}},
            "required": ["cart_id", "email"],
        },
        phase="checkout",
        requires_confirmation=True,
        handler=set_checkout_email,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="set_shipping_address",
        description=(
            "Set the shipping address on the cart (setShippingAddressesOnCart). "
            "Requires confirmation. Never invent address data – only use what the customer stated."
        ),
        parameters={
            "type": "object",
            "properties": _ADDRESS_PROPERTIES,
            "required": ["cart_id", "firstname", "lastname", "city", "postcode"],
        },
        phase="checkout",
        requires_confirmation=True,
        handler=set_shipping_address,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="set_shipping_method",
        description="Choose a shipping method from the cart's available_shipping_methods. Requires confirmation.",
        parameters={
            "type": "object",
            "properties": {
                "cart_id": {"type": "string"},
                "carrier_code": {"type": "string"},
                "method_code": {"type": "string"},
            },
            "required": ["cart_id", "carrier_code", "method_code"],
        },
        phase="checkout",
        requires_confirmation=True,
        handler=set_shipping_method,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="set_payment_method",
        description=(
            "Choose a payment method from available_payment_methods (e.g. code \"checkmo\"). "
            "Only the method code is passed – payment credentials never go through the LLM. "
            "Requires confirmation."
        ),
        parameters={
            "type": "object",
            "properties": {"cart_id": {"type": "string"}, "code": {"type": "string"}},
            "required": ["cart_id", "code"],
        },
        phase="checkout",
        requires_confirmation=True,
        handler=set_payment_method,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="place_order",
        description=(
            "Place the order for the cart (placeOrder) and return the order number. "
            "Requires explicit customer confirmation."
        ),
        parameters={
            "type": "object",
            "properties": {"cart_id": {"type": "string"}},
            "required": ["cart_id"],
        },
        phase="checkout",
        requires_confirmation=True,
        handler=place_order,  # type: ignore[arg-type]
    ))
