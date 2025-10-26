// Content script runs in webpage context
// Handles DOM queries and manipulation for all platforms

console.log('Content Filter: Content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'QUERY_DOM') {
    const result = queryDOM(message.query);
    sendResponse(result);
  }
  return true;
});

// Query DOM based on description or find "Not interested" buttons
function queryDOM(query) {
  // Common selectors for "Not interested" buttons across platforms
  const selectors = {
    youtube: [
      'button[aria-label*="Not interested"]',
      'button[aria-label*="Don\'t recommend"]',
      'ytd-menu-service-item-renderer:has-text("Not interested")',
      'tp-yt-paper-listbox #items ytd-menu-service-item-renderer',
      // YouTube Shorts specific
      'button[aria-label*="Not interested"]',
      '#menu button[aria-label*="More"]'
    ],
    instagram: [
      'button:has-text("Not Interested")',
      '[aria-label*="Not interested"]',
      'button:has-text("Hide")',
      // Instagram specific menu items
      'div[role="menuitem"]:has-text("Not interested")'
    ],
    facebook: [
      'div[aria-label*="Hide post"]',
      'span:has-text("Hide post")',
      'div[role="menuitem"]:has-text("Hide")',
      '[aria-label*="Hide"]'
    ],
    tiktok: [
      'button:has-text("Not interested")',
      '[data-e2e="browse-not-interested"]',
      'div:has-text("Not interested")',
      // TikTok menu options
      'div[role="menuitem"]:has-text("Not interested")'
    ],
    twitter: [
      'div[role="menuitem"]:has-text("Not interested")',
      '[data-testid*="notInterested"]',
      'span:has-text("Not interested in this post")'
    ],
    reddit: [
      'button:has-text("Hide")',
      'button:has-text("Not interested")',
      '[aria-label*="hide"]'
    ],
    generic: [
      'button:has-text("Not interested")',
      'button:has-text("Hide")',
      'button[aria-label*="not interested" i]',
      'div[role="button"]:has-text("Not interested")',
      '[aria-label*="hide" i]'
    ]
  };

  // Detect platform from hostname
  const hostname = window.location.hostname.toLowerCase();
  let platformSelectors = selectors.generic;

  if (hostname.includes('youtube')) {
    platformSelectors = [...selectors.youtube, ...selectors.generic];
  } else if (hostname.includes('instagram')) {
    platformSelectors = [...selectors.instagram, ...selectors.generic];
  } else if (hostname.includes('facebook')) {
    platformSelectors = [...selectors.facebook, ...selectors.generic];
  } else if (hostname.includes('tiktok')) {
    platformSelectors = [...selectors.tiktok, ...selectors.generic];
  } else if (hostname.includes('twitter') || hostname.includes('x.com')) {
    platformSelectors = [...selectors.twitter, ...selectors.generic];
  } else if (hostname.includes('reddit')) {
    platformSelectors = [...selectors.reddit, ...selectors.generic];
  }

  // Find matching elements
  const elements = [];
  const foundElements = new Set(); // Prevent duplicates

  for (const selector of platformSelectors) {
    try {
      const found = findElements(selector);
      found.forEach(el => {
        if (isVisible(el) && !foundElements.has(el)) {
          foundElements.add(el);
          elements.push({
            selector: getUniqueSelector(el),
            text: el.textContent.trim().substring(0, 100), // Limit text length
            coordinates: getElementCoordinates(el),
            platform: getPlatform(hostname)
          });
        }
      });
    } catch (error) {
      console.error(`Error with selector "${selector}":`, error);
    }
  }

  return {
    elements,
    platform: getPlatform(hostname),
    url: window.location.href,
    timestamp: Date.now()
  };
}

// Find elements with support for custom pseudo-selectors
function findElements(selector) {
  // Handle :has-text() pseudo-selector
  if (selector.includes(':has-text(')) {
    return findElementsByText(selector);
  }

  // Regular selector
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch (error) {
    return [];
  }
}

// Find elements by text content
function findElementsByText(selector) {
  const match = selector.match(/^([^:]*):has-text\("([^"]+)"\)$/);
  if (!match) return [];

  const baseSelector = match[1] || '*';
  const text = match[2];

  let elements;
  try {
    elements = document.querySelectorAll(baseSelector);
  } catch {
    elements = document.querySelectorAll('*');
  }

  return Array.from(elements).filter(el => {
    const content = el.textContent.toLowerCase();
    return content.includes(text.toLowerCase());
  });
}

// Check if element is visible
function isVisible(el) {
  if (!el) return false;

  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    rect.width > 0 &&
    rect.height > 0
  );
}

