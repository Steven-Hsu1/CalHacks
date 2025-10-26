"""
Content Filter Agent - Main Entry Point
Processes video streams from Chrome extension and detects content triggers
"""

import asyncio
import logging
import os
import json
from typing import Optional
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import JobContext, WorkerOptions, cli

from video_analyzer import VideoAnalyzer
from command_sender import CommandSender
from scroll_handler import ScrollHandler
from ai_navigator import AINavigator
import time

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Suppress verbose logging from libraries to avoid image data in logs
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


class ContentFilterAgent:
    """Main agent class that coordinates video analysis and content filtering"""

    def __init__(self):
        self.triggers = []
        # Don't initialize these here - they will be initialized lazily in entrypoint
        # to avoid pickling issues in dev mode
        self.video_analyzer = None
        self.command_sender = None
        self.scroll_handler = None
        self.ai_navigator = None
        self.processing_frame = False
        self.current_url = None  # Track the current page URL
        self.last_scroll_time = time.time()

        # Time-based video tracking for auto-looping platforms (like TikTok)
        self.video_start_time = time.time()
        # TikTok videos are typically 15-60s, default to 10s for faster navigation
        self.max_video_watch_duration = float(os.getenv("MAX_VIDEO_WATCH_DURATION", "10"))

    async def entrypoint(self, ctx: JobContext):
        """Agent entry point when participant joins room"""
        # Initialize components here (after multiprocessing fork in dev mode)
        if self.video_analyzer is None:
            self.video_analyzer = VideoAnalyzer()
            self.command_sender = CommandSender()
            self.scroll_handler = ScrollHandler()
            self.ai_navigator = AINavigator()

        logger.info(f"Starting Content Filter Agent for room {ctx.room.name}")

        # Log that we're using extension for all actions
        logger.info("✅ Using Chrome extension for all click actions (TikTok-optimized)")

        # Log video watch duration configuration
        logger.info(f"⏱️  Max video watch duration: {self.max_video_watch_duration}s (auto-navigate after this time)")

        # Connect to the room
        await ctx.connect()
        logger.info("✅ Connected to room successfully")

        # Set up event handlers BEFORE waiting for participants

        # Listen for participants connecting
        @ctx.room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant):
            logger.info(f"👤 Participant connected: {participant.identity}")
            logger.info(f"📊 Participant has {len(participant.track_publications)} track publications")

        # Listen for track publications
        @ctx.room.on("track_published")
        def on_track_published(
            publication: rtc.RemoteTrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            logger.info(f"📹 Track published by {participant.identity}")
            logger.info(f"   Track: {publication.sid}, Kind: {publication.kind}, Source: {publication.source}")

        # Listen for video tracks being subscribed
        @ctx.room.on("track_subscribed")
        def on_track_subscribed(
            track: rtc.Track,
            publication: rtc.TrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            logger.info(f"🎥 Track subscribed from {participant.identity}")
            logger.info(f"   Track kind: {track.kind}, SID: {track.sid}")
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                logger.info("✅ Video track subscribed, starting analysis")
                asyncio.create_task(
                    self.process_video_track(ctx, track, participant)
                )

        # Listen for data messages (triggers from extension)
        @ctx.room.on("data_received")
        def on_data_received(data_packet: rtc.DataPacket):
            logger.info(f"📨 Data received from {data_packet.participant.identity if data_packet.participant else 'unknown'}")
            asyncio.create_task(self.handle_data_message(ctx, data_packet.data, data_packet.participant))

        logger.info("🔧 Event handlers configured")
        logger.info("⏳ Waiting for participants to join...")

        # Wait for participant to join
        participant = await ctx.wait_for_participant()
        logger.info(f"✅ Participant joined: {participant.identity}")
        logger.info(f"📊 Participant info:")
        logger.info(f"   - Identity: {participant.identity}")
        logger.info(f"   - SID: {participant.sid}")
        logger.info(f"   - Track publications: {len(participant.track_publications)}")

        # Check for existing track publications (handles race condition)
        if participant.track_publications:
            logger.info("🔍 Checking for existing video tracks...")
            for sid, publication in participant.track_publications.items():
                logger.info(f"   Found track: {sid}, Kind: {publication.kind}, Subscribed: {publication.subscribed}")

                # If it's a video track and we have the track object, start processing
                if publication.kind == rtc.TrackKind.KIND_VIDEO:
                    if publication.track:
                        logger.info(f"✅ Starting analysis of existing video track: {sid}")
                        asyncio.create_task(
                            self.process_video_track(ctx, publication.track, participant)
                        )
                    else:
                        logger.info(f"⏳ Video track {sid} not yet subscribed, will be handled by event")
        else:
            logger.info("ℹ️  No tracks published yet, waiting for track_published event...")

        # Keep agent running
        await asyncio.Event().wait()

    async def process_video_track(
        self,
        ctx: JobContext,
        track: rtc.VideoTrack,
        participant: rtc.RemoteParticipant
    ):
        """Process incoming video frames"""
        logger.info("=" * 60)
        logger.info("🎥 VIDEO TRACK PROCESSING STARTED")
        logger.info(f"   Track ID: {track.sid}")
        logger.info(f"   Participant: {participant.identity}")
        logger.info(f"   Active triggers: {len(self.triggers)}")
        if self.triggers:
            logger.info(f"   Triggers: {self.triggers}")
        else:
            logger.info(f"   Mode: General content detection")
        logger.info("=" * 60)

        video_stream = rtc.VideoStream(track)

        frame_count = 0
        processed_count = 0
        last_processed_time = 0

        async for frame_event in video_stream:
            try:
                # Extract the actual VideoFrame from the event
                frame = frame_event.frame
                frame_count += 1

                # Log every 30 frames to show we're receiving frames
                if frame_count % 30 == 0:
                    logger.info(f"📊 Received {frame_count} frames total, processed {processed_count}")

                # Dynamic FPS: process more frequently near video end
                time_elapsed = time.time() - self.video_start_time
                if time_elapsed > 7:  # Last 3 seconds of 10s video
                    fps_limit = 4  # Check 4 times per second for quick detection
                else:
                    fps_limit = 2  # Normal rate for first 7 seconds

                # Time-based throttling based on dynamic fps_limit
                current_time = time.time()
                if current_time - last_processed_time < (1.0 / fps_limit):
                    continue  # Skip this frame, not time yet

                last_processed_time = current_time
                processed_count += 1

                logger.info(f"📤 Frame {processed_count} → OpenAI analysis...")

                # Analyze frame for triggers
                detection = await self.video_analyzer.analyze_frame(
                    frame,
                    self.triggers
                )

                # Log JSON response clearly
                import json
                result_json = {
                    "trigger_detected": detection.trigger_detected,
                    "trigger_name": detection.trigger_name,
                    "confidence": round(detection.confidence, 2),
                    "description": detection.description[:80] + "..." if len(detection.description) > 80 else detection.description
                }
                logger.info(f"✅ Response: {json.dumps(result_json)}")

                # Handle trigger detection
                if detection.trigger_detected:
                    logger.warning(f"🚨 TRIGGER DETECTED: {detection.trigger_name} (confidence: {detection.confidence:.2f})")
                    logger.info(f"📍 URL: {self.current_url or 'NOT SET'}")

                    start_time = time.time()

                    try:
                        logger.info(f"🔧 Sending TikTok two-step 'Not interested' click commands to extension...")

                        # Step 1: Send command to click the 3 dots button
                        # TikTok button classes: TUXButton TUXButton--capsule TUXButton--medium TUXButton--secondary action-item css-7a914j
                        three_dots_selector = 'button.TUXButton.TUXButton--capsule.TUXButton--medium.TUXButton--secondary.action-item.css-7a914j'
                        logger.info(f"Step 1: Sending click command for 3 dots button: {three_dots_selector}")

                        await self.command_sender.send_click_command(
                            ctx.room,
                            participant,
                            {
                                "selector": three_dots_selector,
                                "method": "tiktok_three_dots",
                                "text": "More actions"
                            }
                        )

                        logger.info("✅ Step 1 command sent - waiting for menu to appear...")
                        await asyncio.sleep(0.4)  # Reduced wait for faster response

                        # Step 2: Send command to click "Not interested" in the menu
                        not_interested_selector = 'div.TUXMenuItem[data-e2e="more-menu-popover_not-interested"]'
                        logger.info(f"Step 2: Sending click command for 'Not interested': {not_interested_selector}")

                        await self.command_sender.send_click_command(
                            ctx.room,
                            participant,
                            {
                                "selector": not_interested_selector,
                                "method": "tiktok_not_interested",
                                "text": "Not interested"
                            }
                        )

                        logger.info("✅ Step 2 command sent - 'Not interested' click command sent!")

                        # Notify extension about trigger detection
                        await self.command_sender.send_trigger_notification(
                            ctx.room,
                            participant,
                            detection.trigger_name,
                            detection.confidence
                        )

                        elapsed = time.time() - start_time
                        logger.info(f"✅ Click commands sent ({elapsed:.2f}s)")

                        # Reset video timer since we're moving to next video
                        self.video_start_time = time.time()
                        self.last_scroll_time = time.time()

                    except Exception as e:
                        logger.error(f"❌ Error sending click commands: {type(e).__name__}: {str(e)}")

                # Handle video end detection - navigate ONLY if NO trigger detected
                # TikTok-specific: Videos autoplay in a loop, skip to next after watch duration
                time_elapsed = time.time() - self.video_start_time
                time_based_video_end = time_elapsed >= self.max_video_watch_duration

                # WORKFLOW: Only skip to next video if NO trigger was detected AND video finished
                if (detection.video_ended or time_based_video_end) and not detection.trigger_detected:
                    # Log which detection method triggered navigation
                    if detection.video_ended and time_based_video_end:
                        logger.info(f"📽️  Video ended (static frames + {time_elapsed:.1f}s watched)")
                        logger.info(f"✅ No trigger detected - skipping to next video")
                    elif detection.video_ended:
                        logger.info(f"📽️  Video ended (static frames detected)")
                        logger.info(f"✅ No trigger detected - skipping to next video")
                    else:
                        logger.info(f"⏱️  TikTok video watched for {time_elapsed:.1f}s (max: {self.max_video_watch_duration}s)")
                        logger.info(f"✅ No trigger detected in this video - skipping to next")

                    # Check if we should navigate (minimal rate limiting for faster response)
                    time_since_scroll = time.time() - self.last_scroll_time
                    min_interval = 0.5  # Reduced to 0.5 seconds for faster navigation

                    if time_since_scroll < min_interval:
                        logger.info(f"⏸️  Rate limiting: waiting {min_interval - time_since_scroll:.1f}s before next navigation")
                    else:
                        try:
                            nav_start = time.time()

                            logger.info("🔧 Sending next video navigation command to extension...")

                            # TikTok next video button (when no trigger detected)
                            # Button classes: TUXButton TUXButton--capsule TUXButton--medium TUXButton--secondary action-item css-16m89jc
                            next_video_selector = 'button.TUXButton.TUXButton--capsule.TUXButton--medium.TUXButton--secondary.action-item.css-16m89jc'

                            # Send click command for TikTok next video button
                            logger.info(f"📤 Sending click command for TikTok next video button: {next_video_selector}")
                            await self.command_sender.send_click_command(
                                ctx.room,
                                participant,
                                {
                                    "selector": next_video_selector,
                                    "method": "tiktok_next_video",
                                    "text": "Next video",
                                    "fallback": "scroll_down"  # If button not found, scroll instead
                                }
                            )

                            logger.info("✅ Next video navigation command sent!")
                            self.last_scroll_time = time.time()
                            self.video_start_time = time.time()  # Reset video timer
                            elapsed = time.time() - nav_start
                            logger.info(f"✅ Navigation command sent ({elapsed:.2f}s)")

                        except Exception as e:
                            logger.error(f"❌ Error sending navigation command: {type(e).__name__}: {str(e)}")

            except Exception as e:
                # Don't use exc_info=True here to avoid logging frame/image data
                logger.error(f"Error processing frame: {type(e).__name__}: {str(e)}")

    def _get_navigation_url(self) -> Optional[str]:
        """
        Get URL for navigation with fallback if not set

        Returns:
            URL string or None if no URL available
        """
        # If we have a current URL, use it
        if self.current_url and self.current_url.strip():
            return self.current_url

        # Otherwise, return a default TikTok URL
        # This allows MCP to work even without specific video URL
        logger.info("ℹ️  No specific URL set, using fallback: https://www.tiktok.com")
        return "https://www.tiktok.com"

    def _detect_platform(self, url: str) -> str:
        """
        Detect social media platform from URL

        Args:
            url: Page URL

        Returns:
            Platform name (TikTok, YouTube Shorts, Instagram Reels, etc.)
        """
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
            return "Unknown"

    async def handle_data_message(self, ctx: JobContext, data: bytes, participant: rtc.RemoteParticipant):
        """Handle data messages from extension"""
        try:
            message = json.loads(data.decode())
            logger.info("=" * 60)
            logger.info(f"📨 DATA MESSAGE RECEIVED: {message.get('type')}")

            if message["type"] == "INIT_TRIGGERS":
                self.triggers = message["triggers"]
                # Also get URL if provided
                if "url" in message:
                    self.current_url = message["url"]
                    logger.info(f"📍 Current URL: {self.current_url}")
                else:
                    logger.warning("⚠️  No URL provided in INIT_TRIGGERS message")

                if self.triggers:
                    logger.info(f"📋 Initialized with {len(self.triggers)} specific trigger(s):")
                    for i, trigger in enumerate(self.triggers, 1):
                        logger.info(f"   {i}. {trigger}")
                else:
                    logger.info(f"📋 No specific triggers configured - using general content detection")
                logger.info("=" * 60)

            elif message["type"] == "UPDATE_TRIGGERS":
                old_count = len(self.triggers) if self.triggers else 0
                self.triggers = message["triggers"]
                new_count = len(self.triggers) if self.triggers else 0

                if self.triggers:
                    logger.info(f"🔄 Triggers updated ({old_count} → {new_count}):")
                    for i, trigger in enumerate(self.triggers, 1):
                        logger.info(f"   {i}. {trigger}")
                else:
                    logger.info(f"🔄 Triggers cleared ({old_count} → 0) - switching to general content detection")
                logger.info("=" * 60)

            elif message["type"] == "URL_UPDATE":
                old_url = self.current_url
                self.current_url = message.get("url")
                logger.info(f"📍 URL updated:")
                logger.info(f"   From: {old_url or 'NOT SET'}")
                logger.info(f"   To: {self.current_url}")
                logger.info("=" * 60)

            else:
                logger.warning(f"⚠️  Unknown message type: {message.get('type')}")
                logger.info("=" * 60)

        except Exception as e:
            logger.error(f"❌ Error handling data message: {e}", exc_info=True)
            logger.info("=" * 60)


def main():
    """Main entry point"""
    logger.info("=" * 60)
    logger.info("Content Filter Agent Starting")
    logger.info("=" * 60)

    # Validate environment variables
    required_vars = ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_URL"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]

    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        logger.error("Please set them in your .env file")
        return

    # Check for OpenAI API key
    if not os.getenv("OPENAI_API_KEY"):
        logger.error("Missing OPENAI_API_KEY. Please set it in your .env file")
        logger.error("Get your API key from: https://platform.openai.com/api-keys")
        return

    agent = ContentFilterAgent()

    logger.info(f"Connecting to LiveKit at {os.getenv('LIVEKIT_URL')}")

    # cli.run_app is synchronous but manages async internally
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=agent.entrypoint,
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
            ws_url=os.getenv("LIVEKIT_URL"),
        )
    )


if __name__ == "__main__":
    main()
