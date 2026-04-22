# Auth Expiration Handling - Design Specification

**Date:** 2026-04-23  
**Status:** Approved  
**Author:** AI Assistant + User

---

## Problem Statement

The Gainz AI app currently experiences silent auth failures when Google OAuth tokens expire:

1. **No user feedback** - API calls fail silently with no error messages
2. **Stuck loading states** - Users get trapped on loading screen when token expires during initialization
3. **Lost work** - Failed operations (logging sets, saving profile) are not retried after re-authentication
4. **Poor UX** - Users have no warning before their session expires

These issues occur because:
- Token expiration is only checked at navigation time (`isLoggedIn` computed)
- API responses don't distinguish between auth failures (401/403) and other errors
- No proactive warning system exists before token expiration

---

## Goals

1. **Prevent silent failures** - User always knows when auth expires
2. **Proactive re-authentication** - Warn users 5 minutes before expiration
3. **Graceful fallbacks** - Handle edge cases where token expires unexpectedly
4. **Preserve user work** - Failed operations automatically retry after re-login
5. **Smart routing** - Return users to appropriate location after re-authentication

---

## Solution Overview

**Approach:** Proactive expiration monitoring with graceful edge-case handling

**Key Strategy:**
- Warn users 5 minutes before token expires
- Give 30-second grace period with "Log in now" button
- Auto-redirect if user doesn't act
- Detect 401/403 from API calls as fallback
- Leverage existing Workbox offline sync for operation retries
- Use existing router logic for post-login routing

---

## Architecture

### Components

1. **Auth Expiration Watcher** (`useAuthExpirationWatcher()`)
   - Polls token expiration every 30 seconds
   - Triggers warning at 5-minute threshold
   - Manages countdown and redirect

2. **Enhanced API Error Detection** (`spreadsheets.ts` + service layer)
   - Parse HTTP 401/403 from Google Sheets API
   - Return specific "auth-failed" error type
   - Propagate through all service functions

3. **Centralized Auth Error Handler** (`useAuthErrorHandler()`)
   - Provides consistent logout + toast behavior
   - Called by stores when "auth-failed" detected
   - Reduces code duplication

