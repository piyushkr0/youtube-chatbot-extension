/**
 * YouTube RAG Chatbot — Content Script
 * 
 * Injected into YouTube video pages.
 * Handles: detecting video navigation, injecting the FAB button,
 * creating the chat panel iframe, and extracting video metadata.
 */

(function () {
  "use strict";

  // Prevent double-injection
  if (window.__ytRagChatbotInjected) return;
  window.__ytRagChatbotInjected = true;

  let currentVideoId = null;
  let panelIframe = null;
  let fabButton = null;
  let isPanelOpen = false;
  let overlay = null;

  // ─────────────────────────────────────
  // Video ID extraction
  // ─────────────────────────────────────
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("v");
  }

  function getVideoTitle() {
    const titleEl =
      document.querySelector(
        "yt-formatted-string.style-scope.ytd-watch-metadata"
      ) ||
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("#title h1 yt-formatted-string") ||
      document.querySelector("h1.title");
    return titleEl ? titleEl.textContent.trim() : "YouTube Video";
  }

  // ─────────────────────────────────────
  // Floating Action Button (FAB)
  // ─────────────────────────────────────
  function createFAB() {
    if (fabButton) return;

    fabButton = document.createElement("div");
    fabButton.id = "yt-rag-fab";
    fabButton.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/>
        <path d="M7 9H17M7 13H14" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `;

    // Styles for the FAB
    Object.assign(fabButton.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      width: "56px",
      height: "56px",
      borderRadius: "16px",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      zIndex: "9999",
      boxShadow: "0 4px 20px rgba(102, 126, 234, 0.5)",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      border: "none",
      outline: "none",
    });

    fabButton.addEventListener("mouseenter", () => {
      fabButton.style.transform = "scale(1.1)";
      fabButton.style.boxShadow = "0 6px 28px rgba(102, 126, 234, 0.7)";
    });

    fabButton.addEventListener("mouseleave", () => {
      fabButton.style.transform = "scale(1)";
      fabButton.style.boxShadow = "0 4px 20px rgba(102, 126, 234, 0.5)";
    });

    fabButton.addEventListener("click", togglePanel);
    document.body.appendChild(fabButton);
  }

  // ─────────────────────────────────────
  // Overlay (dim background when panel open)
  // ─────────────────────────────────────
  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "yt-rag-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      background: "rgba(0, 0, 0, 0.4)",
      zIndex: "9998",
      opacity: "0",
      transition: "opacity 0.3s ease",
      pointerEvents: "none",
    });
    overlay.addEventListener("click", () => togglePanel(false));
    document.body.appendChild(overlay);
  }

  function showOverlay() {
    if (!overlay) createOverlay();
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";
  }

  function hideOverlay() {
    if (overlay) {
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
    }
  }

  // ─────────────────────────────────────
  // Chat Panel (iframe)
  // ─────────────────────────────────────
  function createPanel() {
    if (panelIframe) return;

    panelIframe = document.createElement("iframe");
    panelIframe.id = "yt-rag-panel";
    panelIframe.src = chrome.runtime.getURL("panel.html");

    Object.assign(panelIframe.style, {
      position: "fixed",
      top: "0",
      right: "-420px",
      width: "400px",
      height: "100vh",
      border: "none",
      zIndex: "10000",
      transition: "right 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      boxShadow: "-4px 0 30px rgba(0, 0, 0, 0.5)",
      borderRadius: "16px 0 0 16px",
    });

    // Listen for messages from the panel
    window.addEventListener("message", handlePanelMessage);
    document.body.appendChild(panelIframe);
  }

  function togglePanel(forceState) {
    const shouldOpen =
      typeof forceState === "boolean" ? forceState : !isPanelOpen;

    if (shouldOpen) {
      if (!panelIframe) createPanel();
      if (!overlay) createOverlay();

      // Slight delay to let the iframe render before animating
      requestAnimationFrame(() => {
        panelIframe.style.right = "0";
        showOverlay();
        isPanelOpen = true;

        // Send video info to the panel once it's ready
        setTimeout(() => {
          sendVideoInfoToPanel();
        }, 300);
      });

      // Update FAB icon to "close"
      fabButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6L18 18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      `;
    } else {
      if (panelIframe) panelIframe.style.right = "-420px";
      hideOverlay();
      isPanelOpen = false;

      // Restore FAB icon
      fabButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/>
          <path d="M7 9H17M7 13H14" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      `;
    }
  }

  function sendVideoInfoToPanel() {
    if (!panelIframe || !panelIframe.contentWindow) return;

    const videoId = getVideoId();
    const title = getVideoTitle();

    panelIframe.contentWindow.postMessage(
      {
        type: "VIDEO_INFO",
        videoId: videoId,
        title: title,
      },
      "*"
    );
  }

  // ─────────────────────────────────────
  // Message handling from panel
  // ─────────────────────────────────────
  function handlePanelMessage(event) {
    if (!event.data || !event.data.type) return;

    switch (event.data.type) {
      case "CLOSE_PANEL":
        togglePanel(false);
        break;
      case "PANEL_READY":
        sendVideoInfoToPanel();
        break;
    }
  }

  // ─────────────────────────────────────
  // Navigation detection (YouTube SPA)
  // ─────────────────────────────────────
  function onVideoChange() {
    const newVideoId = getVideoId();
    if (!newVideoId) {
      // Not on a video page
      if (fabButton) fabButton.style.display = "none";
      if (isPanelOpen) togglePanel(false);
      return;
    }

    if (fabButton) fabButton.style.display = "flex";

    if (newVideoId !== currentVideoId) {
      currentVideoId = newVideoId;

      // Notify the panel of the new video
      if (isPanelOpen) {
        sendVideoInfoToPanel();
      }
    }
  }

  // ─────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────
  function init() {
    currentVideoId = getVideoId();
    if (!currentVideoId) return;

    createFAB();
    createOverlay();

    // YouTube SPA navigation events
    document.addEventListener("yt-navigate-finish", onVideoChange);

    // Also observe URL changes via popstate
    window.addEventListener("popstate", onVideoChange);

    // Poll for URL changes as a fallback (YouTube doesn't always fire events)
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        onVideoChange();
      }
    }, 1000);
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
