const DEFAULT_SETTINGS = {
  staleThresholdValue: 1,
  staleThresholdUnit: "hours",
  notifyWhenStaleCountExceeds: 10,
  notifyCadenceHours: 24,
  snoozeHours: 24,
  excludePinnedTabs: true,
  excludeMutedTabs: true
};

const STORAGE_KEYS = {
  settings: "settings",
  tabState: "tabState",
  events: "events",
  dailyStats: "dailyStats",
  notificationState: "notificationState",
  undoStack: "undoStack"
};

const STALE_RECHECK_ALARM = "stale-recheck";
const NOTIFY_ID = "stale-tabs-notification";
const UNDO_NOTIFY_ID = "stale-tabs-undo";
const NOTIFICATION_ICON = "icon128.png";
const MAX_UNDO_WINDOW_MS = 10_000;
const MAX_EVENTS_HISTORY_DAYS = 365;
const SUPPORTED_CONTEXT_MENU_CONTEXTS = new Set([
  "action",
  "all",
  "audio",
  "browser_action",
  "editable",
  "frame",
  "image",
  "launcher",
  "link",
  "page",
  "page_action",
  "selection",
  "video"
]);

function getNow() {
  return Date.now();
}

function getDateKey(epochMs) {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function toThresholdMs(settings) {
  const unitMs = settings.staleThresholdUnit === "hours" ? 3_600_000 : 86_400_000;
  return settings.staleThresholdValue * unitMs;
}

async function getFromStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function setInStorage(obj) {
  return chrome.storage.local.set(obj);
}

async function getSettings() {
  const { settings } = await getFromStorage([STORAGE_KEYS.settings]);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function getNotificationState() {
  const { notificationState } = await getFromStorage([STORAGE_KEYS.notificationState]);
  return (
    notificationState || {
      lastNotifiedAt: null,
      snoozedUntil: null,
      lastConditionState: "below_threshold"
    }
  );
}

async function getTabStateMap() {
  const { tabState } = await getFromStorage([STORAGE_KEYS.tabState]);
  return tabState || {};
}

function tabKey(tab) {
  return `${tab.windowId}:${tab.id}`;
}

function isTrackableTab(tab) {
  if (!tab || typeof tab.id !== "number") {
    return false;
  }
  if (!tab.url) {
    return false;
  }
  return true;
}

function isExcluded(tab, settings) {
  if (settings.excludePinnedTabs && tab.pinned) {
    return true;
  }
  const muted = Boolean(tab.mutedInfo && tab.mutedInfo.muted);
  if (settings.excludeMutedTabs && muted) {
    return true;
  }
  return false;
}

async function touchTab(tab, occurredAt = getNow()) {
  if (!isTrackableTab(tab)) {
    return;
  }

  const tabState = await getTabStateMap();
  const key = tabKey(tab);
  const current = tabState[key] || {};

  tabState[key] = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title || "Untitled",
    pinned: Boolean(tab.pinned),
    muted: Boolean(tab.mutedInfo && tab.mutedInfo.muted),
    firstSeenAt: current.firstSeenAt || occurredAt,
    firstSeenSource: current.firstSeenSource || "observed_now",
    lastAccessedAt: occurredAt,
    becameStaleAt: null,
    isStale: false
  };

  if (current.lastAccessedAt && current.lastAccessedAt > occurredAt) {
    tabState[key].lastAccessedAt = current.lastAccessedAt;
  }

  await setInStorage({ [STORAGE_KEYS.tabState]: tabState });
  await recomputeStaleAndNotify({ skipNotifications: true });
}

async function syncCurrentTabs() {
  const tabs = await chrome.tabs.query({});
  const tabState = await getTabStateMap();
  const now = getNow();
  const nextMap = {};

  for (const tab of tabs) {
    if (!isTrackableTab(tab)) {
      continue;
    }

    const key = tabKey(tab);
    const existing = tabState[key];
    const seededFirstSeenAt =
      typeof tab.lastAccessed === "number" && Number.isFinite(tab.lastAccessed) ? tab.lastAccessed : now;
    const seededFirstSeenSource =
      typeof tab.lastAccessed === "number" && Number.isFinite(tab.lastAccessed)
        ? "last_accessed_estimate"
        : "observed_now";
    nextMap[key] = {
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      title: tab.title || "Untitled",
      pinned: Boolean(tab.pinned),
      muted: Boolean(tab.mutedInfo && tab.mutedInfo.muted),
      firstSeenAt: existing?.firstSeenAt || seededFirstSeenAt,
      firstSeenSource: existing?.firstSeenSource || seededFirstSeenSource,
      lastAccessedAt: existing?.lastAccessedAt || seededFirstSeenAt,
      becameStaleAt: existing?.becameStaleAt || null,
      isStale: Boolean(existing?.isStale)
    };
  }

  await setInStorage({ [STORAGE_KEYS.tabState]: nextMap });
}

async function setActionBadge(staleCount) {
  const text = staleCount > 0 ? String(Math.min(staleCount, 999)) : "";
  await chrome.action.setBadgeBackgroundColor({ color: "#d53741" });
  await chrome.action.setBadgeText({ text });
}

async function getStaleTabs(settings) {
  const thresholdMs = toThresholdMs(settings);
  const now = getNow();
  const tabs = await chrome.tabs.query({});
  const tabState = await getTabStateMap();

  const staleTabs = [];

  for (const tab of tabs) {
    if (!isTrackableTab(tab)) {
      continue;
    }
    if (isExcluded(tab, settings)) {
      continue;
    }

    const key = tabKey(tab);
    const state = tabState[key];
    if (!state) {
      continue;
    }

    const ageMs = now - state.lastAccessedAt;
    if (ageMs >= thresholdMs) {
      staleTabs.push({
        ...state,
        ageMs,
        key
      });
    }
  }

  staleTabs.sort((a, b) => b.ageMs - a.ageMs);
  return staleTabs;
}

async function recomputeStaleAndNotify({ skipNotifications = false } = {}) {
  const settings = await getSettings();
  const thresholdMs = toThresholdMs(settings);
  const now = getNow();
  const tabs = await chrome.tabs.query({});
  const tabState = await getTabStateMap();

  let staleCount = 0;

  for (const tab of tabs) {
    if (!isTrackableTab(tab)) {
      continue;
    }

    const key = tabKey(tab);
    const state = tabState[key];
    if (!state) {
      continue;
    }

    state.url = tab.url;
    state.title = tab.title || "Untitled";
    state.pinned = Boolean(tab.pinned);
    state.muted = Boolean(tab.mutedInfo && tab.mutedInfo.muted);

    if (isExcluded(tab, settings)) {
      state.isStale = false;
      state.becameStaleAt = null;
      continue;
    }

    const ageMs = now - state.lastAccessedAt;
    const stale = ageMs >= thresholdMs;
    if (stale) {
      staleCount += 1;
      state.becameStaleAt = state.becameStaleAt || now;
    } else {
      state.becameStaleAt = null;
    }
    state.isStale = stale;
  }

  await setInStorage({ [STORAGE_KEYS.tabState]: tabState });
  await setActionBadge(staleCount);

  if (!skipNotifications) {
    await maybeNotify(staleCount, settings);
  }

  return staleCount;
}

async function maybeNotify(staleCount, settings) {
  const now = getNow();
  const notificationState = await getNotificationState();
  const threshold = settings.notifyWhenStaleCountExceeds;
  const isAbove = staleCount > threshold;
  const cadenceMs = settings.notifyCadenceHours * 3_600_000;

  if (!isAbove) {
    if (notificationState.lastConditionState !== "below_threshold") {
      notificationState.lastConditionState = "below_threshold";
      await setInStorage({ [STORAGE_KEYS.notificationState]: notificationState });
    }
    return;
  }

  const isSnoozed = notificationState.snoozedUntil && notificationState.snoozedUntil > now;
  const inCadence = notificationState.lastNotifiedAt && now - notificationState.lastNotifiedAt < cadenceMs;

  notificationState.lastConditionState = "above_threshold";

  if (isSnoozed || inCadence) {
    await setInStorage({ [STORAGE_KEYS.notificationState]: notificationState });
    return;
  }

  await chrome.notifications.create(NOTIFY_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
    title: "Too many stale tabs",
    message: `You currently have ${staleCount} stale tabs. Click to review stale tabs list.`,
    priority: 2,
    buttons: [{ title: "Close all stale tabs" }, { title: "Snooze 24h" }]
  });

  notificationState.lastNotifiedAt = now;
  notificationState.snoozedUntil = null;
  await setInStorage({ [STORAGE_KEYS.notificationState]: notificationState });
}

