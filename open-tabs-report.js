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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDisplayUrl(url) {
  const value = String(url || "");
  return value.replace(/^chrome-extension:\/\//i, "extension://");
}

function renderRows(items) {
  rowsEl.innerHTML = "";

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td colspan=\"3\">No tabs found.</td>";
    rowsEl.appendChild(tr);
    return;
  }

  for (const item of items) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(truncate(item.title, 100))}</td>
      <td class="url">${escapeHtml(truncate(normalizeDisplayUrl(item.url), 220))}</td>
      <td>${escapeHtml(item.lastActiveAgeLabel)}</td>
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
  setStatus("Live view updated.");
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
