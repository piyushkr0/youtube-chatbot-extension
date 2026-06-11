/**
 * YouTube RAG Chatbot — Popup (Settings) Logic
 */

(function () {
  "use strict";

  const backendUrlInput = document.getElementById("backend-url");
  const saveBtn = document.getElementById("save-btn");
  const testBtn = document.getElementById("test-btn");
  const statusIndicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");

  // Load saved settings
  chrome.storage.local.get(["backendUrl", "isConnected"], (data) => {
    backendUrlInput.value = data.backendUrl || "http://localhost:8000";
    updateStatus(data.isConnected ? "connected" : "disconnected");

    // Auto-check on open
    checkHealth(backendUrlInput.value);
  });

  // Save button
  saveBtn.addEventListener("click", () => {
    const url = backendUrlInput.value.trim().replace(/\/+$/, "");
    if (!url) return;

    chrome.storage.local.set({ backendUrl: url }, () => {
      // Visual feedback
      saveBtn.textContent = "Saved!";
      setTimeout(() => {
        saveBtn.textContent = "Save";
      }, 1500);

      checkHealth(url);
    });
  });

  // Test connection
  testBtn.addEventListener("click", () => {
    const url = backendUrlInput.value.trim().replace(/\/+$/, "");
    if (!url) return;
    checkHealth(url);
  });

  // Enter to save
  backendUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      saveBtn.click();
    }
  });

  async function checkHealth(url) {
    updateStatus("checking", "Checking...");

    try {
      const response = await fetch(`${url}/api/health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        updateStatus(
          "connected",
          `Connected (${data.active_sessions} sessions)`
        );
        chrome.storage.local.set({ isConnected: true });
      } else {
        updateStatus("disconnected", `Error: HTTP ${response.status}`);
        chrome.storage.local.set({ isConnected: false });
      }
    } catch (error) {
      updateStatus("disconnected", "Cannot reach backend");
      chrome.storage.local.set({ isConnected: false });
    }
  }

  function updateStatus(state, text) {
    statusIndicator.className = `status-indicator ${state}`;
    if (text) statusText.textContent = text;
    else {
      switch (state) {
        case "connected":
          statusText.textContent = "Connected";
          break;
        case "disconnected":
          statusText.textContent = "Disconnected";
          break;
        case "checking":
          statusText.textContent = "Checking...";
          break;
      }
    }
  }
})();
