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
        # Use Anthropic Claude for vision analysis
        from anthropic import AsyncAnthropic

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")

        self.client = AsyncAnthropic(api_key=api_key)
        self.model = "claude-3-5-sonnet-20241022"
        logger.info("Using Anthropic Claude 3.5 Sonnet for vision analysis")

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

            # Analyze with Claude
            result = await self._analyze_with_claude(image_data, prompt)

            # Add video_ended flag to result
            result.video_ended = video_ended

            return result

        except Exception as e:
            logger.error(f"Error analyzing frame: {e}", exc_info=True)
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

Analyze the image carefully and look for:
- Visual content (objects, people, actions, scenes, activities)
- Text overlays, captions, or subtitles
- Context and setting
- Any symbols or imagery related to the triggers

Respond in JSON format:
{{
    "trigger_detected": true/false,
    "trigger_name": "name of detected trigger" or null,
    "confidence": 0.0-1.0,
    "description": "brief description of what you see in the frame"
}}

Be accurate and only report a detection if you're reasonably confident (>0.7) the trigger is present.
If you detect multiple triggers, report the most prominent one.

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
            # Convert frame buffer to PIL Image
            # The frame.data gives us the raw buffer
            # We need to handle the conversion based on frame format

            # Get frame dimensions
            width = frame.width
            height = frame.height

            # Convert to RGB format
            # Note: This assumes ARGB format from LiveKit
            # Adjust if your frames are in a different format
            buffer = frame.data

            # Create PIL Image
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
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85)
            img_bytes = buffer.getvalue()

            # Encode to base64
            base64_str = base64.b64encode(img_bytes).decode('utf-8')

            return base64_str

        except Exception as e:
            logger.error(f"Error converting frame to base64: {e}", exc_info=True)
            raise

    async def _analyze_with_claude(
        self,
        image_data: str,
        prompt: str
    ) -> DetectionResult:
        """Analyze image using Anthropic Claude"""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=300,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_data
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            )

            # Parse JSON response
            import json
            result_text = response.content[0].text.strip()

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
            logger.error(f"Error in Claude analysis: {e}", exc_info=True)
            raise
