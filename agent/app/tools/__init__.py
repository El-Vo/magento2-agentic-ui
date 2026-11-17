from app.tools.base import Tool, ToolRegistry
from app.tools.catalog import register_catalog_tools
from app.tools.cart import register_cart_tools
from app.tools.checkout import register_checkout_tools
from app.tools.cms import register_cms_tools
from app.tools.showcase import register_showcase_tools


def build_registry() -> ToolRegistry:
    registry = ToolRegistry()
    register_catalog_tools(registry)
    register_cart_tools(registry)
    register_checkout_tools(registry)
    register_cms_tools(registry)
    register_showcase_tools(registry)
    return registry


__all__ = ["Tool", "ToolRegistry", "build_registry"]
