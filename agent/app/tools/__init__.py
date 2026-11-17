from app.tools.base import Tool, ToolRegistry
from app.tools.catalog import register_catalog_tools
from app.tools.cart import register_cart_tools
from app.tools.cms import register_cms_tools


def build_registry() -> ToolRegistry:
    registry = ToolRegistry()
    register_catalog_tools(registry)
    register_cart_tools(registry)
    register_cms_tools(registry)
    return registry


__all__ = ["Tool", "ToolRegistry", "build_registry"]
