"""Cart tools. All mutations go through the confirm-gate (see app/agent.py)."""

from __future__ import annotations

from typing import Any

from app.magento import MagentoClient
from app.tools.base import Tool

CART_QUERY = """
query Cart($cart_id: String!) {
  cart(cart_id: $cart_id) {
    id
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
  }
}
"""

# Vollstaendige Cart-Auswahl fuer Mutationen: Badge (total_quantity) und
# Warenkorbansicht (items) bekommen damit immer konsistente Daten aus Magento.
_CART_SELECTION = """
  id
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
"""

ADD_SIMPLE_MUTATION = f"""
mutation AddSimple($cart_id: String!, $sku: String!, $qty: Float!) {{
  addSimpleProductsToCart(
    input: {{ cart_id: $cart_id, cart_items: [{{ data: {{ sku: $sku, quantity: $qty }} }}] }}
  ) {{
    cart {{ {_CART_SELECTION} }}
  }}
}}
"""

ADD_CONFIGURABLE_MUTATION = f"""
mutation AddConfigurable($cart_id: String!, $parent: String!, $variant: String!, $qty: Float!) {{
  addConfigurableProductsToCart(
    input: {{ cart_id: $cart_id, cart_items: [{{
      parent_sku: $parent,
      data: {{ sku: $variant, quantity: $qty }}
    }}] }}
  ) {{
    cart {{ {_CART_SELECTION} }}
  }}
}}
"""

UPDATE_MUTATION = f"""
mutation UpdateItem($cart_id: String!, $item_id: Int!, $qty: Float!) {{
  updateCartItems(
    input: {{ cart_id: $cart_id, cart_items: [{{ cart_item_id: $item_id, quantity: $qty }}] }}
  ) {{
    cart {{ {_CART_SELECTION} }}
  }}
}}
"""

REMOVE_MUTATION = f"""
mutation RemoveItem($cart_id: String!, $item_id: Int!) {{
  removeItemFromCart(input: {{ cart_id: $cart_id, cart_item_id: $item_id }}) {{
    cart {{ {_CART_SELECTION} }}
  }}
}}
"""


def normalize_cart(cart: dict[str, Any] | None) -> dict[str, Any] | None:
    """Warenkorb in immer gleicher, geordneter Weise: Items stabil nach id sortiert."""
    if not cart:
        return cart
    items = sorted(cart.get("items") or [], key=lambda i: (i.get("id") is None, i.get("id") or 0))
    return {**cart, "items": items}


async def cart_get(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    cart_id = args.get("cart_id")
    if not cart_id:
        return {"intent": "cart", "cart": None, "message": "No cart yet.",
                "narration": "Du hast noch keinen Warenkorb – ich kann gerne Produkte hineinlegen."}
    data = await client.execute(CART_QUERY, {"cart_id": cart_id})
    cart = normalize_cart(data["cart"])
    return {"intent": "cart", "cart": cart,
            "narration": f"Dein Warenkorb enthält aktuell {cart.get('total_quantity', 0)} Artikel "
                         f"(Gesamt {cart.get('prices', {}).get('grand_total', {}).get('value', 0)} "
                         f"{cart.get('prices', {}).get('grand_total', {}).get('currency', 'EUR')})."}


async def cart_add(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    cart_id = args.get("cart_id")
    if not cart_id:
        cart_id = await client.create_empty_cart()
    qty = args.get("quantity", 1)
    if args.get("variant_sku"):
        data = await client.execute(ADD_CONFIGURABLE_MUTATION, {
            "cart_id": cart_id,
            "parent": args["sku"],
            "variant": args["variant_sku"],
            "qty": qty,
        })
    else:
        data = await client.execute(ADD_SIMPLE_MUTATION, {
            "cart_id": cart_id,
            "sku": args["sku"],
            "qty": qty,
        })
    cart = data.get("addSimpleProductsToCart") or data.get("addConfigurableProductsToCart")
    return {
        "intent": "cart_updated",
        "cart_id": cart_id,
        "cart": normalize_cart(cart["cart"]),
        "narration": f"„{args['sku']}“ (Menge {qty}) liegt jetzt im Warenkorb – "
                     "alle Summen kommen unverändert aus Magento.",
    }


async def cart_update(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    data = await client.execute(UPDATE_MUTATION, {
        "cart_id": args["cart_id"],
        "item_id": int(args["item_id"]),
        "qty": args.get("quantity", 1),
    })
    return {"intent": "cart_updated", "cart_id": args["cart_id"], "cart": normalize_cart(data["updateCartItems"]["cart"]),
            "narration": f"Menge von Position {args['item_id']} auf {args.get('quantity', 1)} geändert."}


async def cart_remove(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    data = await client.execute(REMOVE_MUTATION, {
        "cart_id": args["cart_id"],
        "item_id": int(args["item_id"]),
    })
    return {"intent": "cart_updated", "cart_id": args["cart_id"], "cart": normalize_cart(data["removeItemFromCart"]["cart"]),
            "narration": f"Position {args['item_id']} wurde aus dem Warenkorb entfernt."}


def register_cart_tools(registry: ToolRegistry) -> None:  # noqa: F821
    registry.register(Tool(
        name="cart_get",
        description="Read the current cart with live totals from Magento.",
        parameters={
            "type": "object",
            "properties": {"cart_id": {"type": "string"}},
        },
        phase="cart",
        handler=cart_get,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="cart_add",
        description=(
            "Add a product to the cart. Requires customer confirmation before the "
            "mutation runs. For configurable products pass variant_sku."
        ),
        parameters={
            "type": "object",
            "properties": {
                "cart_id": {"type": "string"},
                "sku": {"type": "string", "description": "Parent or simple product SKU"},
                "variant_sku": {"type": "string", "description": "Selected variant SKU (configurable products)"},
                "quantity": {"type": "integer", "minimum": 1},
            },
            "required": ["sku"],
        },
        phase="cart",
        requires_confirmation=True,
        handler=cart_add,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="cart_update",
        description="Change the quantity of a cart item. Requires confirmation.",
        parameters={
            "type": "object",
            "properties": {
                "cart_id": {"type": "string"},
                "item_id": {"type": "integer"},
                "quantity": {"type": "integer", "minimum": 0},
            },
            "required": ["cart_id", "item_id", "quantity"],
        },
        phase="cart",
        requires_confirmation=True,
        handler=cart_update,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="cart_remove",
        description="Remove an item from the cart. Requires confirmation.",
        parameters={
            "type": "object",
            "properties": {
                "cart_id": {"type": "string"},
                "item_id": {"type": "integer"},
            },
            "required": ["cart_id", "item_id"],
        },
        phase="cart",
        requires_confirmation=True,
        handler=cart_remove,  # type: ignore[arg-type]
    ))
