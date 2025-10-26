"""Test LiveKit connection"""
import os
import asyncio
from dotenv import load_dotenv
from livekit import api

load_dotenv()

async def test_connection():
    """Test if we can connect to LiveKit"""
    print("Testing LiveKit connection...")

    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    print(f"URL: {url}")
    print(f"API Key: {api_key[:10]}...")

    try:
        # Create LiveKit API client
        lk_api = api.LiveKitAPI(
            url,
            api_key,
            api_secret,
        )

        # Try to list rooms
        print("\nAttempting to list rooms...")
        from livekit.api import ListRoomsRequest
        rooms = await lk_api.room.list_rooms(ListRoomsRequest())
        print(f"✓ Successfully connected! Found {len(rooms)} rooms")

        for room in rooms:
            print(f"  - Room: {room.name} (participants: {room.num_participants})")

        # Try to list participants in a test room
        print("\nConnection test successful!")
        await lk_api.aclose()
        return True

    except Exception as e:
        print(f"✗ Connection failed: {type(e).__name__}: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(test_connection())
