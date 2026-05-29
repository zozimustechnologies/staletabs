(() => {
const totalClosedEl = document.getElementById("totalClosed");
const rowsEl = document.getElementById("reportRows");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const resetBtn = document.getElementById("resetBtn");

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setStatus(text) {
  statusEl.textContent = text;
}

function renderRows(rows) {
  rowsEl.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.staleTabsClosed}</td>
    `;
    rowsEl.appendChild(tr);
  }
}

async function loadReport() {
  const result = await sendMessage("getReportData");
  if (!result.ok) {
    setStatus(`Report load failed: ${result.error || "Unknown error"}`);
    return;
  }

  totalClosedEl.textContent = String(result.totalClosed);
  renderRows(result.daily || []);
  setStatus("Report updated.");
}

// Expose for dashboard tab switching
window.loadReportData = loadReport;

refreshBtn.addEventListener("click", () => {
  loadReport().catch((err) => setStatus(String(err)));
});

resetBtn.addEventListener("click", async () => {
  const confirmed = window.confirm("Reset all stale-tab stats and tab-state history?");
  if (!confirmed) {
    return;
  }

  const result = await sendMessage("resetAllData");
  if (!result.ok) {
    setStatus(`Reset failed: ${result.error || "Unknown error"}`);
    return;
  }

  await loadReport();
  setStatus("All stats and tab history were reset.");
});

loadReport().catch((err) => {
  setStatus(`Could not load report: ${err.message || err}`);
});

})();
