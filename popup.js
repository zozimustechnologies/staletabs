const staleListEl = document.getElementById("staleList");
const subtitleEl = document.getElementById("subtitle");
const feedbackEl = document.getElementById("feedback");
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

    const titleRow = document.createElement("div");
    titleRow.className = "tab-title-row";

    const title = document.createElement("p");
    title.className = "tab-title";
    title.textContent = truncate(item.title);

    const chip = document.createElement("span");
    chip.className = "stale-chip";
    chip.appendChild(document.createTextNode("STALE"));

    titleRow.appendChild(title);
    titleRow.appendChild(chip);

    const meta = document.createElement("p");
    meta.className = "tab-meta";
    meta.append(`${truncate(item.url, 45)} • `);
    const ageHighlight = document.createElement("span");
    ageHighlight.className = "tab-meta-age";
    ageHighlight.textContent = ageText;
    meta.appendChild(ageHighlight);

    tabMain.appendChild(titleRow);
    tabMain.appendChild(meta);

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
