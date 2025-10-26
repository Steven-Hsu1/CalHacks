/**
 * Offscreen Document for Content Filter Extension
 * Handles media capture and LiveKit connection
 * (Service workers can't access getUserMedia, so we need this)
 */

// Import LiveKit SDK
import { Room, RoomEvent, VideoPresets } from 'livekit-client';

console.log('[Offscreen] Document loaded');

// State
let livekitRoom = null;
let mediaStream = null;
let isCapturing = false;

// LiveKit configuration
const LIVEKIT_CONFIG = {
  url: 'wss://calhacks-ikdq8pe8.livekit.cloud'
};

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message.type);

  switch (message.type) {
    case 'START_CAPTURE':
      // No streamId needed - getDisplayMedia handles everything
      handleStartCapture(message.triggers)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    case 'STOP_CAPTURE':
      handleStopCapture()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'UPDATE_TRIGGERS':
      updateTriggers(message.triggers);
      sendResponse({ success: true });
      return false;
  }
});

// Start media capture and LiveKit connection
async function handleStartCapture(triggers) {
  try {
    console.log('[Offscreen] Starting capture...');

    if (isCapturing) {
      console.log('[Offscreen] Already capturing');
      return;
    }

    // Use getDisplayMedia for standard screen/tab sharing with picker UI
    // This will show a picker where user can select the tab to monitor
    console.log('[Offscreen] 📺 Showing screen share picker...');
    console.log('[Offscreen] 💡 IMPORTANT: Select the TAB with your social media site (TikTok, YouTube, etc.)');
    console.log('[Offscreen] 💡 Look for the tab NAME in the list, not the blank preview');

    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser', // Only show browser tabs/windows
      },
      audio: false,
      selfBrowserSurface: 'exclude', // Exclude the offscreen document itself
      surfaceSwitching: 'exclude', // Prevent switching during capture
      systemAudio: 'exclude' // No system audio
    });

    console.log('[Offscreen] ✅ Got media stream:', {
      id: mediaStream.id,
      active: mediaStream.active,
      tracks: mediaStream.getTracks().length
    });

    // Validate the captured surface
    const videoTrack = mediaStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    console.log('[Offscreen] 📊 Capture settings:', {
      displaySurface: settings.displaySurface,
      width: settings.width,
      height: settings.height
    });

    // Warn if not capturing a browser tab
    if (settings.displaySurface && settings.displaySurface !== 'browser') {
      console.warn('[Offscreen] ⚠️  Warning: You selected', settings.displaySurface, 'instead of a browser tab');
      console.warn('[Offscreen] ⚠️  For best results, select the TAB with your social media site');
    }

    // Handle stream ending (user stops sharing)
    videoTrack.onended = () => {
      console.log('[Offscreen] 📺 Stream ended - user stopped sharing');
      notifyServiceWorker({
        type: 'CAPTURE_STATUS',
        status: 'stream_ended'
      });
      handleStopCapture();
    };

    // Notify service worker of success
    notifyServiceWorker({
      type: 'CAPTURE_STATUS',
      status: 'stream_obtained'
    });

    // Connect to LiveKit
    await connectToLiveKit(mediaStream, triggers);

    isCapturing = true;

    console.log('[Offscreen] ✅ Capture started successfully');

  } catch (error) {
    console.error('[Offscreen] ❌ Failed to start capture:', error);
    notifyServiceWorker({
      type: 'CAPTURE_ERROR',
      error: error.message
    });
    throw error;
  }
}

