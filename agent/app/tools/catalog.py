"""Catalog tools: search_products, product_details, categories.

Every tool is a small GraphQL consumer that queries exactly the fields the
UI components need. Prices and stock come from Magento, never from the LLM.
"""

from __future__ import annotations

from typing import Any

from app.magento import MagentoClient
from app.tools.base import Tool

PRODUCT_FIELDS = """
  items {
    id
    uid
    sku
    name
    url_key
    stock_status
    media_gallery { url label position }
    price_range {
      minimum_price { final_price { value currency } regular_price { value currency } }
    }
  }
  total_count
"""

SEARCH_QUERY = f"""
query SearchProducts($search: String, $filter: ProductAttributeFilterInput, $pageSize: Int = 6) {{
  products(search: $search, filter: $filter, pageSize: $pageSize) {{
    {PRODUCT_FIELDS}
    aggregations {{
      attribute_code
      label
      options {{ label value count }}
    }}
  }}
}}
"""

DETAIL_QUERY = """
query ProductDetail($filter: ProductAttributeFilterInput) {
  products(filter: $filter) {
    items {
      uid
      sku
      name
      description { html }
      stock_status
      media_gallery { url label position }
      price_range {
        minimum_price { final_price { value currency } regular_price { value currency } }
      }
      ... on ConfigurableProduct {
        variants {
          product { sku uid stock_status }
          attributes { label value_code }
        }
      }
    }
  }
}
"""

CATEGORIES_QUERY = """
query Categories {
  categories {
    items {
      uid
      name
      url_path
      children { uid name url_path }
    }
  }
}
"""


def _price(product: dict[str, Any]) -> dict[str, Any] | None:
    try:
        return product["price_range"]["minimum_price"]["final_price"]
    except (KeyError, TypeError):
        return None


def _image(product: dict[str, Any]) -> str | None:
    media = product.get("media_gallery") or []
    for entry in sorted(media, key=lambda m: m.get("position") or 0):
        if entry.get("url"):
            return entry["url"]
    return media[0].get("url") if media else None


def _to_card(product: dict[str, Any], position: int) -> dict[str, Any]:
    return {
        "position": position,
        "uid": product.get("uid"),
        "sku": product.get("sku"),
        "name": product.get("name"),
        "price": _price(product),
        "stock_status": product.get("stock_status"),
        "url_key": product.get("url_key"),
        "image": _image(product),
    }


async def search_products(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    variables: dict[str, Any] = {"pageSize": args.get("page_size", 6)}
    if args.get("search"):
        variables["search"] = args["search"]
    if args.get("filter"):
        variables["filter"] = args["filter"]
    data = await client.execute(SEARCH_QUERY, variables)
    products = data["products"]["items"] or []
    cards = [_to_card(p, i + 1) for i, p in enumerate(products)]
    search = args.get("search") or "alle Produkte"
    return {
        "intent": "product_list",
        "results": cards,
        "total_count": data["products"]["total_count"],
        "aggregations": data["products"].get("aggregations") or [],
        "narration": f"Ich habe im Katalog nach „{search}“ gesucht – {data['products']['total_count']} Treffer.",
    }


async def product_details(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    if args.get("sku"):
        variables = {"filter": {"sku": {"eq": args["sku"]}}}
    elif args.get("url_key"):
        variables = {"filter": {"url_key": {"eq": args["url_key"]}}}
    else:
        return {"intent": "error", "message": "sku or url_key required"}
    data = await client.execute(DETAIL_QUERY, variables)
    items = data["products"]["items"] or []
    if not items:
        return {"intent": "error", "message": "product not found"}
    product = items[0]
    return {
        "intent": "product_details",
        "narration": f"Ich lade die Details zu „{product.get('name')}“ (Preis, Lager, Medien – live aus Magento).",
        "product": {
            "sku": product.get("sku"),
            "uid": product.get("uid"),
            "name": product.get("name"),
            "price": _price(product),
            "stock_status": product.get("stock_status"),
            "description": product.get("description", {}).get("html"),
            "media": product.get("media_gallery") or [],
            "variants": product.get("variants") or [],
        },
    }


async def categories(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    data = await client.execute(CATEGORIES_QUERY)
    return {
        "intent": "category_list",
        "categories": data["categories"]["items"],
        "narration": "Ich lade die Kategorien des Shops für die Navigation.",
    }


def register_catalog_tools(registry: ToolRegistry) -> None:  # noqa: F821
    registry.register(Tool(
        name="search_products",
        description=(
            "Search the Magento catalog. Translate natural language into keyword search "
            "plus structured filters (e.g. price, category, brand). Returns product cards "
            "and facet aggregations for filter suggestions."
        ),
        parameters={
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Free-text keyword search"},
                "filter": {
                    "type": "object",
                    "description": "Magento ProductAttributeFilterInput, e.g. {\"price\": {\"lt\": \"150\"}}",
                },
                "page_size": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
        phase="browse",
        handler=search_products,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="product_details",
        description="Fetch full details (price, stock, media, variants, description) for one product by SKU or url_key.",
        parameters={
            "type": "object",
            "properties": {
                "sku": {"type": "string"},
                "url_key": {"type": "string"},
            },
        },
        phase="browse",
        handler=product_details,  # type: ignore[arg-type]
    ))
    registry.register(Tool(
        name="categories",
        description="List store categories for navigation context.",
        parameters={"type": "object", "properties": {}},
        phase="browse",
        handler=categories,  # type: ignore[arg-type]
    ))
