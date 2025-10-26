"""
Content Filter Agent - Main Entry Point
Processes video streams from Chrome extension and detects content triggers
"""

import asyncio
import logging
import os
import json
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import JobContext, WorkerOptions, cli

from video_analyzer import VideoAnalyzer
from mcp_client import MCPClient
from command_sender import CommandSender
from scroll_handler import ScrollHandler
import time

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ContentFilterAgent:
    """Main agent class that coordinates video analysis and content filtering"""

    def __init__(self):
        self.triggers = []
        # Don't initialize these here - they will be initialized lazily in entrypoint
        # to avoid pickling issues in dev mode
        self.video_analyzer = None
        self.mcp_client = None
        self.command_sender = None
        self.scroll_handler = None
        self.processing_frame = False
        self.current_url = None  # Track the current page URL
        self.last_scroll_time = time.time()

    async def entrypoint(self, ctx: JobContext):
        """Agent entry point when participant joins room"""
        # Initialize components here (after multiprocessing fork in dev mode)
        if self.video_analyzer is None:
            self.video_analyzer = VideoAnalyzer()
            self.mcp_client = MCPClient()
            self.command_sender = CommandSender()
            self.scroll_handler = ScrollHandler()

        logger.info(f"Starting Content Filter Agent for room {ctx.room.name}")

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
        fps_limit = 1  # Process 1 frame per second

        async for frame_event in video_stream:
            try:
                # Extract the actual VideoFrame from the event
                frame = frame_event.frame
                frame_count += 1

                # Log every 30 frames to show we're receiving frames
                if frame_count % 30 == 0:
                    logger.info(f"📊 Received {frame_count} frames total, processed {processed_count}")

                # Time-based throttling: only process 1 frame per second
                current_time = time.time()
                if current_time - last_processed_time < (1.0 / fps_limit):
                    continue  # Skip this frame, not time yet

                last_processed_time = current_time
                processed_count += 1

                logger.info(f"🎬 Processing frame {processed_count} (frame #{frame_count} received)...")
                logger.info(f"   Frame size: {frame.width}x{frame.height}")

                # Analyze frame for triggers
                detection = await self.video_analyzer.analyze_frame(
                    frame,
                    self.triggers
                )

                # Log detection result
                logger.info(f"   Analysis result: {detection.description[:100]}")
                if not detection.trigger_detected:
                    logger.info(f"   ✓ No trigger detected (confidence: {detection.confidence:.2f})")

                # Handle trigger detection
                if detection.trigger_detected:
                    logger.warning(f"🚨 TRIGGER DETECTED: {detection.trigger_name} (confidence: {detection.confidence:.2f})")
                    logger.info(f"📝 Description: {detection.description}")
                    logger.info(f"📍 Current URL: {self.current_url or 'NOT SET'}")

                    # Check if URL is available for MCP
                    if not self.current_url:
                        logger.error("❌ No URL available - cannot use MCP! Extension must send URL.")
                        logger.info("⚠️  Falling back to extension-based clicking...")
                        # Fall back to extension-based clicking
                        await self.command_sender.send_click_command(
                            ctx.room,
                            participant,
                            {"selector": None, "found": True, "method": "fallback"}
                        )
                    else:
                        logger.info(f"🔧 Using MCP to find and click 'Not interested' button...")
                        # Use MCP to find and click "Not interested" button
                        try:
                            logger.info("🔍 Step 1: Finding 'Not interested' button via MCP...")
                            start_time = time.time()

                            click_target = await self.mcp_client.find_not_interested_button(
                                self.current_url
                            )

                            find_time = time.time() - start_time
                            logger.info(f"⏱️  Button search took {find_time:.2f}s")

                            if click_target and click_target.get('found'):
                                if click_target.get('method') == 'mcp' and click_target.get('selector'):
                                    logger.info(f"✓ Found button via MCP: '{click_target.get('text')}'")
                                    logger.info(f"🎯 Selector: {click_target.get('selector')}")
                                    logger.info("👆 Step 2: Clicking via MCP...")

                                    # Click via MCP
                                    click_start = time.time()
                                    success = await self.mcp_client.click_element(
                                        self.current_url,
                                        click_target.get('selector')
                                    )
                                    click_time = time.time() - click_start
                                    logger.info(f"⏱️  Click took {click_time:.2f}s")

                                    if success:
                                        logger.info("✅ MCP CLICK SUCCESSFUL!")
                                    else:
                                        logger.warning("❌ MCP click failed, falling back to extension")
                                        await self.command_sender.send_click_command(
                                            ctx.room,
                                            participant,
                                            click_target
                                        )
                                else:
                                    # Fallback to extension
                                    logger.info("⚠️  MCP returned fallback method, using extension to click")
                                    await self.command_sender.send_click_command(
                                        ctx.room,
                                        participant,
                                        click_target
                                    )

                                # Notify extension about trigger detection
                                await self.command_sender.send_trigger_notification(
                                    ctx.room,
                                    participant,
                                    detection.trigger_name,
                                    detection.confidence
                                )

                                total_time = time.time() - start_time
                                logger.info(f"✅ Total action time: {total_time:.2f}s (find + click)")
                            else:
                                logger.warning("⚠️  Could not find 'Not interested' button on page")

                        except Exception as e:
                            logger.error(f"❌ Error finding or clicking button: {e}", exc_info=True)

                # Handle video end detection
                if detection.video_ended:
                    logger.info("📽️  Video ended, preparing to scroll")

                    # Check if we should scroll
                    time_since_scroll = time.time() - self.last_scroll_time
                    should_scroll = self.scroll_handler.should_scroll(
                        detection.video_ended,
                        time_since_scroll
                    )

                    if should_scroll and self.current_url:
                        # Get scroll command for current platform
                        scroll_config = self.scroll_handler.get_scroll_command(self.current_url)

                        # Send scroll command to extension
                        await self.command_sender.send_scroll_command(
                            ctx.room,
                            participant,
                            scroll_config
                        )

                        self.last_scroll_time = time.time()
                        logger.info("✅ Scroll command sent")

            except Exception as e:
                logger.error(f"Error processing frame: {e}", exc_info=True)

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

    # Check for Anthropic API key
    if not os.getenv("ANTHROPIC_API_KEY"):
        logger.error("Missing ANTHROPIC_API_KEY. Please set it in your .env file")
        logger.error("Get your API key from: https://console.anthropic.com")
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
