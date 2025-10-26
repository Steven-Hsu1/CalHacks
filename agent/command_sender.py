"""
Command Sender - Sends commands from agent to Chrome extension
"""

import json
import logging
from typing import Dict, Optional
from datetime import datetime
from livekit import rtc

logger = logging.getLogger(__name__)


class CommandSender:
    """Send commands from agent to Chrome extension via LiveKit data channel"""

    def __init__(self):
        self.command_count = 0

    async def send_click_command(
        self,
        room: rtc.Room,
        participant: rtc.RemoteParticipant,
        click_target: Dict
    ):
        """
        Send click command to extension

        Args:
            room: LiveKit room
            participant: Target participant (extension)
            click_target: Dict with selector and/or coordinates
        """
        try:
            command = {
                "type": "CLICK_ELEMENT",
                "selector": click_target.get("selector"),
                "coordinates": click_target.get("coordinates"),
                "text": click_target.get("text"),
                "method": click_target.get("method", "unknown"),
                "timestamp": self._get_timestamp(),
                "command_id": self._get_command_id()
            }

            await self._send_data(room, participant, command)

            logger.info(
                f"✅ Sent click command #{command['command_id']}: "
                f"selector='{click_target.get('selector')}', "
                f"coords={click_target.get('coordinates')}"
            )

        except Exception as e:
            logger.error(f"Error sending click command: {e}", exc_info=True)

    async def send_trigger_notification(
        self,
        room: rtc.Room,
        participant: rtc.RemoteParticipant,
        trigger_name: str,
        confidence: float = 0.0
    ):
        """
        Notify extension that a trigger was detected

        Args:
            room: LiveKit room
            participant: Target participant
            trigger_name: Name of detected trigger
            confidence: Detection confidence score
        """
        try:
            notification = {
                "type": "TRIGGER_DETECTED",
                "trigger": trigger_name,
                "confidence": confidence,
                "timestamp": self._get_timestamp(),
                "command_id": self._get_command_id()
            }

            await self._send_data(room, participant, notification)

            logger.info(
                f"📢 Sent trigger notification #{notification['command_id']}: "
                f"'{trigger_name}' (confidence: {confidence:.2f})"
            )

        except Exception as e:
            logger.error(f"Error sending notification: {e}", exc_info=True)

    async def send_status_update(
        self,
        room: rtc.Room,
        participant: rtc.RemoteParticipant,
        status: str,
        message: Optional[str] = None
    ):
        """
        Send status update to extension

        Args:
            room: LiveKit room
            participant: Target participant
            status: Status type (e.g., "ready", "processing", "error")
            message: Optional status message
        """
        try:
            update = {
                "type": "STATUS_UPDATE",
                "status": status,
                "message": message,
                "timestamp": self._get_timestamp()
            }

            await self._send_data(room, participant, update)
            logger.debug(f"Status update sent: {status}")

        except Exception as e:
            logger.error(f"Error sending status update: {e}")

    async def send_error(
        self,
        room: rtc.Room,
        participant: rtc.RemoteParticipant,
        error_message: str,
        error_type: str = "general"
    ):
        """
        Send error notification to extension

        Args:
            room: LiveKit room
            participant: Target participant
            error_message: Error description
            error_type: Type of error
        """
        try:
            error = {
                "type": "ERROR",
                "error_type": error_type,
                "message": error_message,
                "timestamp": self._get_timestamp()
            }

            await self._send_data(room, participant, error)
            logger.warning(f"Error sent to extension: {error_message}")

        except Exception as e:
            logger.error(f"Error sending error message: {e}")

    async def send_navigation_command(
        self,
        room: rtc.Room,
        participant: rtc.RemoteParticipant,
        action: Dict
    ):
        """
        Send navigation command to extension (scroll, key press, etc.)

        Args:
            room: LiveKit room
            participant: Target participant
            action: Dict with action details from AI Navigator:
                {
                    "action": "scroll" | "click" | "key",
                    "target": "down" | "up" | "ArrowDown" | selector,
                    "reasoning": "explanation",
                    "platform": "TikTok"
                }
        """
        try:
            command = {
                "type": "NAVIGATE_NEXT",
                "action": action.get("action", "scroll"),
                "target": action.get("target", "down"),
                "platform": action.get("platform", "Unknown"),
                "reasoning": action.get("reasoning", ""),
                "timestamp": self._get_timestamp(),
                "command_id": self._get_command_id()
            }

            await self._send_data(room, participant, command)

            logger.info(
                f"🧭 Sent navigation command #{command['command_id']}: "
                f"{action.get('action')} {action.get('target')} on {action.get('platform')}"
            )

        except Exception as e:
            logger.error(f"Error sending navigation command: {type(e).__name__}: {str(e)}")

    async def send_scroll_command(
        self,
        room: rtc.Room,
        participant: rtc.RemoteParticipant,
        scroll_config: Dict
    ):
        """
        Send scroll command to extension (deprecated - use send_navigation_command)

        Args:
            room: LiveKit room
            participant: Target participant
            scroll_config: Scroll configuration from ScrollHandler
        """
        try:
            command = {
                "type": "SCROLL_NEXT",
                "scroll_type": scroll_config.get("type"),
                "selector": scroll_config.get("selector"),
                "scroll_amount": scroll_config.get("scroll_amount"),
                "platform": scroll_config.get("platform"),
                "timestamp": self._get_timestamp(),
                "command_id": self._get_command_id()
            }

            await self._send_data(room, participant, command)

            logger.info(
                f"✅ Sent scroll command #{command['command_id']}: "
                f"{scroll_config.get('description')}"
            )

        except Exception as e:
            logger.error(f"Error sending scroll command: {e}", exc_info=True)

    async def _send_data(
        self,
        room: rtc.Room,
        participant: rtc.RemoteParticipant,
        data: Dict
    ):
        """
        Send data to specific participant via LiveKit data channel

        Args:
            room: LiveKit room
            participant: Target participant
            data: Data to send (will be JSON encoded)
        """
        try:
            # Check if room is still connected
            if not room.isconnected():
                logger.warning(f"Cannot send data - room disconnected")
                return

            # Encode data as JSON
            payload = json.dumps(data).encode('utf-8')

            # Send to specific participant
            await room.local_participant.publish_data(
                payload,
                reliable=True,
                destination_identities=[participant.identity]
            )

            logger.debug(f"Data sent: {data.get('type')} -> {participant.identity}")

        except Exception as e:
            # Don't use exc_info=True to avoid logging large data payloads
            logger.error(f"Failed to send data: {type(e).__name__}: {str(e)}")

    async def broadcast_data(
        self,
        room: rtc.Room,
        data: Dict
    ):
        """
        Broadcast data to all participants in the room

        Args:
            room: LiveKit room
            data: Data to broadcast
        """
        try:
            # Check if room is still connected
            if not room.isconnected():
                logger.warning(f"Cannot broadcast data - room disconnected")
                return

            payload = json.dumps(data).encode('utf-8')

            await room.local_participant.publish_data(
                payload,
                reliable=True
                # No destination_identities = broadcast to all
            )

            logger.debug(f"Data broadcast: {data.get('type')}")

        except Exception as e:
            logger.error(f"Failed to broadcast data: {type(e).__name__}: {str(e)}")
            raise

    def _get_timestamp(self) -> int:
        """Get current timestamp in milliseconds"""
        return int(datetime.now().timestamp() * 1000)

    def _get_command_id(self) -> int:
        """Get unique command ID"""
        self.command_count += 1
        return self.command_count

    def reset_counter(self):
        """Reset command counter"""
        self.command_count = 0
