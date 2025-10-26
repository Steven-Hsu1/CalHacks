"""
Video Analyzer - Uses vision LLMs to detect content triggers in video frames
"""

import base64
import logging
import io
import os
from dataclasses import dataclass
from typing import List, Optional

from PIL import Image
from livekit import rtc

logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    """Result from analyzing a video frame"""
    trigger_detected: bool
    trigger_name: Optional[str]
    confidence: float
    description: str
    video_ended: bool = False  # New field to track if video has ended


class VideoAnalyzer:
    """Analyzes video frames using vision LLMs to detect content triggers"""

    def __init__(self):
        # Use OpenAI GPT-4o for vision analysis
        from openai import AsyncOpenAI

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")

        # Suppress OpenAI library logging to avoid image data in logs
        import logging as openai_logging
        openai_logging.getLogger("openai").setLevel(openai_logging.WARNING)
        openai_logging.getLogger("httpx").setLevel(openai_logging.WARNING)

        self.client = AsyncOpenAI(api_key=api_key)
        self.model = "gpt-4o"  # GPT-4o has excellent vision capabilities
        logger.info("Using OpenAI GPT-4o for vision analysis")

        # For video end detection
        self.previous_frame_data = None
        self.static_frame_count = 0
        self.static_threshold = 5  # Number of similar frames to consider video ended

    async def analyze_frame(
        self,
        frame: rtc.VideoFrame,
        triggers: List[str]
    ) -> DetectionResult:
        """
        Analyze a video frame to detect triggers and video end

        Args:
            frame: Video frame from LiveKit
            triggers: List of trigger phrases to detect (can be empty for general detection)

        Returns:
            DetectionResult with detection information
        """
        try:
            # Convert frame to base64 image
            image_data = await self._frame_to_base64(frame)

            # Check if video has ended (static frames)
            video_ended = self._detect_video_end(frame)

            # Create prompt
            prompt = self._create_detection_prompt(triggers)

            # Analyze with OpenAI
            result = await self._analyze_with_openai(image_data, prompt)

            # Add video_ended flag to result
            result.video_ended = video_ended

            return result

        except Exception as e:
            # Don't use exc_info=True here to avoid logging image data in traceback
            logger.error(f"Error analyzing frame: {type(e).__name__}: {str(e)}")
            return DetectionResult(
                trigger_detected=False,
                trigger_name=None,
                confidence=0.0,
                description=f"Error: {str(e)}",
                video_ended=False
            )

    def _detect_video_end(self, frame: rtc.VideoFrame) -> bool:
        """
        Detect if video has ended by comparing consecutive frames

        Args:
            frame: Current video frame

        Returns:
            True if video appears to have ended
        """
        try:
            # Get raw frame data for comparison
            current_data = bytes(frame.data)

            # If this is the first frame, store it
            if self.previous_frame_data is None:
                self.previous_frame_data = current_data
                return False

            # Compare with previous frame
            # Simple byte-by-byte comparison (could be optimized with sampling)
            similarity = self._calculate_frame_similarity(current_data, self.previous_frame_data)

            # If frames are very similar (>95% same), increment counter
            if similarity > 0.95:
                self.static_frame_count += 1
            else:
                # Reset counter if frames are different
                self.static_frame_count = 0

            # Update previous frame
            self.previous_frame_data = current_data

            # Video has ended if we've seen enough static frames
            if self.static_frame_count >= self.static_threshold:
                logger.info(f"Video end detected: {self.static_frame_count} static frames")
                self.static_frame_count = 0  # Reset for next video
                return True

            return False

        except Exception as e:
            logger.error(f"Error detecting video end: {e}")
            return False

    def _calculate_frame_similarity(self, data1: bytes, data2: bytes) -> float:
        """
        Calculate similarity between two frames

        Args:
            data1: First frame data
            data2: Second frame data

        Returns:
            Similarity score between 0.0 and 1.0
        """
        if len(data1) != len(data2):
            return 0.0

        # Sample every 1000th byte for performance
        sample_rate = 1000
        matches = 0
        samples = 0

        for i in range(0, len(data1), sample_rate):
            if data1[i] == data2[i]:
                matches += 1
            samples += 1

        return matches / samples if samples > 0 else 0.0

    def _create_detection_prompt(self, triggers: List[str]) -> str:
        """Create prompt for vision model"""
        if not triggers:
            # General detection prompt when no specific triggers are configured
            return """You are analyzing a video frame from a social media feed (could be YouTube, Instagram, TikTok, Facebook, Twitter, etc.).

Your task is to detect if the frame contains potentially unwanted or inappropriate content that a user might want to filter, such as:
- Violence, gore, or disturbing imagery
- Explicit or sexual content
- Hate speech symbols or imagery
- Harassment or bullying content
- Misinformation or conspiracy theories (when clearly identifiable)
- Spam or scam content
- Excessive profanity
- Content that could be triggering (substance abuse, self-harm, etc.)

Analyze the image carefully and look for:
- Visual content (objects, people, actions, scenes, activities)
- Text overlays, captions, or subtitles
- Context and setting
- Any symbols or imagery that might be inappropriate

Respond in JSON format:
{
    "trigger_detected": true/false,
    "trigger_name": "brief category of detected content" or null,
    "confidence": 0.0-1.0,
    "description": "brief description of what you see in the frame"
}

Be conservative and only report a detection if you're reasonably confident (>0.7) the content is genuinely inappropriate or unwanted.
For borderline content, set trigger_detected to false.

IMPORTANT: Respond ONLY with the JSON, no additional text or explanation."""

        # User-specified triggers prompt
        triggers_str = ", ".join([f'"{t}"' for t in triggers])

        return f"""You are analyzing a video frame from a social media feed (could be YouTube, Instagram, TikTok, Facebook, Twitter, etc.).

Your task is to detect if the frame contains any of these user-specified content triggers:
{triggers_str}

STRICT DETECTION RULES:
1. Only detect a trigger if it is EXPLICITLY present in the frame
2. The trigger word must be:
   - Clearly visible in text/captions/overlays, OR
   - Shown as a logo/brand name, OR
   - The actual thing itself (e.g., if trigger is "valorant", the actual Valorant game must be shown)
3. Do NOT detect based on:
   - Vague associations or similar topics
   - Related content that doesn't explicitly show/mention the trigger
   - General categories (e.g., don't detect "valorant" just because it's any FPS game)

Examples:
- Trigger "valorant": ONLY detect if you see the word "Valorant", Valorant logo, or actual Valorant gameplay
- Trigger "nike": ONLY detect if you see Nike logo, Nike products with visible branding, or "Nike" text
- Trigger "cooking": ONLY detect if someone is actually cooking or the word "cooking" appears

Respond in JSON format:
{{
    "trigger_detected": true/false,
    "trigger_name": "EXACT trigger name from the list above" or null,
    "confidence": 0.0-1.0,
    "description": "brief description of what you see in the frame"
}}

CRITICAL RULES:
1. If trigger_detected is true, trigger_name MUST be one of the EXACT trigger names from the list: {triggers_str}
2. Be VERY conservative - when in doubt, set trigger_detected to false
3. Only report a detection if you're highly confident (>0.85) the trigger is EXPLICITLY present
4. The trigger must be the MAIN subject or clearly visible, not a minor background element
5. If no trigger is EXPLICITLY detected, set trigger_detected to false and trigger_name to null

IMPORTANT: Respond ONLY with the JSON, no additional text or explanation."""

    async def _frame_to_base64(self, frame: rtc.VideoFrame) -> str:
        """
        Convert video frame to base64 encoded JPEG

        Args:
            frame: LiveKit video frame

        Returns:
            Base64 encoded image string
        """
        try:
            # Get frame dimensions
            width = frame.width
            height = frame.height

            logger.debug(f"Converting frame: {width}x{height}, format: {frame.type}")

            # Convert LiveKit frame to ARGB format (most compatible)
            # This handles any input format (I420, NV12, ARGB, etc.)
            argb_frame = frame.convert(rtc.VideoBufferType.RGBA)

            # Get the converted buffer data
            buffer = argb_frame.data

            # Calculate expected buffer size
            expected_size = width * height * 4  # RGBA = 4 bytes per pixel
            actual_size = len(buffer)

            logger.debug(f"Buffer size: expected={expected_size}, actual={actual_size}")

            # Verify buffer size
            if actual_size < expected_size:
                raise ValueError(f"Buffer too small: expected {expected_size} bytes, got {actual_size} bytes")

            # Create PIL Image from RGBA buffer
            img = Image.frombytes('RGBA', (width, height), bytes(buffer))

            # Convert to RGB (remove alpha channel)
            img = img.convert('RGB')

            # Resize for efficiency (vision models work well with smaller images)
            # This also reduces API costs
            max_size = 1024
            if width > max_size or height > max_size:
                img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                logger.debug(f"Resized frame from {width}x{height} to {img.width}x{img.height}")

            # Convert to JPEG bytes
            jpeg_buffer = io.BytesIO()
            img.save(jpeg_buffer, format='JPEG', quality=85)
            img_bytes = jpeg_buffer.getvalue()

            # Encode to base64
            base64_str = base64.b64encode(img_bytes).decode('utf-8')

            logger.debug(f"Successfully converted frame to base64 (JPEG size: {len(img_bytes)} bytes)")

            return base64_str

        except Exception as e:
            # Don't use exc_info=True here to avoid logging buffer data
            logger.error(f"Error converting frame to base64: {type(e).__name__}: {str(e)}")
            logger.error(f"Frame info: width={frame.width}, height={frame.height}, type={frame.type}")
            raise
    
    async def _analyze_with_openai(
        self,
        image_data: str,
        prompt: str
    ) -> DetectionResult:
        """Analyze image using OpenAI GPT-4o"""
        try:
            # Create data URL for OpenAI (NOT logged to avoid terminal clutter)
            data_url = f"data:image/jpeg;base64,{image_data}"

            # Note: Logging minimal info to avoid printing base64 image data
            logger.info("   🔄 Sending to OpenAI GPT-4o...")

            # Make API call with image data (library logging suppressed in __init__)
            response = await self.client.chat.completions.create(
                model=self.model,
                max_tokens=300,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": data_url,
                                    "detail": "low"  # Use low detail for faster processing
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ],
                response_format={"type": "json_object"}  # Request JSON response
            )

            logger.info("   ✓ OpenAI response received")

            # Parse JSON response
            import json
            result_text = response.choices[0].message.content.strip()

            # Remove markdown code blocks if present
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
                result_text = result_text.strip()

            result_json = json.loads(result_text)

            return DetectionResult(
                trigger_detected=result_json["trigger_detected"],
                trigger_name=result_json.get("trigger_name"),
                confidence=result_json["confidence"],
                description=result_json["description"]
            )

        except Exception as e:
            # Don't use exc_info=True here to avoid logging image data
            logger.error(f"Error in OpenAI analysis: {type(e).__name__}: {str(e)}")
            raise
