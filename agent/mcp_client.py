"""
MCP Client - Interfaces with Bright Data Web MCP Server
Provides webpage context and DOM element location
"""

import logging
import os
import aiohttp
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)


class MCPClient:
    """
    Client for Bright Data Web MCP Server
    Provides webpage context and DOM element location
    """

    def __init__(self):
        self.mcp_endpoint = os.getenv("BRIGHTDATA_MCP_ENDPOINT")
        self.api_key = os.getenv("BRIGHTDATA_API_KEY")
        self._request_id = 0
        self._session = None

        # Check if MCP is configured
        if not self.mcp_endpoint or not self.api_key:
            logger.warning("Bright Data MCP not configured. Using fallback mode.")
            self.enabled = False
        else:
            logger.info(f"Bright Data MCP client initialized: {self.mcp_endpoint}")
            self.enabled = True

    async def get_page_links(self, url: str) -> List[Dict]:
        """
        Get all links on the current page

        Args:
            url: The URL of the page to analyze

        Returns:
            List of links with text and selectors
        """
        if not self.enabled:
            logger.debug("MCP not enabled")
            return []

        try:
            result = await self._call_mcp("scraping_browser_links", {"url": url})

            if "error" in result:
                return []

            # Parse links from result
            links = result.get("content", [])
            logger.info(f"Found {len(links)} links on page")
            return links

        except Exception as e:
            logger.error(f"Error getting page links from MCP: {e}")
            return []

    async def get_page_html(self, url: str) -> str:
        """
        Get HTML content of the page

        Args:
            url: The URL of the page

        Returns:
            HTML string
        """
        if not self.enabled:
            return ""

        try:
            result = await self._call_mcp("scrape_as_html", {"url": url})

            if "error" in result:
                return ""

            return result.get("content", "")

        except Exception as e:
            logger.error(f"Error getting HTML from MCP: {e}")
            return ""

    async def find_not_interested_button(
        self,
        url: str
    ) -> Optional[Dict]:
        """
        Find "Not interested" button or similar interaction element

        Args:
            url: Current page URL

        Returns:
            Dict with element info, or None if not found
        """
        if not self.enabled:
            # Fallback: return a generic selector that the content script can handle
            logger.debug("MCP not enabled, returning fallback")
            return {
                "selector": None,  # Let content script handle finding
                "text": "Not interested",
                "found": True,
                "method": "fallback"
            }

        try:
            # Get all links/elements on the page
            links = await self.get_page_links(url)

            # Search for "Not interested" or similar text
            target_phrases = [
                "not interested",
                "don't recommend",
                "hide",
                "not interested in this",
                "dont recommend"
            ]

            for link in links:
                link_text = link.get("text", "").lower()

                for phrase in target_phrases:
                    if phrase in link_text:
                        logger.info(f"Found target button: '{link.get('text')}' with selector '{link.get('selector')}'")
                        return {
                            "selector": link.get("selector"),
                            "text": link.get("text"),
                            "url": url,
                            "found": True,
                            "method": "mcp"
                        }

            logger.warning("Could not find 'Not interested' button via MCP")
            return {
                "found": False,
                "method": "mcp"
            }

        except Exception as e:
            logger.error(f"Error finding button via MCP: {e}")
            # Fallback to content script
            return {
                "selector": None,
                "found": True,
                "method": "fallback"
            }

    async def click_element(self, url: str, selector: str) -> bool:
        """
        Click an element on the page via MCP

        Args:
            url: Page URL
            selector: CSS selector for element to click

        Returns:
            True if successful
        """
        if not self.enabled:
            logger.warning("MCP not enabled, cannot click")
            return False

        try:
            result = await self._call_mcp("scraping_browser_click", {
                "url": url,
                "selector": selector
            })

            if "error" in result:
                logger.error(f"MCP click failed: {result['error']}")
                return False

            logger.info(f"Successfully clicked element: {selector}")
            return True

        except Exception as e:
            logger.error(f"Error clicking element via MCP: {e}")
            return False

    async def query_elements(
        self,
        selectors: List[str],
        dom_context: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Query for specific elements in the DOM

        Args:
            selectors: List of CSS selectors to query
            dom_context: Optional DOM context (will fetch if not provided)

        Returns:
            List of found elements with their properties
        """
        if not self.enabled:
            logger.debug("MCP not enabled, cannot query elements")
            return []

        try:
            if not dom_context:
                dom_context = await self.get_page_context()

            request = {
                "method": "web.queryElements",
                "params": {
                    "queries": selectors,
                    "context": dom_context,
                    "includeHidden": False
                }
            }

            # result = await self._call_mcp(request)
            # return result.get("elements", [])

            # Placeholder
            return []

        except Exception as e:
            logger.error(f"Error querying elements: {e}")
            return []

    async def get_element_properties(
        self,
        selector: str
    ) -> Optional[Dict]:
        """
        Get detailed properties of a specific element

        Args:
            selector: CSS selector for the element

        Returns:
            Dict with element properties (bounds, text, attributes, etc.)
        """
        if not self.enabled:
            return None

        try:
            request = {
                "method": "web.getElementProperties",
                "params": {
                    "selector": selector,
                    "properties": [
                        "boundingBox",
                        "textContent",
                        "attributes",
                        "computedStyle",
                        "isVisible"
                    ]
                }
            }

            # result = await self._call_mcp(request)
            # return result.get("properties")

            # Placeholder
            return None

        except Exception as e:
            logger.error(f"Error getting element properties: {e}")
            return None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def _call_mcp(self, tool_name: str, params: Optional[Dict] = None) -> Dict:
        """
        Make a JSON-RPC request to MCP server via HTTP

        Args:
            tool_name: Name of the MCP tool to call
            params: Tool parameters

        Returns:
            Tool response
        """
        if not self.enabled:
            logger.warning("MCP not enabled, cannot make call")
            return {"error": "MCP not configured"}

        self._request_id += 1

        # Build JSON-RPC 2.0 request
        json_rpc_request = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": params or {}
            }
        }

        try:
            session = await self._get_session()

            logger.info(f"🌐 MCP Call: {tool_name} (timeout: 10s)")
            logger.debug(f"MCP Endpoint: {self.mcp_endpoint}")

            # Use configurable timeout (default 10 seconds)
            timeout = aiohttp.ClientTimeout(total=10)

            async with session.post(
                self.mcp_endpoint,
                json=json_rpc_request,
                headers={"Content-Type": "application/json"},
                timeout=timeout
            ) as response:
                response.raise_for_status()
                result = await response.json()

                if "error" in result:
                    logger.error(f"❌ MCP error: {result['error']}")
                    return {"error": result["error"]}

                logger.info(f"✅ MCP call succeeded: {tool_name}")
                return result.get("result", {})

        except asyncio.TimeoutError:
            logger.error(f"⏱️  MCP call timed out after 10s: {tool_name}")
            return {"error": "MCP request timeout"}
        except Exception as e:
            logger.error(f"❌ MCP call failed: {tool_name} - {e}")
            return {"error": str(e)}

    async def close(self):
        """Close the HTTP session"""
        if self._session and not self._session.closed:
            await self._session.close()

    def is_enabled(self) -> bool:
        """Check if MCP client is properly configured and enabled"""
        return self.enabled
