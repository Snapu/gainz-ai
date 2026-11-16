# 06: Safe Training Summary Rebuild & Multi-Month Coach History

**What to build:** Protect historical training summaries from destructive partial wipes during rebuilds, propagate OAuth expiry cleanly so automatic token refresh runs, order summary rows chronologically, and pass multi-month history (not just 12 single-exercise rows) into AI coaching requests.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

1. **Destructive rebuild & broken auth retry:** Rebuilding monthly summaries calls `clearRows()` before `saveRows()`, so a network blip or expired token leaves the `TrainingSummary` sheet blank. Worse, `trainingSummary` repository error mapping never classifies `401`/`403` responses with `isAuthError`, defeating `retryOnAuthError` token refresh. Rebuild also appends past years after the current year instead of sorting chronologically.
2. **Truncated long-term coach history:** Each summary row represents one `(year, month, exerciseName)` tuple (~12–20 rows per month). Both the client DTO builder and server prompt assembler run `.slice(-12)` across all summary rows, discarding everything except roughly one partial month (or an older past year after an out-of-order rebuild).

## Acceptance Criteria

- [ ] `trainingSummary` Sheets repository maps HTTP `401`/`403` errors via `isAuthError` so store operations trigger automatic token refresh and retry.
- [ ] Summary rebuild loads and sorts historical and current years in ascending chronological order before writing.
- [ ] Rebuilding summaries avoids wiping existing data before replacement rows are validated and safely writable (or updates atomically/safely with error recovery so failed writes never leave an empty sheet).
- [ ] Client DTO mapping and server prompt assembly preserve the most recent *N distinct months* (e.g., up to 12 months aggregated/grouped concisely) rather than slicing the last 12 individual `(month, exercise)` rows, removing redundant double-slicing.
- [ ] Schema bounds on the DTO and prompt keep payload size safely under Edge limits even across multiple months.

## Testing Decisions

- Unit test `trainingSummary` repository `401`/`403` error classification and chronological multi-year rebuild ordering + failure safety (verifying existing summaries are not discarded if saving fails).
- Unit test DTO builder + server prompt builder parity with multi-month, multi-exercise summaries (>12 rows spanning multiple months and years) to confirm multi-month trends reach the prompt.
