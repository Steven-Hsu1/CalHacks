"""
AI Navigator - Uses AI vision to determine how to navigate social media feeds
"""

import logging
import os
from typing import Dict, Optional
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class AINavigator:
    """
    Uses AI to analyze page context and determine navigation actions
    """

    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")

        # Suppress OpenAI library logging to avoid verbose output
        import logging as openai_logging
        openai_logging.getLogger("openai").setLevel(openai_logging.WARNING)
        openai_logging.getLogger("httpx").setLevel(openai_logging.WARNING)

        self.client = AsyncOpenAI(api_key=api_key)
        self.model = "gpt-4o"
        logger.info("AI Navigator initialized with GPT-4o")

    async def determine_next_action(
        self,
        url: str,
        page_html: str,
        context: str = "video ended"
    ) -> Dict:
        """
        Use AI to determine how to navigate to the next content

        Args:
            url: Current page URL
            page_html: HTML content of the page (truncated if too long)
            context: Why we need to navigate (e.g., "video ended", "content skipped")

        Returns:
            Dict with action details: {
                "action": "scroll" | "click" | "swipe",
                "direction": "down" | "up" | "left" | "right",
                "selector": CSS selector if clicking,
                "reasoning": Why this action was chosen
            }
        """
        try:
            # Truncate HTML if too long (keep first 8000 chars)
            truncated_html = page_html[:8000] if len(page_html) > 8000 else page_html

            # Determine platform from URL
            platform = self._detect_platform(url)

            prompt = f"""You are analyzing a {platform} page to determine how to navigate to the next video/post.

Context: {context}
URL: {url}

Here is a snippet of the page HTML:
```html
{truncated_html}
```

Based on the HTML structure and the platform ({platform}), determine the best action to navigate to the next video/post.

For TikTok:
- Usually needs keyboard arrow down or scroll down
- Look for swipe containers or next video buttons

For YouTube Shorts:
- Arrow down key or scroll down
- Look for navigation buttons

For Instagram Reels:
- Scroll down
- Look for next/previous buttons

Respond in JSON format:
{{
    "action": "scroll" | "click" | "key",
    "target": "down" | "up" | "ArrowDown" | "ArrowUp" | CSS selector for click,
    "reasoning": "brief explanation of why this action"
}}

IMPORTANT: Respond ONLY with the JSON, no markdown or explanation.
"""

            logger.info(f"🤔 Asking AI how to navigate on {platform}...")

            response = await self.client.chat.completions.create(
                model=self.model,
                max_tokens=200,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format={"type": "json_object"}
            )

            import json
            result_text = response.choices[0].message.content.strip()

            # Remove markdown if present
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
                result_text = result_text.strip()

            result = json.loads(result_text)

            logger.info(f"✅ AI recommends: {result['action']} {result.get('target', '')}")
            logger.info(f"   Reasoning: {result.get('reasoning', 'N/A')}")

            return {
                "action": result.get("action", "scroll"),
                "target": result.get("target", "down"),
                "reasoning": result.get("reasoning", ""),
                "platform": platform
            }

        except Exception as e:
            logger.error(f"Error in AI navigation: {type(e).__name__}: {str(e)}")

            # Fallback based on platform
            platform = self._detect_platform(url)
            if "tiktok" in platform.lower():
                return {
                    "action": "key",
                    "target": "ArrowDown",
                    "reasoning": "Fallback: TikTok uses arrow keys",
                    "platform": platform
                }
            else:
                return {
                    "action": "scroll",
                    "target": "down",
                    "reasoning": "Fallback: Generic scroll",
                    "platform": platform
                }

    def _detect_platform(self, url: str) -> str:
        """Detect social media platform from URL"""
        url_lower = url.lower()

        if "tiktok.com" in url_lower:
            return "TikTok"
        elif "youtube.com/shorts" in url_lower or "youtu.be" in url_lower:
            return "YouTube Shorts"
        elif "instagram.com/reels" in url_lower or "instagram.com/reel" in url_lower:
            return "Instagram Reels"
        elif "facebook.com" in url_lower or "fb.com" in url_lower:
            return "Facebook"
        elif "twitter.com" in url_lower or "x.com" in url_lower:
            return "Twitter/X"
        elif "reddit.com" in url_lower:
            return "Reddit"
        else:
            return "Unknown Social Platform"