async function ensureAlarm() {
  await chrome.alarms.clear(STALE_RECHECK_ALARM);
  await chrome.alarms.create(STALE_RECHECK_ALARM, { periodInMinutes: 30 });
}

async function ensureContextMenus() {
  await chrome.contextMenus.removeAll();

  const preferredContexts = ["action", "page"];
  const sanitizedContexts = preferredContexts.filter((ctx) => SUPPORTED_CONTEXT_MENU_CONTEXTS.has(ctx));
  const contexts = sanitizedContexts.length > 0 ? sanitizedContexts : ["action"];

  const tryCreate = (createProps) =>
    new Promise((resolve) => {
      try {
        chrome.contextMenus.create(createProps, () => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message || "Unknown contextMenus.create error" });
            return;
          }
          resolve({ ok: true });
        });
      } catch (err) {
        resolve({ ok: false, error: String(err?.message || err) });
      }
    });

  const baseProps = {
    id: "close-all-stale-tabs",
    title: "Close all stale tabs"
  };

  let result = await tryCreate({ ...baseProps, contexts });
  if (!result.ok) {
    console.warn("Primary context menu registration failed. Retrying with action-only context.", result.error);
    result = await tryCreate({ ...baseProps, contexts: ["action"] });
  }

  if (!result.ok) {
    console.warn("Context menu registration failed after fallback.", result.error);
  }
}

