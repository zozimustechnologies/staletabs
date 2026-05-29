# Stale Tabs Extension Spec (Edge)

## 1. Objective
Help users reduce tab clutter by detecting stale tabs, notifying users when stale-tab volume is high, enabling one-click cleanup, and reporting cleanup impact over time.

## 2. Scope
- Platform: Microsoft Edge browser extension.
- Data storage: Local only (no backend, no external database).
- Time basis: User-local time.

## 3. Definitions
- Tab Access Event: Any of the following updates the tab's "last accessed" timestamp:
  - Tab becomes active/focused.
  - User clicks inside the page.
  - Page load/reload/navigation completes.
- Stale Tab: A tab whose current age since last access is greater than or equal to a configurable threshold.
- Default stale threshold: 3 days.
- Stale-notification threshold: More than 10 stale tabs.

## 4. Functional Requirements

### FR-1: Stale Detection Engine
- The extension must track per-tab last-accessed timestamps.
- On startup and periodically, the extension must recompute stale status for all open tabs.
- A tab is marked stale when age >= stale threshold.

Acceptance Criteria:
- New tabs are not stale at creation.
- If stale threshold is changed in settings, stale status is recomputed immediately.
- On browser restart, stale status recomputes on startup.

### FR-2: High-Stale Count Notification
- When stale-tab count exceeds 10, show a popup notification.
- Notification cadence: At most once per 24 hours while condition remains true.
- Notification actions:
  - Review stale tabs list.
  - Close all stale tabs.
  - Snooze reminders.
- Snooze default: 24 hours.

Acceptance Criteria:
- Notification does not reappear within the suppression window (24h or snooze duration).
- If stale count drops to <= 10 and later exceeds 10 again, eligibility resets for future notification.

### FR-3: Configurable Stale Definition Settings Page
- Provide a dedicated extension settings page (not only browser native settings).
- User-configurable fields:
  - Stale threshold value and unit (hours or days).
  - Notification count threshold (default 10).
  - Notification cadence (default once per day).
  - Snooze default duration (default 24h).
- Settings changes must persist locally and apply immediately.

Acceptance Criteria:
- Settings persist across browser restarts.
- Invalid values are prevented with inline validation.

### FR-4: Stale Tab Visual Indication + Quick Action
- Show stale indication where supported:
  - In extension popup stale-tab list (required).
  - On browser tab UI if technically possible (best effort).
- Indicator style preference:
  - Red dot.
  - "STALE" text label.
  - Visual highlight (tab color cue where possible).
- On hover of stale indicator, show tooltip with:
  - Why tab is stale.
  - Last accessed timestamp.
  - Action to close the tab.

Acceptance Criteria:
- Each stale tab in popup list clearly shows stale state and last accessed age.
- User can close an individual stale tab from hover/context action.

### FR-5: Right-Click Action - Close All Stale Tabs
- Add context menu command: "Close all stale tabs".
- Apply across all open browser windows.
- Close behavior: immediate close + 10-second undo snackbar in extension UI.

Acceptance Criteria:
- Trigger closes all currently stale tabs across open windows.
- Undo restores recently closed tabs initiated by this action if invoked within 10 seconds.

### FR-6: 30-Day Cleanup Report
- Provide an in-extension report page showing stale-tab cleanup outcomes for last 30 days.
- Required metrics:
  - Total stale tabs closed (last 30 days).
  - Daily trend table/chart (30-day window).
- Include control: "Reset all stale-tab stats".

Acceptance Criteria:
- Report updates immediately after close actions.
- Date filtering always reflects rolling last 30 days.

### FR-7: Local Data Storage
- All tracking, settings, and report data must be local to the extension.
- Recommended storage:
  - `chrome.storage.local` / `browser.storage.local` for settings and aggregates.
  - In-memory cache for active session computations.
- No network calls for analytics or persistence.

Acceptance Criteria:
- Extension functions with network disabled.
- No remote endpoint configuration is required.

## 5. Data Model (Local)

### settings
- staleThresholdValue: number (default 3)
- staleThresholdUnit: "hours" | "days" (default "days")
- notifyWhenStaleCountExceeds: number (default 10)
- notifyCadenceHours: number (default 24)
- snoozeHours: number (default 24)

### tabState (keyed by tabId/session key)
- tabId: number | string
- windowId: number
- url: string
- title: string
- lastAccessedAt: epoch_ms
- becameStaleAt: epoch_ms | null
- isStale: boolean

### events
- eventId: string
- type: "tab_closed_stale" | "bulk_close_stale" | "undo_restore"
- tabId: number | string
- occurredAt: epoch_ms
- source: "context_menu" | "popup" | "indicator_action" | "notification"

### dailyStats (keyed by yyyy-mm-dd)
- date: string
- staleTabsClosed: number

### notificationState
- lastNotifiedAt: epoch_ms | null
- snoozedUntil: epoch_ms | null
- lastConditionState: "below_threshold" | "above_threshold"

## 6. UX Flows

### Flow A: Tab Becomes Stale
1. Engine computes stale status.
2. Tab marked stale and indicator updated.
3. User hovers indicator and sees tooltip details + close option.

### Flow B: High-Stale Notification
1. Stale count crosses threshold (>10).
2. If not snoozed and cadence allows, show notification popup.
3. User chooses Review, Close All, or Snooze.

### Flow C: Bulk Close + Undo
1. User runs "Close all stale tabs" from right-click context menu.
2. Extension closes all stale tabs across open windows.
3. Snackbar appears for 10 seconds with Undo.
4. If Undo clicked in time, tabs are restored and stats adjusted.

### Flow D: Reporting
1. User opens report page.
2. Extension aggregates events from rolling 30-day window.
3. Show totals and daily trend.

## 7. Non-Functional Requirements
- Performance:
  - Recompute must be lightweight and avoid UI jank.
  - Event writes should be batched where safe.
- Reliability:
  - Handles browser restart and tab-id churn safely.
- Privacy:
  - Local-only storage; no telemetry upload by default.
- Accessibility:
  - Indicator and actions must be keyboard reachable.
  - Tooltip and status text should be screen-reader friendly.

## 8. Edge Cases
- Tab URL unavailable or restricted.
- Restored session tabs with missing history.
- Tabs closed externally before action completes.
- Clock/timezone changes affecting stale calculations.
- Large tab counts (100+).

## 9. Out of Scope (for v1)
- Cloud sync across devices.
- Team/shared analytics dashboard.
- ML-based stale prediction.

## 10. Finalized Product Decisions
1. Exclusions:
  - Exclude pinned and muted tabs.
2. Indicator fallback:
  - Badge count + popup list indicator.
3. Undo restore model:
  - Global restore stack across all windows.
4. Reset behavior:
  - Reset report stats and tab-state history.

## 11. Implementation Notes (Suggested)
- Use browser event listeners for:
  - tab activation, update/navigation, removal, window focus changes, and alarms.
- Use periodic alarm for stale recomputation and notification eligibility checks.
- Keep rolling events and prune only if user later opts for retention limit; current preference is to retain until manual reset.
