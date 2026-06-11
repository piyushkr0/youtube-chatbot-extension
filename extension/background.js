/**
 * YouTube RAG Chatbot — Background Service Worker
 * 
 * Manages extension badge state and stores backend URL in chrome.storage.
 */

// Default backend URL
const DEFAULT_BACKEND_URL = "http://localhost:8000";

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    backendUrl: DEFAULT_BACKEND_URL,
    isConnected: false,
  });

  // Check backend connection
  checkBackendHealth(DEFAULT_BACKEND_URL);
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_HEALTH") {
    const url = message.backendUrl || DEFAULT_BACKEND_URL;
    checkBackendHealth(url)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ healthy: false, error: err.message }));
    return true; // Keep the channel open for async response
  }

  if (message.type === "GET_BACKEND_URL") {
    chrome.storage.local.get("backendUrl", (data) => {
      sendResponse({ backendUrl: data.backendUrl || DEFAULT_BACKEND_URL });
    });
    return true;
  }
});

// Health check function
async function checkBackendHealth(url) {
  try {
    const response = await fetch(`${url}/api/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      const data = await response.json();
      chrome.storage.local.set({ isConnected: true });
      updateBadge(true);
      return { healthy: true, data: data };
    } else {
      chrome.storage.local.set({ isConnected: false });
      updateBadge(false);
      return { healthy: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    chrome.storage.local.set({ isConnected: false });
    updateBadge(false);
    return { healthy: false, error: error.message };
  }
}

// Update extension badge
function updateBadge(connected) {
  if (connected) {
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
  } else {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
  }
}
