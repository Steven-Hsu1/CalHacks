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
      handleStartCapture(message.triggers, message.url)
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

    case 'URL_UPDATE':
      handleURLUpdate(message.url, message.platform);
      sendResponse({ success: true });
      return false;
  }
});

// Start media capture and LiveKit connection
async function handleStartCapture(triggers, url) {
  try {
    console.log('[Offscreen] Starting capture...');
    console.log('[Offscreen] 📍 Tab URL:', url);

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
    await connectToLiveKit(mediaStream, triggers, url);

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
async function connectToLiveKit(stream, triggers, url) {
  try {
    console.log('[Offscreen] 🔌 Connecting to LiveKit...');
    console.log('[Offscreen] 🔍 Debug Info:');
    console.log('  - Target URL:', LIVEKIT_CONFIG.url);
    console.log('  - Stream active:', stream.active);
    console.log('  - Video tracks:', stream.getVideoTracks().length);

    // Get token from service worker
    console.log('[Offscreen] 📤 Requesting token from background service worker...');
    const tokenResponse = await chrome.runtime.sendMessage({
      type: 'GET_LIVEKIT_TOKEN'
    });

    console.log('[Offscreen] 📥 Token response:', tokenResponse ? 'received' : 'null');

    if (!tokenResponse || !tokenResponse.success) {
      const error = tokenResponse?.error || 'No response from background service worker';
      console.error('[Offscreen] ❌ Token fetch failed:', error);
      throw new Error('Failed to get LiveKit token: ' + error);
    }

    const token = tokenResponse.token;
    console.log('[Offscreen] ✅ Got LiveKit token (length:', token?.length || 0, ')');

    if (!token) {
      throw new Error('Token is empty or undefined');
    }

    // LiveKit SDK is already imported at the top
    console.log('[Offscreen] ✅ LiveKit SDK loaded');

    // Create room
    console.log('[Offscreen] 🏗️  Creating LiveKit room instance...');
    livekitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution
      }
    });

    // Set up event listeners
    console.log('[Offscreen] 🎧 Setting up room event listeners...');
    setupRoomEventListeners();

    // Connect to room
    console.log('[Offscreen] 🔌 Connecting to room:', LIVEKIT_CONFIG.url);
    console.log('[Offscreen] ⏳ This may take a few seconds...');

    await livekitRoom.connect(LIVEKIT_CONFIG.url, token);

    console.log('[Offscreen] ✅ Connected to LiveKit room!');
    console.log('[Offscreen] 📊 Room info:', {
      name: livekitRoom.name,
      state: livekitRoom.state,
      numParticipants: livekitRoom.participants.size
    });

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

    // Wait a bit for agent to be ready, then send initial triggers with URL
    console.log('[Offscreen] ⏳ Waiting for agent to be ready...');
    setTimeout(() => {
      console.log('[Offscreen] 📤 Sending initial triggers and URL to agent...');
      console.log('[Offscreen] 📍 URL:', url);

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
    }, 2000); // Wait 2 seconds for agent to be ready

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

  // Note: Periodic URL updates disabled because offscreen documents can't access tabs
  // If user navigates to a new page, they should restart monitoring
  // TODO: Implement message passing from background script for URL updates
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

// Handle URL updates from background script
function handleURLUpdate(url, platform) {
  console.log('[Offscreen] 📍 URL updated:', url);
  console.log('[Offscreen] 📍 Platform:', platform);
  sendDataToAgent({ type: 'URL_UPDATE', url, platform });
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