// Get unique selector for element
function getUniqueSelector(el) {
  // Try ID first
  if (el.id) {
    return `#${el.id}`;
  }

  // Try data attributes (common in modern frameworks)
  const dataAttrs = ['data-testid', 'data-e2e', 'data-id'];
  for (const attr of dataAttrs) {
    if (el.hasAttribute(attr)) {
      return `[${attr}="${el.getAttribute(attr)}"]`;
    }
  }

  // Build path with classes
  const path = [];
  let current = el;
  let depth = 0;

  while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
    let selector = current.nodeName.toLowerCase();

    // Add classes if available
    if (current.className && typeof current.className === 'string') {
      const classes = current.className
        .split(/\s+/)
        .filter(c => c && !c.match(/^(active|hover|focus)/))
        .slice(0, 3);

      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }

    // Add role attribute if present
    if (current.hasAttribute('role')) {
      selector += `[role="${current.getAttribute('role')}"]`;
    }

    // Add aria-label if present (useful for buttons)
    if (current.hasAttribute('aria-label')) {
      const label = current.getAttribute('aria-label').substring(0, 30);
      selector += `[aria-label*="${label}"]`;
    }

    path.unshift(selector);
    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
}

// Get element coordinates (center point)
function getElementCoordinates(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.left + rect.width / 2 + window.scrollX),
    y: Math.round(rect.top + rect.height / 2 + window.scrollY),
    // Also include viewport coordinates
    viewportX: Math.round(rect.left + rect.width / 2),
    viewportY: Math.round(rect.top + rect.height / 2)
  };
}

// Get platform name from hostname
function getPlatform(hostname) {
  if (hostname.includes('youtube')) return 'youtube';
  if (hostname.includes('instagram')) return 'instagram';
  if (hostname.includes('facebook')) return 'facebook';
  if (hostname.includes('tiktok')) return 'tiktok';
  if (hostname.includes('twitter') || hostname.includes('x.com')) return 'twitter';
  if (hostname.includes('reddit')) return 'reddit';
  return 'unknown';
}

// Mutation observer to detect new content
let observer = null;
let isExtensionValid = true;

// Check if extension context is still valid
function checkExtensionContext() {
  try {
    chrome.runtime.getManifest();
    return true;
  } catch (e) {
    if (!isExtensionValid) return false; // Already logged
    isExtensionValid = false;
    console.log('Content Filter: Extension context invalidated. Please refresh the page.');
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    return false;
  }
}

function startObserving() {
  if (observer) return;
  if (!checkExtensionContext()) return;

  observer = new MutationObserver((mutations) => {
    // Check if extension context is still valid
    // checkExtensionContext() already handles disconnecting if invalid
    if (!checkExtensionContext()) {
      return;
    }

    // Notify background script about DOM changes (optional, can be noisy)
    // Commenting this out to reduce noise
    /*
    try {
      chrome.runtime.sendMessage({
        type: 'DOM_CHANGED',
        mutations: mutations.length
      });
    } catch (e) {
      // Extension context invalidated
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
    */
  });

  try {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } catch (e) {
    console.error('Content Filter: Failed to start observer:', e);
  }
}

// Start observing when page is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserving);
} else {
  startObserving();
}

// Utility: Highlight element (for debugging)
window.highlightElement = function(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.style.outline = '3px solid red';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      el.style.outline = '';
    }, 3000);
  }
};

// Export query function for debugging
window.queryContentFilterDOM = queryDOM;

// ============================================================
// URL Tracking - Monitor URL changes and notify background
// ============================================================

let lastKnownURL = window.location.href;

// Track URL changes (for SPA navigation like TikTok, YouTube, Instagram)
function trackURLChanges() {
  const currentURL = window.location.href;

  if (currentURL !== lastKnownURL) {
    console.log('Content Filter: URL changed:', currentURL);
    lastKnownURL = currentURL;

    // Notify background script of URL change
    if (checkExtensionContext()) {
      try {
        chrome.runtime.sendMessage({
          type: 'URL_CHANGED',
          url: currentURL,
          platform: getPlatform(window.location.hostname)
        }).catch(error => {
          // Ignore errors if extension is reloading
          if (!error.message.includes('Extension context invalidated')) {
            console.error('Content Filter: Failed to send URL update:', error);
          }
        });
      } catch (e) {
        // Extension context invalidated, ignore
      }
    }
  }
}

// Check URL changes every 500ms (fast enough for user navigation)
setInterval(trackURLChanges, 500);

// Also track on history changes (for proper pushState/replaceState detection)
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  setTimeout(trackURLChanges, 0);
};

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  setTimeout(trackURLChanges, 0);
};

// Track on popstate (back/forward navigation)
window.addEventListener('popstate', () => {
  setTimeout(trackURLChanges, 0);
});

console.log('Content Filter: Content script initialized for', getPlatform(window.location.hostname));
console.log('Content Filter: URL tracking enabled');
