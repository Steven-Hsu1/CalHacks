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
      executeClick(message.selector, message.coordinates, message.method, message.fallback).then(() => {
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

    case 'URL_CHANGED':
      handleURLChange(message.url, message.platform);
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
    console.log('[Background] ========================================');
    console.log('[Background] 🎬 Starting monitoring...');
    console.log('[Background] ========================================');

    if (isMonitoring) {
      console.log('[Background] ⚠️  Already monitoring');
      return;
    }

    // Get current tab if not provided
    if (!tabId) {
      console.log('[Background] 🔍 Looking for active tab...');
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tabs[0]?.id;
      console.log('[Background] 📍 Selected current tab:', tabId);
    }

    if (!tabId) {
      throw new Error('No active tab found');
    }

    currentTabId = tabId;

    // Get current tab URL for agent to use with MCP
    console.log('[Background] 🔍 Getting tab information...');
    const tab = await chrome.tabs.get(currentTabId);
    const tabUrl = tab.url || '';
    console.log('[Background] 📍 Tab URL:', tabUrl);
    console.log('[Background] 📋 Tab title:', tab.title);

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
        triggers: triggers,
        url: tabUrl  // Pass the URL to offscreen
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
    console.log('[Background] 📤 Fetching token from http://localhost:3000/token...');

    const response = await fetch('http://localhost:3000/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'content-filter',
        identity: 'extension-' + Date.now()
      })
    });

    console.log('[Background] 📥 Token server response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Background] ❌ Token server error response:', errorText);
      throw new Error(`Token server returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Background] ✅ Got LiveKit token for room:', data.room);
    console.log('[Background] 🔑 Token length:', data.token?.length || 0);
    console.log('[Background] 👤 Identity:', data.identity);
    return data.token;

  } catch (error) {
    console.error('[Background] ❌ Failed to fetch LiveKit token:', error);
    console.error('[Background] 🔧 TROUBLESHOOTING:');
    console.error('  1. Is token server running? Run: node extension/token-server.js');
    console.error('  2. Check if port 3000 is available');
    console.error('  3. Verify .env file has LIVEKIT_API_KEY and LIVEKIT_API_SECRET');
    console.error('  4. Check terminal running token-server.js for errors');
    throw error;
  }
}

// Handle messages from agent (forwarded by offscreen document)
async function handleAgentMessage(message) {
  console.log('[Background] 📨 Handling agent message:', message.type);

  switch (message.type) {
    case 'CLICK_ELEMENT':
      await executeClick(message.selector, message.coordinates, message.method, message.fallback);
      break;

    case 'TRIGGER_DETECTED':
      await incrementFilterStats();
      console.log('[Background] ⚠️  Trigger detected:', message.trigger);
      // Could show a notification here
      break;

    case 'SCROLL_NEXT':
      await executeScroll(message.scroll_type, message.selector, message.scroll_amount, message.platform);
      break;

    case 'NAVIGATE_NEXT':
      await executeNavigation(message.action, message.target, message.platform);
      break;

    default:
      console.warn('[Background] Unknown message type:', message.type);
  }
}

// Execute click on element with TikTok-specific handling
async function executeClick(selector, coordinates, method = null, fallback = null) {
  if (!currentTabId) {
    console.error('[Background] No current tab to execute click');
    return;
  }

  try {
    console.log('[Background] 👆 Executing click command...', { selector, method, fallback });

    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: (sel, coords, clickMethod, fallbackAction) => {
        console.log('[Content] Click function called:', { sel, clickMethod, fallbackAction });

        // Helper function to find and click element
        function findAndClick(selector, useSecondButton = false) {
          try {
            // Use querySelectorAll to get all matching elements
            const elements = document.querySelectorAll(selector);

            // Choose the appropriate element based on context
            let element;
            if (useSecondButton && elements.length > 1) {
              element = elements[1];  // Use second button (for TikTok down arrow)
              console.log('[Content] Using second button of', elements.length, 'found');
            } else {
              element = elements[0];  // Use first button (default)
            }

            if (element) {
              // Check if element is visible
              const rect = element.getBoundingClientRect();
              const isVisible = element.offsetParent !== null &&
                             rect.width > 0 &&
                             rect.height > 0;

              if (isVisible) {
                console.log('[Content] Found visible element:', selector);

                // Scroll into view instantly (no animation)
                element.scrollIntoView({ behavior: 'instant', block: 'center' });

                // Click immediately with minimal delay
                setTimeout(() => {
                  element.click();
                  console.log('[Content] ✅ Clicked:', selector);
                }, 10);  // Reduced to 10ms for fastest response

                return true;
              } else {
                console.log('[Content] Element found but not visible:', selector);
              }
            }
          } catch (e) {
            console.error('[Content] Error with selector:', selector, e);
          }
          return false;
        }

        // Handle TikTok next video with fallback to scroll
        if (clickMethod === 'tiktok_next_video') {
          console.log('[Content] TikTok next video navigation');

          // Try to find and click next button
          // TikTok next video button classes: TUXButton TUXButton--capsule TUXButton--medium TUXButton--secondary action-item css-16m89jc
          // IMPORTANT: Use the SECOND button with this class (it's the down arrow)
          const nextButtonSelectors = [
            'button.TUXButton.TUXButton--capsule.TUXButton--medium.TUXButton--secondary.action-item.css-16m89jc',
            sel,  // Also try the provided selector from agent
            'button[data-e2e="arrow-right"]'  // Legacy fallback
          ];

          let found = false;
          for (let i = 0; i < nextButtonSelectors.length; i++) {
            const selector = nextButtonSelectors[i];
            // Use second button for the primary TikTok selector
            const useSecond = (i === 0);  // First selector needs second button
            if (findAndClick(selector, useSecond)) {
              found = true;
              break;
            }
          }

          // If no button found, use fallback (keyboard navigation for TikTok)
          if (!found && fallbackAction === 'scroll_down') {
            console.log('[Content] No next button found, using Down Arrow key for TikTok navigation');
            // TikTok uses Down Arrow to go to next video
            const event = new KeyboardEvent('keydown', {
              key: 'ArrowDown',
              code: 'ArrowDown',
              keyCode: 40,
              which: 40,
              bubbles: true,
              cancelable: true
            });
            document.dispatchEvent(event);
            console.log('[Content] ✅ Sent Down Arrow key press');
            return { success: true, clicked: false, action: 'keyboard_navigation' };
          }

          return { success: found, clicked: found };
        }

        // Handle standard TikTok clicks (3-dots, not interested, etc.)
        if (sel) {
          console.log('[Content] Attempting to click selector:', sel);
          if (findAndClick(sel, false)) {  // Use first button for standard clicks
            console.log('[Content] ✅ Successfully clicked:', sel);
            return { success: true, clicked: true, selector: sel };
          } else {
            console.log('[Content] ⚠️  Could not find element with selector:', sel);
          }
        }

        // Try coordinates if provided
        if (coords) {
          const element = document.elementFromPoint(coords.x, coords.y);
          if (element) {
            element.click();
            return { success: true, clicked: true, method: 'coordinates' };
          }
        }

        console.log('[Content] ❌ Could not find or click element');
        return { success: false, clicked: false, error: 'Element not found' };
      },
      args: [selector, coordinates, method, fallback]
    });

    const result = results[0]?.result;
    if (result?.success) {
      if (result.action === 'scrolled') {
        console.log('[Background] ✅ Scrolled to next video (button not found)');
      } else {
        console.log('[Background] ✅ Successfully clicked element');
      }
    } else {
      console.log('[Background] ⚠️  Could not find or click element:', result?.error);
    }
  } catch (error) {
    console.error('[Background] ❌ Failed to execute click:', error);
  }
}

// Execute navigation action (AI-powered)
async function executeNavigation(action, target, platform) {
  if (!currentTabId) {
    console.error('[Background] No current tab to execute navigation');
    return;
  }

  try {
    console.log(`[Background] 🧭 Navigating: ${action} ${target} on ${platform}`);

    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: (actionType, targetValue, platformName) => {
        console.log(`[Content] Navigation: ${actionType} ${targetValue}`);

        if (actionType === 'key') {
          // Send keyboard event
          const event = new KeyboardEvent('keydown', {
            key: targetValue,
            code: targetValue,
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(event);

          // Also send keyup
          const eventUp = new KeyboardEvent('keyup', {
            key: targetValue,
            code: targetValue,
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(eventUp);

          console.log(`[Content] ✅ Sent keyboard event: ${targetValue}`);
          return { success: true, action: 'key', target: targetValue };

        } else if (actionType === 'scroll') {
          // Scroll the page
          const distance = targetValue === 'down' ? window.innerHeight : -window.innerHeight;
          window.scrollBy({
            top: distance,
            behavior: 'smooth'
          });

          console.log(`[Content] ✅ Scrolled ${targetValue}`);
          return { success: true, action: 'scroll', target: targetValue };

        } else if (actionType === 'click') {
          // Find and click element by selector
          const element = document.querySelector(targetValue);
          if (element) {
            element.click();
            console.log(`[Content] ✅ Clicked: ${targetValue}`);
            return { success: true, action: 'click', target: targetValue };
          } else {
            console.log(`[Content] ❌ Element not found: ${targetValue}`);
            return { success: false, error: 'Element not found' };
          }
        }

        return { success: false, error: 'Unknown action type' };
      },
      args: [action, target, platform]
    });

    const result = results[0]?.result;
    if (result?.success) {
      console.log(`[Background] ✅ Navigation successful: ${result.action} ${result.target}`);
    } else {
      console.log(`[Background] ⚠️  Navigation failed:`, result?.error);
    }
  } catch (error) {
    console.error('[Background] ❌ Failed to execute navigation:', error);
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

// Handle URL changes from content script
async function handleURLChange(url, platform) {
  console.log('[Background] 📍 URL changed:', url);
  console.log('[Background] 📍 Platform:', platform);

  // Only forward URL updates if we're currently monitoring
  if (!isMonitoring) {
    console.log('[Background] ⚠️  Not monitoring, ignoring URL change');
    return;
  }

  try {
    // Forward URL update to offscreen document
    await chrome.runtime.sendMessage({
      type: 'URL_UPDATE',
      url: url,
      platform: platform
    });
    console.log('[Background] ✅ URL update sent to offscreen document');
  } catch (error) {
    console.error('[Background] ❌ Failed to send URL update:', error);
    // Extension might be reloading, ignore
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
