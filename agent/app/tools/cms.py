"""CMS tool: read-only access to CMS pages (RAG corpus for policy questions)."""

from __future__ import annotations

from typing import Any

from app.magento import MagentoClient
from app.tools.base import Tool

CMS_QUERY = """
query CmsPage($id: Int!) {
  cmsPage(id: $id) {
    url_key
    title
    content
    content_heading
  }
}
"""


async def cms_page(client: MagentoClient, args: dict[str, Any]) -> dict[str, Any]:
    data = await client.execute(CMS_QUERY, {"id": int(args["page_id"])})
    page = data["cmsPage"]
    return {
        "intent": "policy_answer",
        "title": page["title"],
        "url_key": page["url_key"],
        "excerpt": (page.get("content") or "")[:1500],
    }


def register_cms_tools(registry: ToolRegistry) -> None:  # noqa: F821
    registry.register(Tool(
        name="cms_page",
        description="Fetch a CMS page (shipping, returns, privacy) by numeric page id to answer policy questions with a source link.",
        parameters={
            "type": "object",
            "properties": {"page_id": {"type": "integer"}},
            "required": ["page_id"],
        },
        phase="support",
        handler=cms_page,  # type: ignore[arg-type]
    ))
