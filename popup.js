const staleListEl = document.getElementById("staleList");
const subtitleEl = document.getElementById("subtitle");
const feedbackEl = document.getElementById("feedback");
const ageHighlightsEl = document.getElementById("ageHighlights");
const closeAllBtn = document.getElementById("closeAllBtn");
const undoBtn = document.getElementById("undoBtn");
const snoozeBtn = document.getElementById("snoozeBtn");

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setFeedback(text) {
  feedbackEl.textContent = text;
}

function truncate(text, maxLength = 60) {
  if (!text) {
    return "Untitled";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatHoursAndMinutes(durationMs) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourText = `${hours} hour${hours === 1 ? "" : "s"}`;
  const minuteText = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${hourText} ${minuteText}`;
}

function renderAgeHighlights(staleItems = []) {
  if (!ageHighlightsEl) {
    return;
  }

  const now = Date.now();
  const thresholds = [1, 2, 3];
  ageHighlightsEl.innerHTML = "";

  for (const threshold of thresholds) {
    const count = staleItems.filter(
      (item) => now - item.lastAccessedAt >= threshold * 3_600_000
    ).length;
    const badge = document.createElement("span");
    badge.className = `age-badge${count > 0 ? " active" : ""}`;
    badge.title = `${count} tab${count === 1 ? "" : "s"} older than ${threshold} hour${threshold === 1 ? "" : "s"}`;
    badge.innerHTML = `${threshold}h <span class="age-badge-count">${count}</span>`;
    ageHighlightsEl.appendChild(badge);
  }
}

function renderList(staleItems = []) {
  staleListEl.innerHTML = "";

  if (staleItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No stale tabs right now.";
    staleListEl.appendChild(empty);
    return;
  }

  for (const item of staleItems) {
    const ageText = formatHoursAndMinutes(Date.now() - item.lastAccessedAt);
    const li = document.createElement("li");
    li.className = "tab-item";
    li.title = `${item.staleReason} Last accessed: ${new Date(item.lastAccessedAt).toLocaleString()}.`;

    const tabMain = document.createElement("div");
    tabMain.className = "tab-main";

    const textWrap = document.createElement("div");
    const title = document.createElement("p");
    title.className = "tab-title";
    title.textContent = truncate(item.title);

    const meta = document.createElement("p");
    meta.className = "tab-meta";
    meta.textContent = `${truncate(item.url, 45)} • ${ageText}`;

    textWrap.appendChild(title);
    textWrap.appendChild(meta);

    const chip = document.createElement("span");
    chip.className = "stale-chip";
    const dot = document.createElement("span");
    dot.className = "stale-dot";
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode("STALE"));

    tabMain.appendChild(textWrap);
    tabMain.appendChild(chip);

    const actions = document.createElement("div");
    actions.className = "tab-actions";

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.type = "button";
    closeBtn.setAttribute("data-tab-id", String(item.tabId));
    closeBtn.textContent = "Close";

    actions.appendChild(closeBtn);
    li.appendChild(tabMain);
    li.appendChild(actions);

    staleListEl.appendChild(li);
  }

  staleListEl.querySelectorAll(".close-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tabId = Number(btn.getAttribute("data-tab-id"));
      await sendMessage("closeStaleTab", { tabId });
      setFeedback("Closed stale tab. You can undo from the button above.");
      await loadData();
    });
  });
}

async function loadData() {
  const data = await sendMessage("getDashboardData");
  subtitleEl.textContent = `${data.staleCount} stale tab${data.staleCount === 1 ? "" : "s"} found`;
  const staleItems = data.staleItems || [];
  renderAgeHighlights(staleItems);
  renderList(staleItems);
}

// Expose for dashboard tab switching
window.loadData = loadData;

closeAllBtn.addEventListener("click", async () => {
  const result = await sendMessage("closeAllStaleTabs", { source: "popup" });
  setFeedback(`Closed ${result.closedCount || 0} stale tabs.`);
  await loadData();
});

undoBtn.addEventListener("click", async () => {
  const result = await sendMessage("undoLastClose");
  setFeedback(`Restored ${result.restoredCount || 0} tabs.`);
  await loadData();
});

snoozeBtn.addEventListener("click", async () => {
  await sendMessage("snoozeNotifications");
  setFeedback("Reminders snoozed.");
});

loadData().catch((err) => {
  setFeedback(`Could not load data: ${err.message || err}`);
});