4. **Toast System Enhancement** (`useToast.vue`)
   - Support persistent toasts (don't auto-dismiss)
   - Support action buttons
   - Support countdown display

5. **Logout Function** (auth store)
   - Clear access token and expiration
   - Trigger reactive cleanup in other stores
   - Router guard handles redirect automatically

### Data Flow

**Proactive Flow (99% of cases):**
```
Watcher checks expiration every 30s
  → Detects < 5 minutes remaining
  → Show persistent warning toast
  → Display 30-second countdown
  → User clicks "Log in now" OR countdown reaches 0
  → Call logout() → clear tokens
  → isLoggedIn becomes false
  → Router guard redirects to /login
  → User re-authenticates
  → Router checks setupCompleted
    → Incomplete → /wizard/fitness-goal
    → Complete → /logs
```

**Edge Case Flow (token already expired or server-side revoked):**
```
API call to Google Sheets
  → Returns 401 or 403
  → Service detects and returns "auth-failed"
  → Store catches "auth-failed"
  → Call handleAuthError() composable
  → Show error toast "Session expired"
  → Call logout() → clear tokens
  → Router guard redirects to /login
  → (Same post-login routing as above)
  
Note: Failed operations during edge case are automatically
queued by existing Workbox background sync and will retry
after successful re-authentication.
```

---

## Detailed Design

### 1. Auth Expiration Watcher

**File:** `src/composables/useAuthExpirationWatcher.ts`

**Responsibilities:**
- Monitor token expiration on interval
- Trigger warning toast at threshold
- Manage countdown timer
- Initiate logout flow

**Key Logic:**

```typescript
const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
const REDIRECT_DELAY = 30 * 1000; // 30 seconds

const authStore = useAuthStore();
const toast = useToast();
const warningActive = ref(false);
const countdownSeconds = ref(30);

// Check expiration every 30 seconds
const intervalId = setInterval(() => {
  const timeRemaining = authStore.expiresAt - Date.now();
  
  // Edge case: token already expired
  if (timeRemaining <= 0 && authStore.isLoggedIn) {
    clearInterval(intervalId);
    authStore.logout();
    return;
  }
  
  // Trigger warning at 5-minute threshold
  if (timeRemaining > 0 && 
      timeRemaining < WARNING_THRESHOLD && 
      !warningActive.value) {
    showExpirationWarning();
  }
}, 30000);

function showExpirationWarning() {
  warningActive.value = true;
  countdownSeconds.value = 30;
  
  // Show persistent toast with action button and countdown
  toast.warning("Session expiring soon, please log in again", {
    persistent: true,
    action: {
      label: "Log in now",
      onClick: handleLogout
    },
    countdown: {
      seconds: 30,
      onComplete: handleLogout
    }
  });
}

function handleLogout() {
  warningActive.value = false;
  authStore.logout();
  // Router guard will automatically redirect
}
```

**Integration:** Called once in `App.vue` so it's active throughout app lifecycle.

**Testing Strategy:**
- Mock timers for fast test execution
- Test warning triggers at correct threshold
- Test countdown behavior
- Test immediate logout on expired token
- Test cleanup on unmount

---

### 2. Enhanced API Error Detection

**File:** `src/services/spreadsheets.ts`

**Changes:**

**Current Pattern:**
```typescript
catch (error) {
  console.error("Failed to load", error);
  return err("load-spreadsheet-failed");
}
```

**Enhanced Pattern:**
```typescript
catch (error) {
  // Check for auth failures from fetch API
  if (error.status === 401 || error.status === 403) {
    console.error("Auth failed during API call", error);
    return err("auth-failed");
  }
  
  // Check for auth failures from google-spreadsheet library
  if (error.response?.status === 401 || error.response?.status === 403) {
    console.error("Auth failed during API call", error);
    return err("auth-failed");
  }
  
  // Other errors
  console.error("Failed to load", error);
  return err("load-spreadsheet-failed");
}
```

**Updated Error Types:**
```typescript
// Add "auth-failed" to error unions
getSpreadsheetId(): Result<string | null, "get-spreadsheet-id-failed" | "auth-failed">
loadSpreadsheet(): Result<GoogleSpreadsheet, "load-spreadsheet-failed" | "auth-failed">
createSpreadsheet(): Result<GoogleSpreadsheet, "create-spreadsheet-failed" | "auth-failed">
```

**Propagation to Service Layer:**

All domain services (`exercises.ts`, `exerciseLogs.ts`, `userProfile.ts`) that call spreadsheet operations must:
1. Check if error is "auth-failed"
2. Propagate it up to the store
3. Add "auth-failed" to their error union types

Example in `src/services/exercises.ts`:
```typescript
export function loadExercises(
  doc: GoogleSpreadsheet
): Result<Exercise[], "load-exercises-failed" | "auth-failed"> {
  try {
    // ... load logic
  } catch (error) {
    if (isAuthError(error)) {
      return err("auth-failed");
    }
    return err("load-exercises-failed");
  }
}
```

---

### 3. Centralized Auth Error Handler

**File:** `src/composables/useAuthErrorHandler.ts`

**Purpose:** Provide consistent logout + error message behavior across all stores.

**Implementation:**
```typescript
export function useAuthErrorHandler() {
  const authStore = useAuthStore();
  const toast = useToast();
  
  function handleAuthError() {
    toast.error("Session expired, please log in again");
    authStore.logout();
    // Router guard automatically redirects to login
  }
  
  return { handleAuthError };
}
```

**Usage in Stores:**

Example in `src/stores/spreadsheet.ts`:
```typescript
import { useAuthErrorHandler } from "@/composables/useAuthErrorHandler";

const { handleAuthError } = useAuthErrorHandler();

async function init(accessToken: string) {
  // ... existing mutex logic
  
  const idResult = await getSpreadsheetId(SPREADSHEET_NAME, accessToken);
  
  if (idResult.isErr()) {
    if (idResult.error === "auth-failed") {
      handleAuthError();
      return;
    }
    // ... existing error handling
  }
  
  // ... rest of init logic
}
```

Apply same pattern to:
- `src/stores/exercises.ts`
- `src/stores/exerciseLogs.ts`
- `src/stores/userProfile.ts`

**Benefits:**
- Single source of truth for auth error behavior
- Consistent user experience
- Easy to modify behavior in one place
- Reduces code duplication

---

### 4. Toast System Enhancement

**File:** `src/components/ui/useToast.vue`

**New Features:**

**1. Persistent Toasts:**
```typescript
interface ToastOptions {
  duration?: number; // existing
  persistent?: boolean; // new - if true, don't auto-dismiss
}
```

**2. Action Buttons:**
```typescript
interface ToastOptions {
  // ... existing
  action?: {
    label: string; // e.g., "Log in now"
    onClick: () => void;
  };
}
```

**3. Countdown Display:**
```typescript
interface ToastOptions {
  // ... existing
  countdown?: {
    seconds: number; // initial countdown value
    onComplete: () => void; // called when reaches 0
  };
}
```

**Usage Example:**
```typescript
toast.warning("Session expiring soon, please log in again", {
  persistent: true,
  action: {
    label: "Log in now",
    onClick: () => logout()
  },
  countdown: {
    seconds: 30,
    onComplete: () => logout()
  }
});
```

**Visual Behavior:**
- Persistent toast stays on screen (doesn't auto-dismiss)
- Countdown updates every second: "30s", "29s", ..., "1s"
- Action button triggers onClick handler and dismisses toast
- Countdown completion triggers onComplete and dismisses toast
- User cannot manually dismiss persistent toasts (no close button)

**Implementation Notes:**
- Use Vue's reactive `ref` for countdown value
- Use `setInterval` for countdown updates (cleared on unmount)
- Ensure countdown interval is cleaned up when toast dismissed
- Test countdown behavior with fast-forwarded timers

---

### 5. Logout Function

**File:** `src/stores/auth.ts`

**New Function:**
```typescript
function logout() {
  // Clear auth tokens
  accessToken.value = null;
  expiresAt.value = null;
  
  // isLoggedIn computed will now return false
  // Other stores will react via their watchEffect blocks
}
```

**Reactive Cleanup:**

Each store should watch auth state and clean up when logged out. This pattern already partially exists (e.g., in spreadsheet store).

Example pattern for all stores:
```typescript
watchEffect(() => {
  if (!authStore.isLoggedIn) {
    // Clear store state
    doc.value = null;
    // Or call a reset function
  }
});
```

Stores to verify/add cleanup:
- `spreadsheetStore` - clear doc
- `userProfileStore` - clear profile, reset setupCompleted
- `exercisesStore` - clear exercises list
- `exerciseLogsStore` - clear logs

**Router Integration:**

No changes needed! Existing router guard already handles redirect:
```typescript
// In router/index.ts - already exists
if (!authStore.isLoggedIn) {
  return to.path === "/" ? true : "/";
}
```

When `logout()` is called → `isLoggedIn` becomes `false` → guard redirects to `/` (login page).

**Post-Login Routing:**

Also no changes needed! Existing logic already handles smart routing:
```typescript
// In router/index.ts - already exists
if (!userProfileStore.setupCompleted) {
  return to.path.startsWith("/wizard") ? true : "/wizard/fitness-goal";
}
// Otherwise continues to /logs
```

This means:
- Incomplete setup → returns to wizard
- Complete setup → returns to logs

Perfect for our use case!

---

## Error Handling & User Feedback

### Toast Messages

**Proactive Warning (5 minutes before expiry):**
- **Type:** Warning (amber/yellow color)
- **Message:** "Session expiring soon, please log in again"
- **Action:** "Log in now" button
- **Countdown:** "30s", "29s", ..., "1s"
- **Behavior:** Persistent (doesn't auto-dismiss)
- **Dismissal:** Only via button click or countdown completion

**Edge Case (401/403 detected):**
- **Type:** Error (red color)
- **Message:** "Session expired, please log in again"
- **Behavior:** Show for 3 seconds, then auto-dismiss
- **Timing:** Shown immediately when auth failure detected
- **Redirect:** Happens automatically after showing toast

### Loading Screen Edge Case

Current behavior: User stuck indefinitely if spreadsheet initialization fails.

New behavior:
1. API call fails with 401/403
2. Service returns "auth-failed"
3. Store catches error, calls `handleAuthError()`
4. Error toast shown
5. Logout called
6. Router redirects to login

User never sees indefinite loading - they see error message and redirect.

### Error Logging

Continue existing pattern:
- Log all errors to console
- Send to Sentry for tracking
- Add context: "Auth expired during [operation]"

Example:
```typescript
console.error("Auth expired during spreadsheet initialization", error);
Sentry.captureException(error, {
  tags: { category: "auth-expiration" },
  extra: { operation: "spreadsheet-init" }
});
```

---

## Operation Retry Strategy

**Existing Infrastructure:** The app already uses Workbox background sync for offline support (via `offlineSyncedStore` utility).

**How It Works:**
1. User performs operation (add exercise log, save profile, etc.)
2. Optimistic update applied immediately (good UX)
3. API call made in background
4. If API call fails (network error, auth error, etc.):
   - Workbox queues the operation
   - Will retry when app comes online
   - Or when user returns to app

**Our Integration:**
- When 401/403 detected → operation automatically queued by Workbox
- User re-authenticates → app resumes
- Workbox retries queued operations with new valid token
- Operations succeed, user's work is preserved

**No Additional Code Needed:** Existing Workbox infrastructure already handles this! We just need to ensure auth errors are detected properly (which we're doing).

**Edge Case Consideration:** 
- If user never re-authenticates, queued operations stay in Workbox queue
- They'll be retried next time user logs in
- This is acceptable behavior (better than losing data)

---

## Testing Strategy

### Unit Tests

**1. Auth Store (`src/stores/auth.ts`)**
- ✅ Test `logout()` clears `accessToken`
- ✅ Test `logout()` clears `expiresAt`
- ✅ Test `isLoggedIn` returns `false` after logout
- ✅ Test `isLoggedIn` returns `false` when token expired

**2. Auth Expiration Watcher (`src/composables/useAuthExpirationWatcher.ts`)**
- ✅ Test warning triggers when timeRemaining < 5 minutes
- ✅ Test warning doesn't trigger when timeRemaining > 5 minutes
- ✅ Test countdown starts at 30 seconds
- ✅ Test countdown triggers logout at 0
- ✅ Test button click triggers immediate logout
- ✅ Test immediate logout when token already expired
- ✅ Test interval cleanup on unmount
- Use `vi.useFakeTimers()` for fast execution

**3. Spreadsheet Service (`src/services/spreadsheets.ts`)**
- ✅ Test 401 response returns "auth-failed"
- ✅ Test 403 response returns "auth-failed"
- ✅ Test other errors return original error codes
- ✅ Test both fetch API and google-spreadsheet errors
- Mock `fetch` and `GoogleSpreadsheet` responses

**4. Auth Error Handler (`src/composables/useAuthErrorHandler.ts`)**
- ✅ Test calls `authStore.logout()`
- ✅ Test shows error toast
- ✅ Test toast message is correct
- Mock dependencies (auth store, toast)

**5. Toast System (`src/components/ui/useToast.vue`)**
- ✅ Test persistent toast doesn't auto-dismiss
- ✅ Test action button triggers onClick handler
- ✅ Test countdown updates every second
- ✅ Test countdown triggers onComplete at 0
- ✅ Test countdown interval cleanup
- Use `vi.useFakeTimers()` for countdown tests

### Integration Tests

Not critical for initial implementation, but could add later:
- E2E test: Set token expiry → verify warning → verify redirect
- E2E test: Mock 401 response → verify error → verify redirect
- E2E test: Verify post-login routing (wizard vs. logs)

### Manual Testing Checklist

1. **Proactive warning flow:**
   - [ ] Manually set `expiresAt` to 6 minutes from now
   - [ ] Wait 1 minute → verify warning toast appears
   - [ ] Verify countdown displays correctly (30, 29, 28...)
   - [ ] Click "Log in now" button → verify redirect to login
   - [ ] Complete login → verify returns to logs

2. **Auto-redirect flow:**
   - [ ] Same setup as above
   - [ ] Don't click button, wait for countdown to reach 0
   - [ ] Verify automatic redirect to login

3. **Edge case - expired token:**
   - [ ] Set `expiresAt` to past timestamp
   - [ ] Try to log a set
   - [ ] Verify error toast appears
   - [ ] Verify redirect to login

4. **Edge case - 401 response:**
   - [ ] Mock API to return 401
   - [ ] Trigger any API operation
   - [ ] Verify error toast
   - [ ] Verify redirect to login

5. **Post-login routing - incomplete setup:**
   - [ ] Set `setupCompleted` to `false` before logout
   - [ ] Trigger logout → login flow
   - [ ] Verify redirects to wizard

6. **Post-login routing - complete setup:**
   - [ ] Set `setupCompleted` to `true` before logout
   - [ ] Trigger logout → login flow
   - [ ] Verify redirects to logs

7. **Operation retry:**
   - [ ] Go offline, log a set (optimistic update)
   - [ ] Trigger auth expiration
   - [ ] Re-login
   - [ ] Verify set eventually syncs to sheets

---

## Implementation Plan

### Phase 1: Foundation (No User-Facing Changes)

**Goal:** Build core infrastructure without changing user experience.

**Tasks:**
1. Add `logout()` function to `src/stores/auth.ts`
2. Add 401/403 detection to `src/services/spreadsheets.ts`
3. Update error types in spreadsheet service functions
4. Create `src/composables/useAuthErrorHandler.ts`
5. Write unit tests for auth store and error handler

**Verification:** Tests pass, no behavioral changes.

---

### Phase 2: Edge Case Handling

**Goal:** Handle auth failures from API calls.

**Tasks:**
1. Update `src/services/exercises.ts` to propagate "auth-failed"
2. Update `src/services/exerciseLogs.ts` to propagate "auth-failed"
3. Update `src/services/userProfile.ts` to propagate "auth-failed"
4. Update `src/stores/spreadsheet.ts` to handle "auth-failed" with error handler
5. Update `src/stores/exercises.ts` to handle "auth-failed"
6. Update `src/stores/exerciseLogs.ts` to handle "auth-failed"
7. Update `src/stores/userProfile.ts` to handle "auth-failed"
8. Verify store cleanup on logout (watchEffect blocks)
9. Write unit tests for service error propagation
10. Manual test: Mock 401 response → verify logout + redirect

**Verification:** 
- Tests pass
- Mock 401 triggers logout and redirect
- No stuck loading states

---

### Phase 3: Toast Enhancements

**Goal:** Add persistent, action, and countdown features to toast system.

**Tasks:**
1. Update `ToastOptions` interface in `src/components/ui/useToast.vue`
2. Implement persistent toast behavior (no auto-dismiss)
3. Implement action button rendering and handling
4. Implement countdown timer with reactive updates
5. Ensure countdown interval cleanup on dismiss/unmount
6. Write unit tests for toast features
7. Manual test: Verify persistent toast with button and countdown

**Verification:**
- Tests pass
- Toast stays on screen when persistent
- Button triggers onClick
- Countdown updates every second
- Countdown triggers onComplete at 0

---

### Phase 4: Proactive Warning

**Goal:** Warn users before token expires.

**Tasks:**
1. Create `src/composables/useAuthExpirationWatcher.ts`
2. Implement interval-based expiration checking (every 30s)
3. Implement warning trigger at 5-minute threshold
4. Implement 30-second countdown logic
5. Integrate warning toast with action button
6. Add watcher to `src/App.vue`
7. Write unit tests for watcher (use fake timers)
8. Manual test: Set expiry to 6 minutes → verify warning at 1 minute
9. Manual test: Verify button click triggers logout
10. Manual test: Verify countdown auto-logout at 0

**Verification:**
- Tests pass
- Warning appears 5 minutes before expiry
- Countdown works correctly
- Both manual and auto logout work
- User redirected to login

---

### Phase 5: Polish

**Goal:** Final touches and verification.

**Tasks:**
1. Add error logging context (Sentry tags)
2. Review all error messages for clarity
3. Complete manual testing checklist
4. Review code for edge cases
5. Update AGENTS.md with new patterns (if needed)
6. Documentation of new composables

**Verification:**
- All manual tests pass
- Error logging working
- Code review complete

---

## Files to Create/Modify

### New Files (2)
1. `src/composables/useAuthExpirationWatcher.ts` (~80-100 lines)
2. `src/composables/useAuthErrorHandler.ts` (~20-30 lines)

### Modified Files (11)
1. `src/stores/auth.ts` - Add logout function
2. `src/services/spreadsheets.ts` - Add 401/403 detection, update error types
3. `src/services/exercises.ts` - Propagate "auth-failed"
4. `src/services/exerciseLogs.ts` - Propagate "auth-failed"
5. `src/services/userProfile.ts` - Propagate "auth-failed"
6. `src/components/ui/useToast.vue` - Add persistent, action, countdown features
7. `src/App.vue` - Call useAuthExpirationWatcher()
8. `src/stores/spreadsheet.ts` - Handle "auth-failed" in init
9. `src/stores/exercises.ts` - Handle "auth-failed"
10. `src/stores/exerciseLogs.ts` - Handle "auth-failed"
11. `src/stores/userProfile.ts` - Handle "auth-failed"

### Test Files to Create (~5)
1. `src/stores/auth.test.ts` (if doesn't exist)
2. `src/composables/useAuthExpirationWatcher.test.ts`
3. `src/composables/useAuthErrorHandler.test.ts`
4. `src/services/spreadsheets.test.ts` (if doesn't exist)
5. `src/components/ui/useToast.test.ts` (if doesn't exist)

**Estimated Scope:**
- New code: ~400-500 lines
- Modified code: ~200-300 lines
- Test code: ~300-400 lines
- **Total: ~900-1200 lines**

---

## Success Criteria

1. ✅ **No silent failures** - User always sees error message when auth expires
2. ✅ **Proactive warnings** - User warned 5 minutes before expiration
3. ✅ **Graceful fallback** - 401/403 errors trigger logout + redirect
4. ✅ **No stuck states** - Loading screen never hangs indefinitely
5. ✅ **Preserved work** - Failed operations retry after re-login
6. ✅ **Smart routing** - Users return to appropriate location post-login
7. ✅ **Consistent UX** - All auth errors handled uniformly
8. ✅ **Well tested** - Unit tests cover critical paths

---

## Future Enhancements (Out of Scope)

These are NOT part of this implementation but could be considered later:

1. **Token refresh** - Implement OAuth refresh token flow (requires backend)
2. **Proactive token refresh** - Automatically refresh at 10 minutes remaining (no user interaction needed)
3. **Graceful degradation** - Show cached data with "offline" indicator when auth expires
4. **User-initiated logout** - Add explicit logout button in settings
5. **Session analytics** - Track auth expiration events in analytics
6. **Configurable thresholds** - Make 5-minute warning configurable
7. **Multiple auth providers** - Support non-Google auth methods

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Warning triggers too frequently | Low | Medium | Use 30-second check interval, track warning state |
| Countdown doesn't clean up properly | Medium | Low | Ensure interval cleanup on unmount, add tests |
| Toast system changes break existing toasts | Medium | Medium | Add tests, verify existing toasts still work |
| 401/403 detection misses some auth errors | Low | High | Test both fetch and google-spreadsheet error formats |
| User ignores warning, loses work | Medium | Low | Already mitigated by Workbox retry mechanism |
| Post-login routing sends user to wrong place | Low | Medium | Leverage existing router logic (already tested) |

---

## Dependencies

**External:**
- `neverthrow` - Already used for Result types
- `vue3-google-login` - Already used for OAuth
- `google-spreadsheet` - Already used for Sheets API
- Workbox - Already configured for offline sync

**Internal:**
- Existing toast system must support enhancements
- Router guard must continue working as-is
- Stores must properly watch auth state

**No new dependencies required.**

---

## Rollout Plan

**Phase 1:** Deploy with feature flag (if available)
- Monitor Sentry for errors
- Verify no performance degradation (30s interval is lightweight)
- Gather user feedback on warning UX

**Phase 2:** Enable for all users
- Monitor auth expiration events
- Track logout → re-login completion rate
- Iterate on warning message if needed

**Rollback Plan:**
- Feature is additive, not destructive
- Can disable watcher in App.vue if issues arise
- Edge case handling remains beneficial even without proactive warning

---

## Conclusion

This design provides a comprehensive solution to auth expiration handling in Gainz AI:

- **Proactive approach** prevents 99% of auth failures before they happen
- **Graceful fallbacks** catch edge cases with clear error messages
- **Minimal code changes** leverage existing infrastructure (Workbox, router)
- **Well-tested** with comprehensive unit and manual test plans
- **User-friendly** with clear warnings and automatic retries

The implementation is phased to allow incremental delivery and testing, with each phase building on the previous one. The design follows existing patterns in the codebase (neverthrow, Pinia stores, composables) and requires no new external dependencies.

**Total estimated effort:** 2-3 days for a single developer, including testing and polish.
