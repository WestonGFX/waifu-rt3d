"""Web search tool for agentic characters.

Uses DuckDuckGo's HTML endpoint to perform web searches without
requiring an API key.  Results are parsed from the HTML response
with a lightweight regex.
"""

from __future__ import annotations

import re
from html import unescape
from urllib.parse import unquote

import httpx

from backend.agent.registry import ToolContext, ToolDef, ToolResult

_DDG_URL = "https://html.duckduckgo.com/html/"

# Matches DuckDuckGo HTML result blocks: link + snippet
_RESULT_RE = re.compile(
    r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
    r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
    re.DOTALL,
)


def _strip_tags(html: str) -> str:
    """Remove HTML tags and decode entities from a string.

    Args:
        html: Raw HTML fragment.

    Returns:
        Plain text with tags stripped and entities decoded.

    Example:
        >>> _strip_tags("<b>Hello</b> &amp; world")
        'Hello & world'
    """
    return unescape(re.sub(r"<[^>]+>", "", html)).strip()


def _extract_real_url(ddg_url: str) -> str:
    """Extract the real destination URL from a DuckDuckGo redirect link.

    DDG wraps result links through ``//duckduckgo.com/l/?uddg=ENCODED_URL``.
    This function extracts and decodes the original URL.

    Args:
        ddg_url: The href value from a DDG result anchor tag.

    Returns:
        The decoded destination URL, or the original if no redirect
        wrapper is detected.

    Example:
        >>> _extract_real_url("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com")
        'https://example.com'
    """
    if "uddg=" in ddg_url:
        # Extract everything after uddg= and before next & (if any)
        match = re.search(r"uddg=([^&]+)", ddg_url)
        if match:
            return unquote(match.group(1))
    return ddg_url


async def _execute(args: dict, context: ToolContext) -> ToolResult:
    """Execute the web_search tool.

    Sends a POST request to DuckDuckGo's HTML search endpoint, parses
    result titles, snippets, and URLs, and returns up to *max_results*
    items.

    Args:
        args: Tool arguments.  Expects ``"query"`` (str, required) and
            optionally ``"max_results"`` (int, default 3, capped at 5).
        context: Execution context (unused by this tool).

    Returns:
        A :class:`ToolResult` with ``display="list"`` containing a list
        of result dicts, each with ``title``, ``snippet``, and ``url``
        keys.  Returns an error result on network failure.

    Example:
        >>> import asyncio
        >>> ctx = ToolContext(cfg={}, char_id=1, session_id=1)
        >>> # Real execution requires network; see tests for mocked usage.
    """
    query = args.get("query", "")
    if not query:
        return ToolResult(ok=False, error="No search query provided")

    max_results = min(args.get("max_results", 3), 5)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _DDG_URL,
                data={"q": query, "b": ""},
                headers={"User-Agent": "Mozilla/5.0 (compatible; WaifuBot/1.0)"},
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        return ToolResult(ok=False, error=f"Search request failed: {exc}")

    matches = _RESULT_RE.findall(resp.text)
    results = []
    for href, title_html, snippet_html in matches[:max_results]:
        results.append({
            "title": _strip_tags(title_html),
            "snippet": _strip_tags(snippet_html),
            "url": _extract_real_url(href),
        })

    return ToolResult(ok=True, data={"results": results}, display="list")


web_search_tool = ToolDef(
    name="web_search",
    description=(
        "Search the web using DuckDuckGo. Returns titles, snippets, "
        "and URLs for the top results."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query string.",
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of results to return (1-5).",
                "default": 3,
                "minimum": 1,
                "maximum": 5,
            },
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    execute=_execute,
)
