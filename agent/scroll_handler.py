"""
Scroll Handler - Platform-specific scroll logic for social media platforms
"""

import logging
from typing import Dict, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class ScrollType(Enum):
    """Types of scroll actions"""
    SCROLL_DOWN = "scroll_down"
    SWIPE_UP = "swipe_up"
    ARROW_DOWN = "arrow_down"
    PAGE_DOWN = "page_down"


class Platform(Enum):
    """Supported platforms"""
    TIKTOK = "tiktok"
    INSTAGRAM = "instagram"
    YOUTUBE_SHORTS = "youtube_shorts"
    YOUTUBE = "youtube"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    REDDIT = "reddit"
    UNKNOWN = "unknown"


class ScrollHandler:
    """Handles platform-specific scrolling logic"""

    def __init__(self):
        # Platform detection patterns
        self.platform_patterns = {
            "tiktok.com": Platform.TIKTOK,
            "instagram.com": Platform.INSTAGRAM,
            "youtube.com/shorts": Platform.YOUTUBE_SHORTS,
            "youtube.com": Platform.YOUTUBE,
            "facebook.com": Platform.FACEBOOK,
            "twitter.com": Platform.TWITTER,
            "x.com": Platform.TWITTER,
            "reddit.com": Platform.REDDIT,
        }

        # Platform-specific scroll configurations
        self.scroll_configs = {
            Platform.TIKTOK: {
                "type": ScrollType.SWIPE_UP,
                "selector": "video",
                "scroll_amount": "full",
                "description": "Swipe up to next TikTok video"
            },
            Platform.INSTAGRAM: {
                "type": ScrollType.SWIPE_UP,
                "selector": "video",
                "scroll_amount": "full",
                "description": "Swipe up to next Instagram Reel"
            },
            Platform.YOUTUBE_SHORTS: {
                "type": ScrollType.ARROW_DOWN,
                "selector": "ytd-reel-video-renderer",
                "scroll_amount": "full",
                "description": "Arrow down to next YouTube Short"
            },
            Platform.YOUTUBE: {
                "type": ScrollType.SCROLL_DOWN,
                "selector": "ytd-rich-item-renderer",
                "scroll_amount": 400,
                "description": "Scroll to next YouTube video"
            },
            Platform.FACEBOOK: {
                "type": ScrollType.SCROLL_DOWN,
                "selector": "div[role='article']",
                "scroll_amount": 500,
                "description": "Scroll to next Facebook post"
            },
            Platform.TWITTER: {
                "type": ScrollType.SCROLL_DOWN,
                "selector": "article[data-testid='tweet']",
                "scroll_amount": 400,
                "description": "Scroll to next tweet"
            },
            Platform.REDDIT: {
                "type": ScrollType.SCROLL_DOWN,
                "selector": "div[data-testid='post-container']",
                "scroll_amount": 500,
                "description": "Scroll to next Reddit post"
            },
            Platform.UNKNOWN: {
                "type": ScrollType.SCROLL_DOWN,
                "selector": None,
                "scroll_amount": 500,
                "description": "Generic scroll down"
            }
        }

    def detect_platform(self, url: str) -> Platform:
        """
        Detect platform from URL

        Args:
            url: Page URL

        Returns:
            Platform enum
        """
        url_lower = url.lower()

        for pattern, platform in self.platform_patterns.items():
            if pattern in url_lower:
                logger.info(f"Detected platform: {platform.value}")
                return platform

        logger.warning(f"Unknown platform for URL: {url}")
        return Platform.UNKNOWN

    def get_scroll_command(self, url: str) -> Dict:
        """
        Get platform-specific scroll command

        Args:
            url: Current page URL

        Returns:
            Dict with scroll command details
        """
        platform = self.detect_platform(url)
        config = self.scroll_configs.get(platform, self.scroll_configs[Platform.UNKNOWN])

        command = {
            "type": config["type"].value,
            "selector": config["selector"],
            "scroll_amount": config["scroll_amount"],
            "platform": platform.value,
            "description": config["description"]
        }

        logger.info(f"Generated scroll command for {platform.value}: {command['type']}")
        return command

    def should_scroll(self, video_ended: bool, time_since_last_scroll: float) -> bool:
        """
        Determine if we should trigger a scroll

        Args:
            video_ended: Whether video has ended
            time_since_last_scroll: Seconds since last scroll

        Returns:
            True if should scroll
        """
        # Scroll if video ended
        if video_ended:
            logger.info("Video ended - triggering scroll")
            return True

        # Also scroll if too much time has passed (failsafe)
        # This prevents getting stuck on one video
        max_wait_time = 90  # seconds
        if time_since_last_scroll > max_wait_time:
            logger.warning(f"Max wait time ({max_wait_time}s) exceeded - forcing scroll")
            return True

        return False

    def get_platform_specific_selectors(self, platform: Platform) -> Dict[str, str]:
        """
        Get platform-specific CSS selectors for key elements

        Args:
            platform: Platform enum

        Returns:
            Dict of selector names to CSS selectors
        """
        selectors = {
            Platform.TIKTOK: {
                "video_container": "div[class*='DivVideoContainer']",
                "video": "video",
                "next_button": "button[aria-label='Go to next video']",
                "menu_button": "button[class*='StyledThreeDotButton']"
            },
            Platform.INSTAGRAM: {
                "video_container": "div[class*='_aatk']",
                "video": "video",
                "next_button": None,  # Instagram uses swipe
                "menu_button": "svg[aria-label='More']"
            },
            Platform.YOUTUBE_SHORTS: {
                "video_container": "ytd-reel-video-renderer",
                "video": "video",
                "next_button": "button#navigation-button-down",
                "menu_button": "button[aria-label='More actions']"
            },
            Platform.YOUTUBE: {
                "video_container": "ytd-rich-item-renderer",
                "video": "video",
                "next_button": None,
                "menu_button": "button[aria-label='Action menu']"
            }
        }

        return selectors.get(platform, {})
