/**
 * YouTube RAG Chatbot — Panel Logic
 *
 * Handles chat interactions, API calls to the backend,
 * and dynamic message rendering.
 */

(function () {
  "use strict";

  // ─────────────────────────────────────
  // State
  // ─────────────────────────────────────
  let backendUrl = "http://localhost:8000";
  let currentVideoId = null;
  let currentTitle = "YouTube Video";
  let isProcessing = false;
  let isIndexed = false;

  // DOM elements
  const chatMessages = document.getElementById("chat-messages");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const summarizeBtn = document.getElementById("summarize-btn");
  const closeBtn = document.getElementById("close-btn");
  const videoTitleEl = document.getElementById("video-title");

  // ─────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────
  function init() {
    // Load backend URL from storage
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get("backendUrl", (data) => {
        if (data.backendUrl) backendUrl = data.backendUrl;
      });
    }

    // Event listeners
    sendBtn.addEventListener("click", handleSend);
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    summarizeBtn.addEventListener("click", handleSummarize);
    closeBtn.addEventListener("click", () => {
      window.parent.postMessage({ type: "CLOSE_PANEL" }, "*");
    });

    // Listen for messages from content script
    window.addEventListener("message", handleMessage);

    // Notify content script that panel is ready
    window.parent.postMessage({ type: "PANEL_READY" }, "*");
  }

  // ─────────────────────────────────────
  // Message handling from content script
  // ─────────────────────────────────────
  function handleMessage(event) {
    if (!event.data || event.data.type !== "VIDEO_INFO") return;

    const { videoId, title } = event.data;

    if (videoId && videoId !== currentVideoId) {
      currentVideoId = videoId;
      currentTitle = title || "YouTube Video";
      isIndexed = false;

      videoTitleEl.textContent = currentTitle;
      clearChat();
      showWelcome();

      // Re-enable summarize button for new video
      summarizeBtn.disabled = false;
      summarizeBtn.querySelector("span").textContent = "Summarize Video";
    }
  }

  // ─────────────────────────────────────
  // Chat Actions
  // ─────────────────────────────────────
  async function handleSummarize() {
    if (!currentVideoId || isProcessing) return;

    clearWelcome();
    setProcessing(true);

    summarizeBtn.disabled = true;
    summarizeBtn.querySelector("span").textContent = "Indexing...";

    addMessage("system", "🔍 Fetching transcript and building index...");
    showTypingIndicator();

    try {
      const response = await fetch(`${backendUrl}/api/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: currentVideoId }),
      });

      removeTypingIndicator();

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Server error (${response.status})`);
      }

      const data = await response.json();
      isIndexed = true;

      // Show summary
      const cached = data.cached ? " (cached)" : "";
      addMessage(
        "system",
        `✅ Video indexed${cached} • ${(data.transcript_length / 1000).toFixed(1)}k chars • ${data.processing_time_ms.toFixed(0)}ms`
      );
      addMessage("assistant", formatSummary(data.summary));

      summarizeBtn.querySelector("span").textContent = "Re-summarize";
      summarizeBtn.disabled = false;
    } catch (error) {
      removeTypingIndicator();
      addMessage(
        "error",
        `❌ ${error.message}\n\nMake sure the backend is running at ${backendUrl}`
      );
      summarizeBtn.querySelector("span").textContent = "Retry Summarize";
      summarizeBtn.disabled = false;
    }

    setProcessing(false);
  }

  async function handleSend() {
    const question = userInput.value.trim();
    if (!question || isProcessing) return;

    // If not indexed yet, index first
    if (!isIndexed) {
      clearWelcome();
      addMessage("user", question);
      setProcessing(true);
      addMessage("system", "🔍 Indexing video first...");
      showTypingIndicator();

      try {
        const indexResp = await fetch(`${backendUrl}/api/index`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: currentVideoId }),
        });

        if (!indexResp.ok) {
          const error = await indexResp.json().catch(() => ({}));
          throw new Error(error.detail || `Server error (${indexResp.status})`);
        }

        isIndexed = true;
        removeTypingIndicator();
        addMessage("system", "✅ Video indexed! Answering your question...");
      } catch (error) {
        removeTypingIndicator();
        addMessage("error", `❌ Indexing failed: ${error.message}`);
        setProcessing(false);
        return;
      }
    } else {
      clearWelcome();
      addMessage("user", question);
    }

    userInput.value = "";
    setProcessing(true);
    showTypingIndicator();

    try {
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: currentVideoId,
          question: question,
        }),
      });

      removeTypingIndicator();

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Server error (${response.status})`);
      }

      const data = await response.json();
      addMessage("assistant", data.answer);
    } catch (error) {
      removeTypingIndicator();
      addMessage("error", `❌ ${error.message}`);
    }

    setProcessing(false);
    userInput.focus();
  }

  // ─────────────────────────────────────
  // UI Helpers
  // ─────────────────────────────────────
  function addMessage(type, content) {
    const msgEl = document.createElement("div");
    msgEl.className = `message ${type}`;

    // Basic markdown-like formatting
    if (type === "assistant") {
      msgEl.innerHTML = formatMarkdown(content);
    } else {
      msgEl.textContent = content;
    }

    chatMessages.appendChild(msgEl);
    scrollToBottom();
  }

  function formatSummary(text) {
    return text;
  }

  function formatMarkdown(text) {
    // Convert **bold** to <strong>
    let formatted = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Convert bullet points
    formatted = formatted.replace(/^[•\-\*]\s+(.+)/gm, "<li>$1</li>");

    // Wrap consecutive <li> in <ul>
    formatted = formatted.replace(
      /(<li>.*?<\/li>\n?)+/gs,
      (match) => `<ul>${match}</ul>`
    );

    // Convert newlines to <br> (but not inside <ul>)
    formatted = formatted.replace(
      /\n(?![<])/g,
      "<br>"
    );

    return formatted;
  }

  function showTypingIndicator() {
    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.id = "typing-indicator";
    indicator.innerHTML = `
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    `;
    chatMessages.appendChild(indicator);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById("typing-indicator");
    if (indicator) indicator.remove();
  }

  function showSkeleton() {
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton-group";
    skeleton.id = "skeleton-loading";
    skeleton.innerHTML = `
      <div class="skeleton w-full"></div>
      <div class="skeleton w-3/4"></div>
      <div class="skeleton w-full"></div>
      <div class="skeleton w-1/2"></div>
    `;
    chatMessages.appendChild(skeleton);
    scrollToBottom();
  }

  function removeSkeleton() {
    const skeleton = document.getElementById("skeleton-loading");
    if (skeleton) skeleton.remove();
  }

  function showWelcome() {
    // Only show if no messages exist
    if (chatMessages.querySelector(".message")) return;
    if (chatMessages.querySelector(".welcome-message")) return;

    const welcome = document.createElement("div");
    welcome.className = "welcome-message";
    welcome.innerHTML = `
      <div class="welcome-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="url(#wg2)"/>
          <path d="M7 9H17M7 13H14" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          <defs>
            <linearGradient id="wg2" x1="2" y1="2" x2="22" y2="22">
              <stop stop-color="#667eea"/>
              <stop offset="1" stop-color="#764ba2"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h2>Ready to chat!</h2>
      <p>Click <strong>"Summarize Video"</strong> to get started, or ask any question about this video.</p>
    `;
    chatMessages.appendChild(welcome);
  }

  function clearWelcome() {
    const welcome = chatMessages.querySelector(".welcome-message");
    if (welcome) welcome.remove();
  }

  function clearChat() {
    chatMessages.innerHTML = "";
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  function setProcessing(state) {
    isProcessing = state;
    sendBtn.disabled = state;
    userInput.disabled = state;

    if (state) {
      document.getElementById("panel-header").classList.add("processing");
    } else {
      document.getElementById("panel-header").classList.remove("processing");
    }
  }

  // ─────────────────────────────────────
  // Start
  // ─────────────────────────────────────
  init();
})();
