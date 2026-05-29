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

function toSafeHref(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }
  if (/^(javascript|data):/i.test(value)) {
    return "";
  }
  return value;
}

function renderRows(items) {
  rowsEl.innerHTML = "";

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td colspan=\"6\">No tabs found.</td>";
    rowsEl.appendChild(tr);
    return;
  }

  for (const item of items) {
    const tr = document.createElement("tr");

    const openDurationText = item.openDurationEstimated
      ? `>= ${item.openDurationLabel} (estimated)`
      : item.openDurationLabel;
    const safeHref = toSafeHref(item.url);
    const displayUrl = escapeHtml(truncate(item.url, 220));
    const urlCell = safeHref
      ? `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">${displayUrl}</a>`
      : displayUrl;
    const openedAtText = item.openedAt ? new Date(item.openedAt).toLocaleString() : "Unknown";

    tr.innerHTML = `
      <td>${escapeHtml(item.windowId)}</td>
      <td>${escapeHtml(truncate(item.title, 100))}</td>
      <td class="url">${urlCell}</td>
      <td>${escapeHtml(openDurationText)}</td>
      <td>${escapeHtml(item.lastActiveAgeLabel)}</td>
      <td>${escapeHtml(openedAtText)}</td>
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
