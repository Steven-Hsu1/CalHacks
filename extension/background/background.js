// Background service worker for Content Filter extension
// Coordinates offscreen document for media capture and LiveKit connection

// State management
let isMonitoring = false;
let currentTabId = null;
let offscreenDocumentPath = 'offscreen/offscreen.html';

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log('Content Filter Extension installed');
  // Initialize storage
  chrome.storage.local.set({
    isMonitoring: false,
    filterStats: { filtered: 0 }
  });
});

// Listen for messages from popup, content scripts, and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type);

  switch (message.type) {
    case 'START_MONITORING':
      handleStartMonitoring(sender.tab?.id).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('[Background] ❌ Failed to start monitoring:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep channel open for async response

    case 'STOP_MONITORING':
      handleStopMonitoring().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('[Background] ❌ Failed to stop monitoring:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'UPDATE_TRIGGERS':
      updateAgentTriggers(message.triggers).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'CLICK_ELEMENT':
      executeClick(message.selector, message.coordinates, message.tabId).then(() => {
        sendResponse({ success: true });
      });
      return true;

    // Messages from offscreen document
    case 'GET_LIVEKIT_TOKEN':
      fetchLiveKitToken().then(token => {
        sendResponse({ success: true, token });
      }).catch(error => {
        console.error('[Background] ❌ Token fetch failed:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'CAPTURE_STATUS':
      console.log('[Background] 📊 Capture status:', message.status);
      // Could update UI here
      break;

    case 'CAPTURE_ERROR':
      console.error('[Background] ❌ Capture error:', message.error);
      handleStopMonitoring();
      break;

    case 'AGENT_MESSAGE':
      handleAgentMessage(message.message);
      break;
  }

  return false;
});

// Offscreen document management
async function ensureOffscreenDocument() {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(offscreenDocumentPath)]
  });

  if (existingContexts.length > 0) {
    console.log('[Background] ✅ Offscreen document already exists');
    return;
  }

  // Create offscreen document
  console.log('[Background] 📄 Creating offscreen document...');
  await chrome.offscreen.createDocument({
    url: offscreenDocumentPath,
    reasons: ['USER_MEDIA'],
    justification: 'Recording screen to analyze content for filtering'
  });
  console.log('[Background] ✅ Offscreen document created');
}

async function closeOffscreenDocument() {
  try {
    await chrome.offscreen.closeDocument();
    console.log('[Background] ✅ Offscreen document closed');
  } catch (error) {
    // Document might not exist, that's okay
    console.log('[Background] Offscreen document already closed');
  }
}

// Start monitoring current tab
async function handleStartMonitoring(tabId) {
  try {
    console.log('[Background] 🎬 Starting monitoring...');

    if (isMonitoring) {
      console.log('[Background] ⚠️  Already monitoring');
      return;
    }

    // Get current tab if not provided
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tabs[0]?.id;
      console.log('[Background] 📍 Selected current tab:', tabId);
    }

    if (!tabId) {
      throw new Error('No active tab found');
    }

    currentTabId = tabId;

    // Using getDisplayMedia approach - no need for stream ID
    // The offscreen document will show a picker for user to select tab
    console.log('[Background] 📹 Preparing to show screen share picker...');

    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Get current triggers
    const result = await chrome.storage.local.get('contentFilters');
    const triggers = result.contentFilters || [];

    // Send capture request to offscreen document
    // Offscreen will call getDisplayMedia which shows the picker
    console.log('[Background] 📤 Sending START_CAPTURE to offscreen document...');
    console.log('[Background] 💡 User will see a picker to select which tab to monitor');

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
        triggers: triggers
      });
    } catch (error) {
      console.error('[Background] ❌ Failed to communicate with offscreen document:', error);
      throw new Error(`Could not communicate with offscreen document. Try reloading the extension. Error: ${error.message}`);
    }

    if (!response || !response.success) {
      const errorMsg = response?.error || 'Unknown error';
      console.error('[Background] ❌ Offscreen capture failed:', errorMsg);
      throw new Error(`Failed to capture tab: ${errorMsg}. This may be a permissions issue or the page may not allow capture.`);
    }

    isMonitoring = true;
    await chrome.storage.local.set({ isMonitoring: true });

    console.log('[Background] ✅ Monitoring started successfully');
  } catch (error) {
    console.error('[Background] ❌ Failed to start monitoring:', error);
    await handleStopMonitoring();
    throw error;
  }
}

