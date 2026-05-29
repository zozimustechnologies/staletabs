(() => {
const totalOpenTabsEl = document.getElementById("totalOpenTabs");
const generatedAtEl = document.getElementById("generatedAt");
const rowsEl = document.getElementById("openTabsRows");
const statusEl = document.getElementById("status2") || document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn2") || document.getElementById("refreshBtn");

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setStatus(text) {
  statusEl.textContent = text;
}

function truncate(text, maxLength = 80) {
  if (!text) {
    return "";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function renderRows(items) {
  rowsEl.innerHTML = "";

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td colspan=\"7\">No open tabs found.</td>";
    rowsEl.appendChild(tr);
    return;
  }

  for (const item of items) {
    const tr = document.createElement("tr");

    const flags = [];
    if (item.pinned) {
      flags.push("pinned");
    }
    if (item.muted) {
      flags.push("muted");
    }

    const openDurationText = item.openDurationEstimated
      ? `>= ${item.openDurationLabel} (estimated)`
      : item.openDurationLabel;

    tr.innerHTML = `
      <td>${item.windowId}</td>
      <td>${truncate(item.title, 100)}</td>
      <td class="url">${truncate(item.url, 220)}</td>
      <td>${openDurationText}</td>
      <td>${item.lastActiveAgeLabel}</td>
      <td>${item.openedAt ? new Date(item.openedAt).toLocaleString() : "Unknown"}</td>
      <td>${flags.join(", ") || "-"}</td>
    `;

    rowsEl.appendChild(tr);
  }
}

async function loadReport() {
  const result = await sendMessage("getOpenTabsReportData");
  if (!result.ok) {
    setStatus(`Report load failed: ${result.error || "Unknown error"}`);
    return;
  }

  totalOpenTabsEl.textContent = String(result.totalOpenTabs || 0);
  generatedAtEl.textContent = result.generatedAt ? new Date(result.generatedAt).toLocaleTimeString() : "-";
  renderRows(result.items || []);
  setStatus("Open tabs report updated.");
}

// Expose for dashboard tab switching
window.loadOpenTabsData = loadReport;

refreshBtn.addEventListener("click", () => {
  loadReport().catch((err) => setStatus(String(err)));
});

loadReport().catch((err) => {
  setStatus(`Could not load report: ${err.message || err}`);
});

})();
