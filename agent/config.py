"""
Configuration for Content Filter Agent
"""

import os
from typing import Optional


class Config:
    """Agent configuration"""

    # LiveKit Configuration
    LIVEKIT_URL: str = os.getenv("LIVEKIT_URL", "")
    LIVEKIT_API_KEY: str = os.getenv("LIVEKIT_API_KEY", "")
    LIVEKIT_API_SECRET: str = os.getenv("LIVEKIT_API_SECRET", "")

    # Vision LLM Configuration
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")

    # Vision Model Settings
    VISION_MODEL: str = "gpt-4o"
    VISION_MAX_TOKENS: int = 300
    VISION_TEMPERATURE: float = 0.1

    # Agent Settings
    FPS_LIMIT: int = int(os.getenv("FPS_LIMIT", "1"))  # Process N frames per second (default: 1 FPS)
    IMAGE_MAX_SIZE: int = int(os.getenv("IMAGE_MAX_SIZE", "1024"))  # Max dimension for analysis
    IMAGE_QUALITY: int = int(os.getenv("IMAGE_QUALITY", "85"))  # JPEG quality (1-100)

    # Detection Settings
    MIN_CONFIDENCE_THRESHOLD: float = float(os.getenv("MIN_CONFIDENCE_THRESHOLD", "0.7"))

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    @classmethod
    def validate(cls) -> bool:
        """
        Validate that all required configuration is present

        Returns:
            True if configuration is valid
        """
        errors = []

        if not cls.LIVEKIT_URL:
            errors.append("LIVEKIT_URL is not set")
        if not cls.LIVEKIT_API_KEY:
            errors.append("LIVEKIT_API_KEY is not set")
        if not cls.LIVEKIT_API_SECRET:
            errors.append("LIVEKIT_API_SECRET is not set")

        if not cls.OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY is not set")

        if errors:
            print("Configuration errors:")
            for error in errors:
                print(f"  - {error}")
            return False

        return True

    @classmethod
    def print_config(cls):
        """Print current configuration (without secrets)"""
        print("Agent Configuration:")
        print(f"  LiveKit URL: {cls.LIVEKIT_URL}")
        print(f"  LiveKit API Key: {'*' * 20 if cls.LIVEKIT_API_KEY else 'NOT SET'}")
        print(f"  Vision Provider: OpenAI GPT-4o")
        print(f"  Vision Model: {cls.VISION_MODEL}")
        print(f"  OpenAI API Key: {'*' * 20 if cls.OPENAI_API_KEY else 'NOT SET'}")
        print(f"  FPS Limit: {cls.FPS_LIMIT} frame(s) per second")
        print(f"  Image Size: {cls.IMAGE_MAX_SIZE}px")
        print(f"  Min Confidence: {cls.MIN_CONFIDENCE_THRESHOLD}")


# Export singleton instance
config = Config()
