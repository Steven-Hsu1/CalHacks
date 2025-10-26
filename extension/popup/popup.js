// Storage keys
const STORAGE_KEYS = {
  TRIGGERS: 'contentFilters',
  MONITORING: 'isMonitoring',
  STATS: 'filterStats'
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadTriggers();
  await updateStatus();
  attachEventListeners();
  startStatusPolling();
});

// Load saved triggers
async function loadTriggers() {
  const { [STORAGE_KEYS.TRIGGERS]: triggers = [] } = await chrome.storage.local.get(STORAGE_KEYS.TRIGGERS);
  const list = document.getElementById('trigger-list');
  list.innerHTML = '';

  triggers.forEach((trigger, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="trigger-text">${escapeHtml(trigger)}</span>
      <button class="remove" data-index="${index}">×</button>
    `;
    list.appendChild(li);
  });

  // Attach remove handlers
  document.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', () => removeTrigger(parseInt(btn.dataset.index)));
  });
}

// Add new trigger
async function addTrigger() {
  const input = document.getElementById('trigger-input');
  const trigger = input.value.trim();

  if (!trigger) return;

  const { [STORAGE_KEYS.TRIGGERS]: triggers = [] } = await chrome.storage.local.get(STORAGE_KEYS.TRIGGERS);
  triggers.push(trigger);
  await chrome.storage.local.set({ [STORAGE_KEYS.TRIGGERS]: triggers });

  input.value = '';
  await loadTriggers();

  // Notify background script to update agent
  chrome.runtime.sendMessage({ type: 'UPDATE_TRIGGERS', triggers });
}

// Remove trigger
async function removeTrigger(index) {
  const { [STORAGE_KEYS.TRIGGERS]: triggers = [] } = await chrome.storage.local.get(STORAGE_KEYS.TRIGGERS);
  triggers.splice(index, 1);
  await chrome.storage.local.set({ [STORAGE_KEYS.TRIGGERS]: triggers });
  await loadTriggers();

  // Notify background script
  chrome.runtime.sendMessage({ type: 'UPDATE_TRIGGERS', triggers });
}

// Toggle monitoring
async function toggleMonitoring() {
  const { [STORAGE_KEYS.MONITORING]: isMonitoring = false } = await chrome.storage.local.get(STORAGE_KEYS.MONITORING);
  const newState = !isMonitoring;

  // Clear any previous errors
  hideError();

  // Show help text on first start
  if (newState) {
    showHelp();
  }

  // Send message to background script
  try {
    const response = await chrome.runtime.sendMessage({
      type: newState ? 'START_MONITORING' : 'STOP_MONITORING'
    });

    if (!response || !response.success) {
      // Show error to user
      const errorMsg = response?.error || 'Unknown error occurred';
      showError(errorMsg);
      // Reset monitoring state
      await chrome.storage.local.set({ [STORAGE_KEYS.MONITORING]: false });
    } else {
      // Success - hide help text
      hideHelp();
      await chrome.storage.local.set({ [STORAGE_KEYS.MONITORING]: newState });
    }
  } catch (error) {
    console.error('Error toggling monitoring:', error);
    showError(`Failed to ${newState ? 'start' : 'stop'} monitoring: ${error.message}`);
    await chrome.storage.local.set({ [STORAGE_KEYS.MONITORING]: false });
  }

  await updateStatus();
}

// Update status display
async function updateStatus() {
  const { [STORAGE_KEYS.MONITORING]: isMonitoring = false } = await chrome.storage.local.get(STORAGE_KEYS.MONITORING);
  const { [STORAGE_KEYS.STATS]: stats = { filtered: 0 } } = await chrome.storage.local.get(STORAGE_KEYS.STATS);

  const indicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const toggleBtn = document.getElementById('toggle-monitoring');
  const filteredCount = document.getElementById('filtered-count');

  if (isMonitoring) {
    indicator.className = 'indicator active';
    statusText.textContent = 'Monitoring Active';
    toggleBtn.textContent = 'Stop Monitoring';
    toggleBtn.classList.add('danger');
  } else {
    indicator.className = 'indicator';
    statusText.textContent = 'Monitoring Inactive';
    toggleBtn.textContent = 'Start Monitoring';
    toggleBtn.classList.remove('danger');
  }

  filteredCount.textContent = stats.filtered || 0;
}

// Attach event listeners
function attachEventListeners() {
  document.getElementById('add-trigger').addEventListener('click', addTrigger);
  document.getElementById('trigger-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) addTrigger();
  });
  document.getElementById('toggle-monitoring').addEventListener('click', toggleMonitoring);
}

// Poll status every second
function startStatusPolling() {
  setInterval(updateStatus, 1000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show error message
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Hide error message
function hideError() {
  const errorDiv = document.getElementById('error-message');
  errorDiv.style.display = 'none';
}

// Show help text
function showHelp() {
  const helpDiv = document.getElementById('help-text');
  helpDiv.style.display = 'block';
}

// Hide help text
function hideHelp() {
  const helpDiv = document.getElementById('help-text');
  helpDiv.style.display = 'none';
}
