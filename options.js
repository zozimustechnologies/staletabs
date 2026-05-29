const form = document.getElementById("settingsForm");
const statusEl = document.getElementById("status");

function setStatus(text) {
  statusEl.textContent = text;
}

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setFormValues(settings) {
  document.getElementById("staleThresholdValue").value = settings.staleThresholdValue;
  document.getElementById("staleThresholdUnit").value = settings.staleThresholdUnit;
  document.getElementById("notifyWhenStaleCountExceeds").value = settings.notifyWhenStaleCountExceeds;
  document.getElementById("notifyCadenceHours").value = settings.notifyCadenceHours;
  document.getElementById("snoozeHours").value = settings.snoozeHours;
  document.getElementById("excludePinnedTabs").checked = Boolean(settings.excludePinnedTabs);
  document.getElementById("excludeMutedTabs").checked = Boolean(settings.excludeMutedTabs);
}

function getFormValues() {
  return {
    staleThresholdValue: Number(document.getElementById("staleThresholdValue").value),
    staleThresholdUnit: document.getElementById("staleThresholdUnit").value,
    notifyWhenStaleCountExceeds: Number(document.getElementById("notifyWhenStaleCountExceeds").value),
    notifyCadenceHours: Number(document.getElementById("notifyCadenceHours").value),
    snoozeHours: Number(document.getElementById("snoozeHours").value),
    excludePinnedTabs: document.getElementById("excludePinnedTabs").checked,
    excludeMutedTabs: document.getElementById("excludeMutedTabs").checked
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving...");

  const result = await sendMessage("saveSettings", { settings: getFormValues() });
  if (!result.ok) {
    setStatus(`Save failed: ${result.error || "Unknown error"}`);
    return;
  }

  setStatus("Settings saved.");
});

(async () => {
  const result = await sendMessage("getSettings");
  if (!result.ok) {
    setStatus(`Failed to load settings: ${result.error || "Unknown error"}`);
    return;
  }
  setFormValues(result.settings);
})();