async function getEvents() {
  const { events } = await getFromStorage([STORAGE_KEYS.events]);
  return events || [];
}

async function getDailyStats() {
  const { dailyStats } = await getFromStorage([STORAGE_KEYS.dailyStats]);
  return dailyStats || {};
}

async function pushEvent(event) {
  const events = await getEvents();
  const now = getNow();
  const cutoff = now - MAX_EVENTS_HISTORY_DAYS * 86_400_000;
  const nextEvents = events.filter((e) => e.occurredAt >= cutoff);
  nextEvents.push(event);
  await setInStorage({ [STORAGE_KEYS.events]: nextEvents });
}

async function bumpDailyStats(deltaTabsClosed, occurredAt) {
  const dailyStats = await getDailyStats();
  const key = getDateKey(occurredAt);
  const existing = dailyStats[key] || {
    staleTabsClosed: 0
  };

  existing.staleTabsClosed += deltaTabsClosed;
  dailyStats[key] = existing;

  await setInStorage({ [STORAGE_KEYS.dailyStats]: dailyStats });
}

async function getUndoStack() {
  const { undoStack } = await getFromStorage([STORAGE_KEYS.undoStack]);
  return undoStack || [];
}

async function setUndoStack(stack) {
  await setInStorage({ [STORAGE_KEYS.undoStack]: stack });
}

async function pruneUndoStack() {
  const stack = await getUndoStack();
  const now = getNow();
  const next = stack.filter((entry) => entry.expiresAt > now);
  await setUndoStack(next);
}

async function closeSingleTab(tab, source = "popup") {
  const occurredAt = getNow();
  const closedSnapshot = {
    url: tab.url,
    windowId: tab.windowId,
    index: tab.index,
    active: false
  };

  await chrome.tabs.remove(tab.id);

  await pushEvent({
    eventId: crypto.randomUUID(),
    type: "tab_closed_stale",
    tabId: tab.id,
    occurredAt,
    source
  });

  await bumpDailyStats(1, occurredAt);

  const undoEntry = {
    id: crypto.randomUUID(),
    createdAt: occurredAt,
    expiresAt: occurredAt + MAX_UNDO_WINDOW_MS,
    source,
    tabs: [closedSnapshot],
    tabsClosedCount: 1,
    countedInStats: true
  };

  const undoStack = await getUndoStack();
  undoStack.push(undoEntry);
  await setUndoStack(undoStack);

  await chrome.notifications.create(UNDO_NOTIFY_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
    title: "Stale tab closed",
    message: "Tab closed. Click Undo within 10 seconds to restore.",
    priority: 2,
    buttons: [{ title: "Undo" }]
  });

  await recomputeStaleAndNotify();
}