// Stop monitoring
async function handleStopMonitoring() {
  console.log('[Background] 🛑 Stopping monitoring...');

  if (isMonitoring) {
    try {
      // Tell offscreen document to stop capture
      await chrome.runtime.sendMessage({
        type: 'STOP_CAPTURE'
      });
    } catch (error) {
      console.log('[Background] Could not send STOP_CAPTURE:', error.message);
    }
  }

  // Close offscreen document
  await closeOffscreenDocument();

  isMonitoring = false;
  currentTabId = null;

  await chrome.storage.local.set({ isMonitoring: false });
  console.log('[Background] ✅ Monitoring stopped');
}

// Fetch LiveKit access token from local token server
async function fetchLiveKitToken() {
  try {
    const response = await fetch('http://localhost:3000/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'content-filter',
        identity: 'extension-' + Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Token server returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Background] ✅ Got LiveKit token for room:', data.room);
    return data.token;

  } catch (error) {
    console.error('[Background] ❌ Failed to fetch LiveKit token:', error);
    console.error('Make sure the token server is running: node token-server.js');
    throw error;
  }
}

// Handle messages from agent (forwarded by offscreen document)
async function handleAgentMessage(message) {
  console.log('[Background] 📨 Handling agent message:', message.type);

  switch (message.type) {
    case 'CLICK_ELEMENT':
      await executeClick(message.selector, message.coordinates);
      break;

    case 'TRIGGER_DETECTED':
      await incrementFilterStats();
      console.log('[Background] ⚠️  Trigger detected:', message.trigger);
      // Could show a notification here
      break;

    case 'SCROLL_NEXT':
      await executeScroll(message.scroll_type, message.selector, message.scroll_amount, message.platform);
      break;

    default:
      console.warn('[Background] Unknown message type:', message.type);
  }
}

// Execute click on element
async function executeClick(selector, coordinates) {
  if (!currentTabId) {
    console.error('No current tab to execute click');
    return;
  }

  try {
    console.log('Executing click:', { selector, coordinates });

    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: (sel, coords) => {
        let element;

        if (sel) {
          element = document.querySelector(sel);
        } else if (coords) {
          element = document.elementFromPoint(coords.x, coords.y);
        }

        if (element) {
          // Scroll element into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Wait a bit for scroll, then click
          setTimeout(() => {
            element.click();
            console.log('Clicked element:', element);
          }, 300);

          return { success: true, clicked: true };
        }

        return { success: false, clicked: false, error: 'Element not found' };
      },
      args: [selector, coordinates]
    });

    console.log('Click execution result:', results[0]?.result);
  } catch (error) {
    console.error('Failed to execute click:', error);
  }
}

// Update agent triggers
async function updateAgentTriggers(triggers) {
  console.log('[Background] 🔄 Updating agent triggers:', triggers);

  if (!isMonitoring) {
    console.log('[Background] ⚠️  Not monitoring, triggers will be sent on next start');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_TRIGGERS',
      triggers: triggers
    });
    console.log('[Background] ✅ Triggers update sent to offscreen document');
  } catch (error) {
    console.error('[Background] ❌ Failed to update triggers:', error);
    throw error;
  }
}

// Execute scroll action
async function executeScroll(scrollType, selector, scrollAmount, platform) {
  if (!currentTabId) {
    console.error('No current tab to execute scroll');
    return;
  }

  try {
    console.log('Executing scroll:', { scrollType, selector, scrollAmount, platform });

    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: (type, sel, amount, plat) => {
        console.log('Scroll function called with:', { type, sel, amount, plat });

        // Platform-specific scroll logic
        if (type === 'swipe_up') {
          // TikTok, Instagram Reels - simulate swipe up
          window.scrollBy({
            top: window.innerHeight,
            behavior: 'smooth'
          });
        } else if (type === 'arrow_down') {
          // YouTube Shorts - simulate down arrow key
          const event = new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            keyCode: 40,
            which: 40,
            bubbles: true
          });
          document.dispatchEvent(event);
        } else if (type === 'scroll_down') {
          // Generic scroll
          if (typeof amount === 'number') {
            window.scrollBy({
              top: amount,
              behavior: 'smooth'
            });
          } else {
            window.scrollBy({
              top: window.innerHeight * 0.8,
              behavior: 'smooth'
            });
          }
        }

        return { success: true, scrolled: true, type };
      },
      args: [scrollType, selector, scrollAmount, platform]
    });

    console.log('Scroll execution result:', results[0]?.result);
  } catch (error) {
    console.error('Failed to execute scroll:', error);
  }
}

// Increment filter statistics
async function incrementFilterStats() {
  const result = await chrome.storage.local.get('filterStats');
  const stats = result.filterStats || { filtered: 0 };
  stats.filtered++;
  await chrome.storage.local.set({ filterStats: stats });
  console.log('Filter stats updated:', stats);
}

// Keep service worker alive
// Service workers can be terminated by the browser, this helps keep it alive
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20000);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();
