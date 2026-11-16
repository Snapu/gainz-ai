# 05: Offline Workout Logging Durability & Sync Recovery

**What to build:** Ensure logging or editing sets under poor/offline cellular conditions or expired OAuth tokens never silently drops sets—both in browser Service Worker background sync and in client optimistic store / Capacitor UI flows.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

Two gaps currently cause silent workout log loss in gyms with weak connectivity:

1. **Service Worker Background Sync ignores HTTP errors:** Because `fetch()` resolves without throwing on HTTP `401`, `403`, `429`, and `5xx` responses, `onSync` never re-queues failed Google Sheets writes once a response comes back with an HTTP error (e.g., an expired access token after >1 hour offline).
2. **Workout logging UI ignores save failures:** Saving or editing a set triggers store persistence without checking the returned `ResultAsync`. The modal closes and starts the rest timer optimistically, while failed remote writes cause the optimistic store wrapper to silently delete the just-logged set from local state (especially noticeable in Capacitor native builds without the browser Service Worker).

## Acceptance Criteria

- [ ] Service Worker background sync checks HTTP response status on replay: retryable failures (`408`, `429`, `5xx`, and `401` pending token refresh) throw to stay queued via `unshiftRequest`, rather than being dropped.
- [ ] Offline or failed set saves in the logging flow do not silently vanish after starting the rest timer—either failed saves are durably queued locally with pending-sync feedback until flushed, or save errors are awaited and surfaced cleanly before data is discarded.
- [ ] Non-retryable `4xx` validation errors are distinguished from transient connectivity and `401` auth expiry failures.
- [ ] All error paths stay typed via `neverthrow` `ResultAsync` and preserve offline-first UX while logging sets.

## Testing Decisions

- Add unit tests for Service Worker sync replay behavior on HTTP `401`, `429`, `500`, and `200` responses (mocking `fetch` and queue operations).
- Add tests at the logging store / component seam verifying that a remote save failure neither silently deletes the user's set without feedback nor pretends the sync succeeded.