async function closeAllStaleTabs(source = "context_menu") {
  await pruneUndoStack();

  const settings = await getSettings();
  const staleTabs = await getStaleTabs(settings);
  if (staleTabs.length === 0) {
    return { closedCount: 0 };
  }

  const occurredAt = getNow();
  const snapshots = [];

  for (const stale of staleTabs) {
    try {
      const tab = await chrome.tabs.get(stale.tabId);
      snapshots.push({
        url: tab.url,
        windowId: tab.windowId,
        index: tab.index,
        active: false
      });
      await chrome.tabs.remove(tab.id);
      await pushEvent({
        eventId: crypto.randomUUID(),
        type: "bulk_close_stale",
        tabId: tab.id,
        occurredAt,
        source
      });
    } catch (_err) {
      // Ignore tabs that no longer exist.
    }
  }

  if (snapshots.length > 0) {
    await bumpDailyStats(snapshots.length, occurredAt);

    const undoStack = await getUndoStack();
    undoStack.push({
      id: crypto.randomUUID(),
      createdAt: occurredAt,
      expiresAt: occurredAt + MAX_UNDO_WINDOW_MS,
      source,
      tabs: snapshots,
      tabsClosedCount: snapshots.length,
      countedInStats: true
    });
    await setUndoStack(undoStack);

    await chrome.notifications.create(UNDO_NOTIFY_ID, {
      type: "basic",
      iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
      title: "Closed stale tabs",
      message: `Closed ${snapshots.length} stale tabs. Undo within 10 seconds.`,
      priority: 2,
      buttons: [{ title: "Undo" }]
    });
  }

  await recomputeStaleAndNotify();
  return { closedCount: snapshots.length };
}

async function undoLastClose() {
  await pruneUndoStack();
  const undoStack = await getUndoStack();
  if (undoStack.length === 0) {
    return { restoredCount: 0 };
  }

  const entry = undoStack.pop();
  await setUndoStack(undoStack);

  let restoredCount = 0;
  for (const snapshot of entry.tabs) {
    try {
      await chrome.tabs.create({
        url: snapshot.url,
        windowId: snapshot.windowId,
        index: snapshot.index,
        active: false
      });
      restoredCount += 1;
      await pushEvent({
        eventId: crypto.randomUUID(),
        type: "undo_restore",
        tabId: `restored:${restoredCount}`,
        occurredAt: getNow(),
        source: entry.source
      });
    } catch (_err) {
      // Ignore restore failures per tab.
    }
  }

  if (entry.countedInStats && restoredCount > 0) {
    await bumpDailyStats(-restoredCount, getNow());
  }

  await recomputeStaleAndNotify({ skipNotifications: true });
  return { restoredCount };
}

