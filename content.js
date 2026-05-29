(() => {
  // Throttle page-click activity events to avoid excessive message traffic.
  let lastSentAt = 0;

  const notifyActivity = () => {
    const now = Date.now();
    if (now - lastSentAt < 5000) {
      return;
    }

    lastSentAt = now;
    try {
      chrome.runtime.sendMessage({ type: "pageActivity", occurredAt: now });
    } catch (_err) {
      // Ignore errors if extension context is unavailable.
    }
  };

  window.addEventListener("click", notifyActivity, { capture: true, passive: true });
})();