// Stop capture and disconnect
async function handleStopCapture() {
  try {
    console.log('[Offscreen] Stopping capture...');

    if (livekitRoom) {
      await livekitRoom.disconnect();
      livekitRoom = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    isCapturing = false;

    console.log('[Offscreen] ✅ Capture stopped');

    notifyServiceWorker({
      type: 'CAPTURE_STATUS',
      status: 'stopped'
    });

  } catch (error) {
    console.error('[Offscreen] ❌ Error stopping capture:', error);
    throw error;
  }
}

// Connect to LiveKit room
async function connectToLiveKit(stream, triggers) {
  try {
    console.log('[Offscreen] 🔌 Connecting to LiveKit...');

    // Get token from service worker
    const tokenResponse = await chrome.runtime.sendMessage({
      type: 'GET_LIVEKIT_TOKEN'
    });

    if (!tokenResponse.success) {
      throw new Error('Failed to get LiveKit token: ' + tokenResponse.error);
    }

    const token = tokenResponse.token;
    console.log('[Offscreen] ✅ Got LiveKit token');

    // LiveKit SDK is already imported at the top
    console.log('[Offscreen] ✅ LiveKit SDK loaded');

    // Create room
    livekitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution
      }
    });

    // Set up event listeners
    setupRoomEventListeners();

    // Connect to room
    console.log('[Offscreen] 🔌 Connecting to room:', LIVEKIT_CONFIG.url);
    await livekitRoom.connect(LIVEKIT_CONFIG.url, token);
    console.log('[Offscreen] ✅ Connected to LiveKit room!');

    notifyServiceWorker({
      type: 'CAPTURE_STATUS',
      status: 'connected'
    });

    // Publish video track
    const videoTrack = stream.getVideoTracks()[0];
    console.log('[Offscreen] 📹 Publishing video track...');

    await livekitRoom.localParticipant.publishTrack(videoTrack, {
      name: 'screen-share',
      source: 'screen_share',
      videoCodec: 'vp8'
    });

    console.log('[Offscreen] ✅ Video track published!');
    console.log('[Offscreen] 📊 Track info:', {
      id: videoTrack.id,
      label: videoTrack.label,
      enabled: videoTrack.enabled,
      muted: videoTrack.muted,
      readyState: videoTrack.readyState
    });

    notifyServiceWorker({
      type: 'CAPTURE_STATUS',
      status: 'publishing'
    });

    // Send initial triggers to agent with URL
    console.log('[Offscreen] 📤 Sending initial triggers and URL to agent...');

    // Get current tab URL - IMPORTANT for MCP to work
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tabs[0]?.url || '';

      console.log('[Offscreen] 📍 Current tab URL:', url);

      if (triggers && triggers.length > 0) {
        console.log('[Offscreen] 🏷️  Triggers:', triggers);
        sendDataToAgent({
          type: 'INIT_TRIGGERS',
          triggers,
          url
        });
      } else {
        // Send URL even if no triggers yet
        console.log('[Offscreen] ⚠️  No triggers, but sending URL anyway');
        sendDataToAgent({
          type: 'URL_UPDATE',
          url
        });
      }
    } catch (error) {
      console.error('[Offscreen] ❌ Failed to get tab URL:', error);
    }

  } catch (error) {
    console.error('[Offscreen] ❌ Failed to connect to LiveKit:', error);
    notifyServiceWorker({
      type: 'CAPTURE_ERROR',
      error: 'LiveKit connection failed: ' + error.message
    });
    throw error;
  }
}

// Set up LiveKit room event listeners
function setupRoomEventListeners() {
  // RoomEvent is already imported at the top

  livekitRoom.on(RoomEvent.Connected, () => {
    console.log('[Offscreen] ✅ Room Connected event');
  });

  livekitRoom.on(RoomEvent.Disconnected, () => {
    console.log('[Offscreen] ⚠️  Room Disconnected event');
    notifyServiceWorker({
      type: 'CAPTURE_STATUS',
      status: 'disconnected'
    });
  });

  livekitRoom.on(RoomEvent.Reconnecting, () => {
    console.log('[Offscreen] 🔄 Room Reconnecting...');
  });

  livekitRoom.on(RoomEvent.Reconnected, () => {
    console.log('[Offscreen] ✅ Room Reconnected');
  });

  livekitRoom.on(RoomEvent.ParticipantConnected, (participant) => {
    console.log('[Offscreen] 👤 Participant joined:', participant.identity);
  });

  // Handle incoming data messages from agent
  livekitRoom.on(RoomEvent.DataReceived, (payload, participant) => {
    try {
      const message = JSON.parse(new TextDecoder().decode(payload));
      console.log('[Offscreen] 📨 Received data from agent:', message.type);

      // Forward to service worker to handle
      notifyServiceWorker({
        type: 'AGENT_MESSAGE',
        message: message
      });
    } catch (error) {
      console.error('[Offscreen] ❌ Error handling agent data:', error);
    }
  });

  // Periodically send URL updates (in case user navigates)
  // More frequent updates for better MCP reliability
  setInterval(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tabs[0]?.url || '';
      if (url) {
        console.log('[Offscreen] 🔄 Periodic URL update:', url);
        sendDataToAgent({ type: 'URL_UPDATE', url });
      }
    } catch (error) {
      console.error('[Offscreen] ❌ URL update failed:', error);
    }
  }, 5000); // Every 5 seconds (reduced from 10 for better responsiveness)
}

// Send data to LiveKit agent
function sendDataToAgent(data) {
  if (livekitRoom && livekitRoom.localParticipant) {
    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(data));
      livekitRoom.localParticipant.publishData(payload, { reliable: true });
      console.log('[Offscreen] 📤 Sent data to agent:', data.type);
    } catch (error) {
      console.error('[Offscreen] ❌ Failed to send data to agent:', error);
    }
  } else {
    console.warn('[Offscreen] ⚠️  Cannot send data: LiveKit not connected');
  }
}

// Update triggers
function updateTriggers(triggers) {
  console.log('[Offscreen] 🔄 Updating triggers:', triggers);
  sendDataToAgent({ type: 'UPDATE_TRIGGERS', triggers });
}

// Notify service worker of events
function notifyServiceWorker(message) {
  chrome.runtime.sendMessage(message).catch(error => {
    // Service worker might not be listening, that's okay
    console.log('[Offscreen] Could not notify service worker:', error.message);
  });
}

// Handle errors
window.addEventListener('error', (event) => {
  console.error('[Offscreen] Global error:', event.error);
  notifyServiceWorker({
    type: 'CAPTURE_ERROR',
    error: event.error?.message || 'Unknown error'
  });
});

console.log('[Offscreen] ✅ Ready to handle capture requests');