function formatAge(ageMs) {
  const hours = Math.floor(ageMs / 3_600_000);
  const days = Math.floor(ageMs / 86_400_000);
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h`;
}

function formatDuration(durationMs) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

async function getDashboardData() {
  const settings = await getSettings();
  const staleTabs = await getStaleTabs(settings);
  const now = getNow();

  const staleItems = staleTabs.map((tab) => ({
    tabId: tab.tabId,
    windowId: tab.windowId,
    title: tab.title,
    url: tab.url,
    lastAccessedAt: tab.lastAccessedAt,
    ageLabel: formatAge(now - tab.lastAccessedAt),
    staleReason: `Not accessed for ${formatAge(now - tab.lastAccessedAt)} (threshold ${settings.staleThresholdValue} ${settings.staleThresholdUnit}).`
  }));

  return {
    settings,
    staleCount: staleItems.length,
    staleItems
  };
}

function makeLast30DaysStats(rawDailyStats) {
  const points = [];
  const now = getNow();
  for (let i = 29; i >= 0; i -= 1) {
    const dayMs = now - i * 86_400_000;
    const key = getDateKey(dayMs);
    const row = rawDailyStats[key] || { staleTabsClosed: 0 };
    points.push({
      date: key,
      staleTabsClosed: row.staleTabsClosed
    });
  }
  return points;
}

async function getReportData() {
  const dailyStats = await getDailyStats();
  const points = makeLast30DaysStats(dailyStats);
  const totalClosed = points.reduce((sum, p) => sum + p.staleTabsClosed, 0);

  return {
    totalClosed,
    daily: points
  };
}

async function getOpenTabsReportData() {
  await syncCurrentTabs();

  const now = getNow();
  const tabs = await chrome.tabs.query({});
  const tabState = await getTabStateMap();

  const items = tabs.map((tab) => {
    const key = tabKey(tab);
    const state = tabState[key];
    const openedAt = state?.firstSeenAt || null;
    const openDurationMs = openedAt ? now - openedAt : null;
    const lastAccessedAt =
      typeof state?.lastAccessedAt === "number" && Number.isFinite(state.lastAccessedAt)
        ? state.lastAccessedAt
        : typeof tab.lastAccessed === "number" && Number.isFinite(tab.lastAccessed)
          ? tab.lastAccessed
          : null;
    const lastActiveAgeMs = lastAccessedAt ? now - lastAccessedAt : null;

    return {
      tabId: tab.id,
      windowId: tab.windowId,
      title: tab.title || "Untitled",
      url: tab.url || "",
      pinned: Boolean(tab.pinned),
      muted: Boolean(tab.mutedInfo && tab.mutedInfo.muted),
      openedAt,
      openDurationLabel: openDurationMs === null ? "Unknown" : formatDuration(openDurationMs),
      openDurationEstimated: state?.firstSeenSource === "last_accessed_estimate",
      lastAccessedAt,
      lastActiveAgeLabel: lastActiveAgeMs === null ? "Unknown" : formatDuration(lastActiveAgeMs)
    };
  });

  items.sort((a, b) => {
    const aOpened = a.openedAt || now;
    const bOpened = b.openedAt || now;
    return aOpened - bOpened;
  });

  return {
    generatedAt: now,
    totalOpenTabs: items.length,
    items
  };
}

async function saveSettings(nextSettings) {
  const sanitized = {
    ...DEFAULT_SETTINGS,
    ...nextSettings,
    staleThresholdValue: Math.max(1, Number(nextSettings.staleThresholdValue || DEFAULT_SETTINGS.staleThresholdValue)),
    notifyWhenStaleCountExceeds: Math.max(1, Number(nextSettings.notifyWhenStaleCountExceeds || DEFAULT_SETTINGS.notifyWhenStaleCountExceeds)),
    notifyCadenceHours: Math.max(1, Number(nextSettings.notifyCadenceHours || DEFAULT_SETTINGS.notifyCadenceHours)),
    snoozeHours: Math.max(1, Number(nextSettings.snoozeHours || DEFAULT_SETTINGS.snoozeHours)),
    excludePinnedTabs: Boolean(nextSettings.excludePinnedTabs),
    excludeMutedTabs: Boolean(nextSettings.excludeMutedTabs)
  };

  await setInStorage({ [STORAGE_KEYS.settings]: sanitized });
  await recomputeStaleAndNotify({ skipNotifications: true });
  return sanitized;
}

async function resetAllData() {
  await setInStorage({
    [STORAGE_KEYS.dailyStats]: {},
    [STORAGE_KEYS.events]: [],
    [STORAGE_KEYS.tabState]: {},
    [STORAGE_KEYS.undoStack]: [],
    [STORAGE_KEYS.notificationState]: {
      lastNotifiedAt: null,
      snoozedUntil: null,
      lastConditionState: "below_threshold"
    }
  });

  await syncCurrentTabs();
  await recomputeStaleAndNotify({ skipNotifications: true });
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await setInStorage({ [STORAGE_KEYS.settings]: settings });
  await ensureAlarm();
  await ensureContextMenus();
  await syncCurrentTabs();
  await recomputeStaleAndNotify({ skipNotifications: true });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await ensureContextMenus();
  await syncCurrentTabs();
  await recomputeStaleAndNotify({ skipNotifications: true });
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await touchTab(tab);
  } catch (_err) {
    // Ignore transient tab errors.
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    await touchTab(tab);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const tabState = await getTabStateMap();
  const key = `${removeInfo.windowId}:${tabId}`;
  if (tabState[key]) {
    delete tabState[key];
    await setInStorage({ [STORAGE_KEYS.tabState]: tabState });
  }
  await recomputeStaleAndNotify({ skipNotifications: true });
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  const tabs = await chrome.tabs.query({ active: true, windowId });
  if (tabs[0]) {
    await touchTab(tabs[0]);
  }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) {
    return;
  }
  try {
    const tab = await chrome.tabs.get(details.tabId);
    await touchTab(tab);
  } catch (_err) {
    // Ignore tabs that disappeared.
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "pageActivity": {
        if (typeof _sender?.tab?.id === "number") {
          await touchTab(_sender.tab, message.occurredAt || getNow());
        }
        sendResponse({ ok: true });
        break;
      }
      case "getDashboardData": {
        await syncCurrentTabs();
        await recomputeStaleAndNotify({ skipNotifications: true });
        sendResponse(await getDashboardData());
        break;
      }
      case "closeStaleTab": {
        const tab = await chrome.tabs.get(message.tabId);
        await closeSingleTab(tab, "popup");
        sendResponse({ ok: true });
        break;
      }
      case "closeAllStaleTabs": {
        const result = await closeAllStaleTabs(message.source || "popup");
        sendResponse({ ok: true, ...result });
        break;
      }
      case "undoLastClose": {
        const result = await undoLastClose();
        sendResponse({ ok: true, ...result });
        break;
      }
      case "getSettings": {
        sendResponse({ ok: true, settings: await getSettings() });
        break;
      }
      case "saveSettings": {
        sendResponse({ ok: true, settings: await saveSettings(message.settings || {}) });
        break;
      }
      case "getReportData": {
        sendResponse({ ok: true, ...(await getReportData()) });
        break;
      }
      case "getOpenTabsReportData": {
        sendResponse({ ok: true, ...(await getOpenTabsReportData()) });
        break;
      }
      case "resetAllData": {
        await resetAllData();
        sendResponse({ ok: true });
        break;
      }
      case "snoozeNotifications": {
        const settings = await getSettings();
        const notificationState = await getNotificationState();
        notificationState.snoozedUntil = getNow() + settings.snoozeHours * 3_600_000;
        await setInStorage({ [STORAGE_KEYS.notificationState]: notificationState });
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })().catch((err) => {
    sendResponse({ ok: false, error: String(err?.message || err) });
  });

  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== STALE_RECHECK_ALARM) {
    return;
  }
  await syncCurrentTabs();
  await recomputeStaleAndNotify();
  await pruneUndoStack();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "close-all-stale-tabs") {
    await closeAllStaleTabs("context_menu");
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === NOTIFY_ID) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
    await chrome.notifications.clear(NOTIFY_ID);
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId === NOTIFY_ID) {
    if (buttonIndex === 0) {
      await closeAllStaleTabs("notification");
    } else if (buttonIndex === 1) {
      const settings = await getSettings();
      const notificationState = await getNotificationState();
      notificationState.snoozedUntil = getNow() + settings.snoozeHours * 3_600_000;
      await setInStorage({ [STORAGE_KEYS.notificationState]: notificationState });
    }
    await chrome.notifications.clear(NOTIFY_ID);
    return;
  }

  if (notificationId === UNDO_NOTIFY_ID && buttonIndex === 0) {
    await undoLastClose();
    await chrome.notifications.clear(UNDO_NOTIFY_ID);
  }
});
