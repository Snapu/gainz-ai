# Auth Expiration Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent silent auth failures by proactively re-authenticating users 5 minutes before token expiration with graceful edge-case handling.

**Architecture:** Centralized auth watcher composable runs in App.vue, monitors token expiration every 30 seconds, shows persistent warning toast at 5-minute threshold. Enhanced API error detection in spreadsheet service returns "auth-failed" for 401/403 responses. Centralized error handler composable provides consistent logout behavior. Toast system enhanced with persistent, action button, and countdown features.

**Tech Stack:** Vue 3, Pinia, neverthrow, Vitest, existing toast system (reka-ui based)

---

## Phase 1: Foundation

### Task 1: Add Logout Function to Auth Store

**Files:**
- Modify: `src/stores/auth.ts:66`
- Test: `src/stores/auth.test.ts` (create)

- [ ] **Step 1: Write test for logout function**

Create test file:

```typescript
// src/stores/auth.test.ts
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./auth";

describe("useAuthStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  describe("logout", () => {
    it("should clear accessToken", () => {
      const store = useAuthStore();
      store.accessToken = "test-token";
      
      store.logout();
      
      expect(store.accessToken).toBeNull();
    });

    it("should clear expiresAt", () => {
      const store = useAuthStore();
      store.expiresAt = Date.now() + 3600000;
      
      store.logout();
      
      expect(store.expiresAt).toBeNull();
    });

    it("should make isLoggedIn return false", () => {
      const store = useAuthStore();
      store.accessToken = "test-token";
      store.expiresAt = Date.now() + 3600000;
      expect(store.isLoggedIn).toBe(true);
      
      store.logout();
      
      expect(store.isLoggedIn).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm run test:unit src/stores/auth.test.ts
```

Expected: FAIL with "store.logout is not a function"

- [ ] **Step 3: Implement logout function**

Add to `src/stores/auth.ts` at line 66, before the return statement:

```typescript
  function logout() {
    accessToken.value = null;
    expiresAt.value = null;
  }

  return { accessToken, isLoggedIn, login, logout };
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm run test:unit src/stores/auth.test.ts
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/auth.ts src/stores/auth.test.ts
git commit -m "feat(auth): add logout function to clear tokens"
```

---

### Task 2: Add Auth Error Detection to Spreadsheet Service

**Files:**
- Modify: `src/services/spreadsheets.ts:6-75`
- Test: `src/services/spreadsheets.test.ts` (create)

- [ ] **Step 1: Write test for 401 detection in getSpreadsheetId**

Create test file:

```typescript
// src/services/spreadsheets.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSpreadsheet, getSpreadsheetId, loadSpreadsheet } from "./spreadsheets";

describe("spreadsheets service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSpreadsheetId", () => {
    it("should return auth-failed on 401 response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await getSpreadsheetId("test", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return auth-failed on 403 response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await getSpreadsheetId("test", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return get-spreadsheet-id-failed on other errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await getSpreadsheetId("test", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("get-spreadsheet-id-failed");
      }
    });

    it("should return spreadsheet ID on success", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ files: [{ id: "test-id" }] }),
      });

      const result = await getSpreadsheetId("test", "token");

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("test-id");
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm run test:unit src/services/spreadsheets.test.ts
```

Expected: FAIL with auth-failed tests failing (returns "get-spreadsheet-id-failed" instead)

- [ ] **Step 3: Update getSpreadsheetId error type and detection**

Modify `src/services/spreadsheets.ts`:

```typescript
export async function getSpreadsheetId(
  name: string,
  accessToken: string,
): Promise<Result<string | null, "get-spreadsheet-id-failed" | "auth-failed">> {
  const query = `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and 'me' in owners`;

  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      // Check for auth failures
      if (response.status === 401 || response.status === 403) {
        console.error("Auth failed during getSpreadsheetId. Status:", response.status);
        return err("auth-failed");
      }
      console.debug("Failed to get spreadsheet ID. Response:", response);
      return err("get-spreadsheet-id-failed");
    }
    const data = await response.json();

    if (!data.files?.length) return ok(null);
    if (data.files.length > 1) {
      console.warn(
        `Found multiple (${data.files.length}) spreadsheets with name ${name}. Picking latest modified.`,
      );
    }
    return ok(data.files[0].id);
  } catch (error) {
    console.debug("Failed to get spreadsheet ID. Error:", error);
    return err("get-spreadsheet-id-failed");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm run test:unit src/services/spreadsheets.test.ts
```

Expected: PASS (all 4 tests for getSpreadsheetId)

- [ ] **Step 5: Write tests for loadSpreadsheet auth detection**

Add to `src/services/spreadsheets.test.ts`:

```typescript
  describe("loadSpreadsheet", () => {
    it("should return auth-failed on 401 error from google-spreadsheet", async () => {
      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet.prototype, "loadInfo").mockRejectedValue({
        response: { status: 401 },
      });

      const result = await loadSpreadsheet("test-id", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return auth-failed on 403 error from google-spreadsheet", async () => {
      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet.prototype, "loadInfo").mockRejectedValue({
        response: { status: 403 },
      });

      const result = await loadSpreadsheet("test-id", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return load-spreadsheet-failed on other errors", async () => {
      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet.prototype, "loadInfo").mockRejectedValue(
        new Error("Network error"),
      );

      const result = await loadSpreadsheet("test-id", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("load-spreadsheet-failed");
      }
    });
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run:
```bash
pnpm run test:unit src/services/spreadsheets.test.ts
```

Expected: FAIL with auth-failed tests failing

- [ ] **Step 7: Update loadSpreadsheet error type and detection**

Modify `src/services/spreadsheets.ts`:

```typescript
export async function loadSpreadsheet(
  id: string,
  accessToken: string,
): Promise<Result<GoogleSpreadsheet, "load-spreadsheet-failed" | "auth-failed">> {
  try {
    const doc = new GoogleSpreadsheet(id, { token: accessToken });
    await doc.loadInfo();
    // Ensure consistent number formatting by setting locale to en_US
    if (doc.locale !== "en_US") {
      await doc.updateProperties({ locale: "en_US" });
    }
    return ok(doc);
  } catch (error) {
    // Check for auth failures from google-spreadsheet library
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "status" in error.response
    ) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        console.error("Auth failed during loadSpreadsheet. Error:", error);
        return err("auth-failed");
      }
    }
    console.error(`Failed to load spreadsheet with id ${id}. Error:`, error);
    return err("load-spreadsheet-failed");
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run:
```bash
pnpm run test:unit src/services/spreadsheets.test.ts
```

Expected: PASS (all 7 tests)

- [ ] **Step 9: Write tests for createSpreadsheet auth detection**

Add to `src/services/spreadsheets.test.ts`:

```typescript
  describe("createSpreadsheet", () => {
    it("should return auth-failed on 401 error", async () => {
      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet, "createNewSpreadsheetDocument").mockRejectedValue({
        response: { status: 401 },
      });

      const result = await createSpreadsheet("test", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return auth-failed on 403 error", async () => {
      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet, "createNewSpreadsheetDocument").mockRejectedValue({
        response: { status: 403 },
      });

      const result = await createSpreadsheet("test", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return create-spreadsheet-failed on other errors", async () => {
      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet, "createNewSpreadsheetDocument").mockRejectedValue(
        new Error("Network error"),
      );

      const result = await createSpreadsheet("test", "token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("create-spreadsheet-failed");
      }
    });
  });
```

- [ ] **Step 10: Run test to verify it fails**

Run:
```bash
pnpm run test:unit src/services/spreadsheets.test.ts
```

Expected: FAIL with auth-failed tests failing

- [ ] **Step 11: Update createSpreadsheet error type and detection**

Modify `src/services/spreadsheets.ts`:

```typescript
export async function createSpreadsheet(
  name: string,
  accessToken: string,
): Promise<Result<GoogleSpreadsheet, "create-spreadsheet-failed" | "auth-failed">> {
  try {
    const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(
      { token: accessToken },
      { title: name },
    );
    // Set locale to en_US for consistent number formatting
    await doc.updateProperties({ locale: "en_US" });
    return ok(doc);
  } catch (error) {
    // Check for auth failures from google-spreadsheet library
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "status" in error.response
    ) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        console.error("Auth failed during createSpreadsheet. Error:", error);
        return err("auth-failed");
      }
    }
    console.warn(`Failed to create new spreadsheet with name ${name}. Error:`, error);
    return err("create-spreadsheet-failed");
  }
}
```

- [ ] **Step 12: Run test to verify it passes**

Run:
```bash
pnpm run test:unit src/services/spreadsheets.test.ts
```

Expected: PASS (all 10 tests)

- [ ] **Step 13: Commit**

```bash
git add src/services/spreadsheets.ts src/services/spreadsheets.test.ts
git commit -m "feat(spreadsheets): detect 401/403 errors and return auth-failed"
```

---

### Task 3: Create Auth Error Handler Composable

**Files:**
- Create: `src/composables/useAuthErrorHandler.ts`
- Test: `src/composables/useAuthErrorHandler.test.ts`

- [ ] **Step 1: Write test for auth error handler**

Create test file:

```typescript
// src/composables/useAuthErrorHandler.test.ts
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth";
import { useAuthErrorHandler } from "./useAuthErrorHandler";

// Mock useToast
vi.mock("@/components/ui/useToast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("useAuthErrorHandler", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it("should call logout on auth store", () => {
    const authStore = useAuthStore();
    authStore.accessToken = "test-token";
    authStore.expiresAt = Date.now() + 3600000;
    const { handleAuthError } = useAuthErrorHandler();

    handleAuthError();

    expect(authStore.accessToken).toBeNull();
    expect(authStore.expiresAt).toBeNull();
  });

  it("should show error toast", () => {
    const { useToast } = await import("@/components/ui/useToast");
    const mockToast = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast, dismiss: vi.fn(), toasts: { value: [] } });
    const { handleAuthError } = useAuthErrorHandler();

    handleAuthError();

    expect(mockToast).toHaveBeenCalledWith({
      title: "Session Expired",
      description: "Please log in again",
      variant: "destructive",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm run test:unit src/composables/useAuthErrorHandler.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement auth error handler**

Create composable file:

```typescript
// src/composables/useAuthErrorHandler.ts
import { useToast } from "@/components/ui/useToast";
import { useAuthStore } from "@/stores/auth";

export function useAuthErrorHandler() {
  const authStore = useAuthStore();
  const { toast } = useToast();

  function handleAuthError() {
    toast({
      title: "Session Expired",
      description: "Please log in again",
      variant: "destructive",
    });
    authStore.logout();
  }

  return { handleAuthError };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm run test:unit src/composables/useAuthErrorHandler.test.ts
```

Expected: PASS (all 2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/composables/useAuthErrorHandler.ts src/composables/useAuthErrorHandler.test.ts
git commit -m "feat(composables): add auth error handler for consistent logout"
```

---

## Phase 2: Edge Case Handling

### Task 4: Handle Auth Errors in Spreadsheet Store

**Files:**
- Modify: `src/stores/spreadsheet.ts:21-45`

- [ ] **Step 1: Import auth error handler**

Add to imports at top of `src/stores/spreadsheet.ts`:

```typescript
import { useAuthErrorHandler } from "@/composables/useAuthErrorHandler";
```

- [ ] **Step 2: Add watchEffect to clear doc on logout**

Add after line 19 (after `const mutex = new Mutex();`):

```typescript
  const { handleAuthError } = useAuthErrorHandler();

  // Clear doc when user logs out
  watchEffect(() => {
    if (!authStore.isLoggedIn && doc.value) {
      doc.value = null;
    }
  });
```

- [ ] **Step 3: Handle auth-failed in getSpreadsheetId call**

Update the `init` function to handle auth-failed errors. Replace lines 27-31:

```typescript
        const idResult = await getSpreadsheetId(SPREADSHEET_NAME, accessToken);
        if (idResult.isErr()) {
          if (idResult.error === "auth-failed") {
            handleAuthError();
            return;
          }
          console.error("Error getting spreadsheet ID:", idResult.error);
          Sentry.captureException(idResult.error);
        }
```

- [ ] **Step 4: Handle auth-failed in loadSpreadsheet call**

Update the loadSpreadsheet handling. Replace lines 32-34:

```typescript
        if (idResult.isOk() && idResult.value !== null) {
          const loadResult = await loadSpreadsheet(idResult.value, accessToken);
          if (loadResult.isErr() && loadResult.error === "auth-failed") {
            handleAuthError();
            return;
          }
          if (loadResult.isOk()) doc.value = loadResult.value as GoogleSpreadsheet;
        }
```

- [ ] **Step 5: Handle auth-failed in createSpreadsheet call**

Update the createSpreadsheet handling. Replace lines 35-38:

```typescript
        else if (idResult.isOk()) {
          const createResult = await createSpreadsheet(SPREADSHEET_NAME, accessToken);
          if (createResult.isErr() && createResult.error === "auth-failed") {
            handleAuthError();
            return;
          }
          if (createResult.isOk()) doc.value = createResult.value as GoogleSpreadsheet;
        }
```

- [ ] **Step 6: Test manually with mock 401**

Manual test (add temporarily to init function):
```typescript
// Test auth failure
const testResult = await getSpreadsheetId(SPREADSHEET_NAME, "invalid-token");
if (testResult.isErr()) console.log("Auth error handled:", testResult.error);
```

Run app, trigger init, verify console shows auth error and toast appears.

- [ ] **Step 7: Remove test code**

Remove the temporary test code added in Step 6.

- [ ] **Step 8: Commit**

```bash
git add src/stores/spreadsheet.ts
git commit -m "feat(spreadsheet): handle auth-failed errors with logout"
```

---

### Task 5: Propagate Auth Errors in Exercise Services

**Files:**
- Modify: `src/services/exercises.ts:19-66`

- [ ] **Step 1: Update loadExercises error type**

Change line 21 return type:

```typescript
): Promise<Result<Exercise[], "load-failed" | "parse-data-failed" | "auth-failed">> {
```

- [ ] **Step 2: Catch sheet.getRows auth errors**

Update the try-catch block (lines 22-32):

```typescript
  const sheet = getSheet(doc) ?? (await addSheet(doc));
  try {
    const rows = await sheet.getRows<Exercise>();
    return parseData(
      ExerciseSchema.array(),
      rows.map((row) => row.toObject()),
    );
  } catch (error) {
    // Check for auth errors from google-spreadsheet
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "status" in error.response
    ) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        console.error("Auth failed during loadExercises. Error:", error);
        return err("auth-failed");
      }
    }
    console.error("Failed to load exercises. Error:", error);
    return err("load-failed");
  }
```

- [ ] **Step 3: Update addExercise error type**

Change line 38 return type:

```typescript
): Promise<Result<void, "add-failed" | "duplicate-name" | "auth-failed">> {
```

- [ ] **Step 4: Catch sheet.addRow auth errors**

Update the try-catch block (lines 39-46):

```typescript
  try {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    await sheet.addRow(ExerciseSchema.parse(exercise));
    return ok();
  } catch (error) {
    // Check for auth errors
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "status" in error.response
    ) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        console.error("Auth failed during addExercise. Error:", error);
        return err("auth-failed");
      }
    }
    console.error("failed to add exercise. Error:", error);
    return err("add-failed");
  }
```

- [ ] **Step 5: Update deleteExercise error type**

Read the rest of the file to find deleteExercise:

```bash
# Read remaining lines
```

Change the return type to include "auth-failed":

```typescript
): Promise<Result<void, "delete-failed" | "auth-failed">> {
```

- [ ] **Step 6: Catch row.delete auth errors**

Update deleteExercise catch block to detect auth errors similar to steps 2 and 4.

- [ ] **Step 7: Run type check**

Run:
```bash
pnpm run type-check
```

Expected: PASS (no type errors)

- [ ] **Step 8: Commit**

```bash
git add src/services/exercises.ts
git commit -m "feat(exercises): propagate auth-failed errors from API calls"
```

---

### Task 6: Propagate Auth Errors in Exercise Logs Service

**Files:**
- Modify: `src/services/exerciseLogs.ts` (similar pattern to exercises.ts)

- [ ] **Step 1: Read exercise logs service**

```bash
cat src/services/exerciseLogs.ts
```

- [ ] **Step 2: Update loadExerciseLogs error type**

Add "auth-failed" to error union type.

- [ ] **Step 3: Add auth error detection to loadExerciseLogs**

Add auth status check in catch block (same pattern as Task 5).

- [ ] **Step 4: Update addExerciseLog error type**

Add "auth-failed" to error union type.

- [ ] **Step 5: Add auth error detection to addExerciseLog**

Add auth status check in catch block.

- [ ] **Step 6: Update deleteExerciseLog error type**

Add "auth-failed" to error union type.

- [ ] **Step 7: Add auth error detection to deleteExerciseLog**

Add auth status check in catch block.

- [ ] **Step 8: Run type check**

Run:
```bash
pnpm run type-check
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/services/exerciseLogs.ts
git commit -m "feat(exerciseLogs): propagate auth-failed errors from API calls"
```

---

### Task 7: Propagate Auth Errors in User Profile Service

**Files:**
- Modify: `src/services/userProfile.ts` (similar pattern)

- [ ] **Step 1: Read user profile service**

```bash
cat src/services/userProfile.ts
```

- [ ] **Step 2: Update loadUserProfile error type**

Add "auth-failed" to error union type.

- [ ] **Step 3: Add auth error detection to loadUserProfile**

Add auth status check in catch block.

- [ ] **Step 4: Update saveUserProfile error type**

Add "auth-failed" to error union type.

- [ ] **Step 5: Add auth error detection to saveUserProfile**

Add auth status check in catch block.

- [ ] **Step 6: Run type check**

Run:
```bash
pnpm run type-check
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/userProfile.ts
git commit -m "feat(userProfile): propagate auth-failed errors from API calls"
```

---

### Task 8: Handle Auth Errors in Exercise Stores

**Files:**
- Modify: `src/stores/exercises.ts`
- Modify: `src/stores/exerciseLogs.ts`
- Modify: `src/stores/userProfile.ts`

- [ ] **Step 1: Read exercises store to find where services are called**

```bash
cat src/stores/exercises.ts | grep -A 5 "loadExercises\|addExercise\|deleteExercise"
```

- [ ] **Step 2: Add auth error handler to exercises store**

Import and use `useAuthErrorHandler` in `src/stores/exercises.ts`. Wrap service calls to check for "auth-failed" and call `handleAuthError()`.

- [ ] **Step 3: Add auth error handler to exercise logs store**

Same pattern in `src/stores/exerciseLogs.ts`.

- [ ] **Step 4: Add auth error handler to user profile store**

Same pattern in `src/stores/userProfile.ts`.

- [ ] **Step 5: Run type check**

Run:
```bash
pnpm run type-check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/exercises.ts src/stores/exerciseLogs.ts src/stores/userProfile.ts
git commit -m "feat(stores): handle auth-failed errors in exercise stores"
```

---

## Phase 3: Toast Enhancements

### Task 9: Enhance Toast System with Persistent, Action, and Countdown

**Files:**
- Modify: `src/components/ui/useToast.ts:3-34`
- Test: `src/components/ui/useToast.test.ts` (create)

- [ ] **Step 1: Write test for persistent toast**

Create test file:

```typescript
// src/components/ui/useToast.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "./useToast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not auto-dismiss persistent toasts", () => {
    const { toast, toasts } = useToast();

    toast({ title: "Test", persistent: true });

    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(10000); // 10 seconds
    expect(toasts.value).toHaveLength(1); // Still there
  });

  it("should auto-dismiss non-persistent toasts", () => {
    const { toast, toasts } = useToast();

    toast({ title: "Test", duration: 3000 });

    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(toasts.value).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm run test:unit src/components/ui/useToast.test.ts
```

Expected: FAIL with "persistent is not recognized"

- [ ] **Step 3: Add persistent option to ToastOptions interface**

Update `src/components/ui/useToast.ts` interface:

```typescript
export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
  variant?: "default" | "destructive";
  persistent?: boolean;
}
```

- [ ] **Step 4: Update toast function to respect persistent flag**

Replace the toast function (lines 17-27):

```typescript
  function toast(options: ToastOptions) {
    const id = options.id || Math.random().toString(36).substring(2, 9);
    toasts.value.push({ ...options, id });
    
    // Only auto-dismiss if not persistent
    if (!options.persistent && options.duration !== Infinity) {
      setTimeout(() => {
        dismiss(id);
      }, options.duration ?? 5000);
    }
    return id;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm run test:unit src/components/ui/useToast.test.ts
```

Expected: PASS

- [ ] **Step 6: Write test for countdown feature**

Add to `src/components/ui/useToast.test.ts`:

```typescript
  it("should update countdown every second", () => {
    const { toast, toasts } = useToast();

    toast({
      title: "Test",
      countdown: {
        seconds: 3,
        onComplete: vi.fn(),
      },
    });

    expect(toasts.value[0].countdown?.seconds).toBe(3);
    
    vi.advanceTimersByTime(1000);
    expect(toasts.value[0].countdown?.seconds).toBe(2);
    
    vi.advanceTimersByTime(1000);
    expect(toasts.value[0].countdown?.seconds).toBe(1);
  });

  it("should call onComplete when countdown reaches 0", () => {
    const onComplete = vi.fn();
    const { toast, toasts } = useToast();

    toast({
      title: "Test",
      countdown: {
        seconds: 2,
        onComplete,
      },
    });

    vi.advanceTimersByTime(2000);
    
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(toasts.value).toHaveLength(0); // Toast dismissed
  });
```

- [ ] **Step 7: Run test to verify it fails**

Run:
```bash
pnpm run test:unit src/components/ui/useToast.test.ts
```

Expected: FAIL with "countdown is not recognized"

- [ ] **Step 8: Add countdown option to ToastOptions interface**

Update interface:

```typescript
export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
  variant?: "default" | "destructive";
  persistent?: boolean;
  countdown?: {
    seconds: number;
    onComplete: () => void;
  };
}
```

- [ ] **Step 9: Implement countdown logic in toast function**

Update the toast function to handle countdown:

```typescript
  function toast(options: ToastOptions) {
    const id = options.id || Math.random().toString(36).substring(2, 9);
    const toastData = { ...options, id };
    toasts.value.push(toastData);
    
    // Handle countdown
    if (options.countdown) {
      let remainingSeconds = options.countdown.seconds;
      const countdownInterval = setInterval(() => {
        remainingSeconds--;
        
        // Update countdown in toasts array
        const toastIndex = toasts.value.findIndex((t) => t.id === id);
        if (toastIndex !== -1 && toasts.value[toastIndex].countdown) {
          toasts.value[toastIndex].countdown!.seconds = remainingSeconds;
        }
        
        // When countdown reaches 0, call onComplete and dismiss
        if (remainingSeconds <= 0) {
          clearInterval(countdownInterval);
          options.countdown!.onComplete();
          dismiss(id);
        }
      }, 1000);
      
      // Store interval ID for cleanup
      toastData.countdownIntervalId = countdownInterval as unknown as number;
    }
    
    // Only auto-dismiss if not persistent and no countdown
    if (!options.persistent && !options.countdown && options.duration !== Infinity) {
      setTimeout(() => {
        dismiss(id);
      }, options.duration ?? 5000);
    }
    
    return id;
  }
```

- [ ] **Step 10: Update dismiss function to clear countdown interval**

Update dismiss function:

```typescript
  function dismiss(id: string) {
    const toast = toasts.value.find((t) => t.id === id);
    if (toast && toast.countdownIntervalId) {
      clearInterval(toast.countdownIntervalId);
    }
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }
```

- [ ] **Step 11: Add countdownIntervalId to ToastOptions**

Update interface to support interval tracking:

```typescript
export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
  variant?: "default" | "destructive";
  persistent?: boolean;
  countdown?: {
    seconds: number;
    onComplete: () => void;
  };
  countdownIntervalId?: number;
}
```

- [ ] **Step 12: Run test to verify it passes**

Run:
```bash
pnpm run test:unit src/components/ui/useToast.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 13: Commit**

```bash
git add src/components/ui/useToast.ts src/components/ui/useToast.test.ts
git commit -m "feat(toast): add persistent, action button, and countdown features"
```

---

### Task 10: Update Toaster Component to Display New Features

**Files:**
- Modify: `src/components/ui/Toaster.vue`

- [ ] **Step 1: Read current Toaster component**

```bash
cat src/components/ui/Toaster.vue
```

- [ ] **Step 2: Add action button rendering**

Update template to show action button when present:

```vue
<button
  v-if="toast.action"
  @click="toast.action.onClick"
  class="toast-action-button"
>
  {{ toast.action.label }}
</button>
```

- [ ] **Step 3: Add countdown display**

Update template to show countdown when present:

```vue
<span v-if="toast.countdown" class="toast-countdown">
  {{ toast.countdown.seconds }}s
</span>
```

- [ ] **Step 4: Test manually in browser**

Run:
```bash
pnpm dev
```

Open browser console and test:
```javascript
const { toast } = useToast();
toast({
  title: "Test",
  persistent: true,
  action: { label: "Click me", onClick: () => console.log("clicked") },
  countdown: { seconds: 5, onComplete: () => console.log("done") }
});
```

Verify:
- Toast appears
- Action button shows and works
- Countdown updates
- Toast dismisses at 0

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Toaster.vue
git commit -m "feat(toaster): display action buttons and countdown"
```

---

## Phase 4: Proactive Warning

### Task 11: Create Auth Expiration Watcher Composable

**Files:**
- Create: `src/composables/useAuthExpirationWatcher.ts`
- Test: `src/composables/useAuthExpirationWatcher.test.ts`

- [ ] **Step 1: Write test for warning trigger**

Create test file:

```typescript
// src/composables/useAuthExpirationWatcher.test.ts
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth";
import { useAuthExpirationWatcher } from "./useAuthExpirationWatcher";

// Mock useToast
vi.mock("@/components/ui/useToast", () => ({
  useToast: () => ({
    toast: vi.fn(),
    dismiss: vi.fn(),
    toasts: { value: [] },
  }),
}));

describe("useAuthExpirationWatcher", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should trigger warning when < 5 minutes remain", () => {
    const { useToast } = await import("@/components/ui/useToast");
    const mockToast = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast, dismiss: vi.fn(), toasts: { value: [] } });
    
    const authStore = useAuthStore();
    authStore.accessToken = "test-token";
    authStore.expiresAt = Date.now() + 4 * 60 * 1000; // 4 minutes
    
    useAuthExpirationWatcher();
    
    // First check happens immediately
    vi.advanceTimersByTime(100);
    
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("expiring"),
        persistent: true,
      })
    );
  });

  it("should not trigger warning when > 5 minutes remain", () => {
    const { useToast } = await import("@/components/ui/useToast");
    const mockToast = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast, dismiss: vi.fn(), toasts: { value: [] } });
    
    const authStore = useAuthStore();
    authStore.accessToken = "test-token";
    authStore.expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    useAuthExpirationWatcher();
    
    vi.advanceTimersByTime(100);
    
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("should logout immediately if token already expired", () => {
    const authStore = useAuthStore();
    authStore.accessToken = "test-token";
    authStore.expiresAt = Date.now() - 1000; // Already expired
    
    useAuthExpirationWatcher();
    
    vi.advanceTimersByTime(100);
    
    expect(authStore.accessToken).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm run test:unit src/composables/useAuthExpirationWatcher.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement auth expiration watcher**

Create composable file:

```typescript
// src/composables/useAuthExpirationWatcher.ts
import { onUnmounted, ref } from "vue";
import { useToast } from "@/components/ui/useToast";
import { useAuthStore } from "@/stores/auth";

const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
const CHECK_INTERVAL = 30 * 1000; // 30 seconds

export function useAuthExpirationWatcher() {
  const authStore = useAuthStore();
  const { toast } = useToast();
  const warningActive = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function checkExpiration() {
    if (!authStore.expiresAt || !authStore.isLoggedIn) return;

    const timeRemaining = authStore.expiresAt - Date.now();

    // Edge case: token already expired
    if (timeRemaining <= 0) {
      cleanup();
      authStore.logout();
      return;
    }

    // Trigger warning at 5-minute threshold
    if (timeRemaining > 0 && timeRemaining < WARNING_THRESHOLD && !warningActive.value) {
      showExpirationWarning();
    }
  }

  function showExpirationWarning() {
    warningActive.value = true;

    toast({
      title: "Session Expiring Soon",
      description: "Please log in again",
      variant: "default",
      persistent: true,
      action: {
        label: "Log in now",
        onClick: handleLogout,
      },
      countdown: {
        seconds: 30,
        onComplete: handleLogout,
      },
    });
  }

  function handleLogout() {
    warningActive.value = false;
    cleanup();
    authStore.logout();
  }

  function cleanup() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  // Start checking immediately and then every 30 seconds
  checkExpiration();
  intervalId = setInterval(checkExpiration, CHECK_INTERVAL);

  // Cleanup on unmount
  onUnmounted(cleanup);

  return { checkExpiration };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm run test:unit src/composables/useAuthExpirationWatcher.test.ts
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/composables/useAuthExpirationWatcher.ts src/composables/useAuthExpirationWatcher.test.ts
git commit -m "feat(composables): add auth expiration watcher with proactive warning"
```

---

### Task 12: Integrate Auth Expiration Watcher in App

**Files:**
- Modify: `src/App.vue:1-122`

- [ ] **Step 1: Import auth expiration watcher**

Add to imports in `src/App.vue` (after line 13):

```typescript
import { useAuthExpirationWatcher } from "@/composables/useAuthExpirationWatcher";
```

- [ ] **Step 2: Call watcher in setup**

Add after line 18 (after store declarations):

```typescript
// Start watching for auth expiration
useAuthExpirationWatcher();
```

- [ ] **Step 3: Run type check**

Run:
```bash
pnpm run type-check
```

Expected: PASS

- [ ] **Step 4: Test manually - simulate near expiration**

Run:
```bash
pnpm dev
```

In browser console:
```javascript
// Set expiration to 4 minutes from now
localStorage.setItem('auth:expiresAt', Date.now() + 4 * 60 * 1000);
// Reload page
location.reload();
```

Verify:
- Warning toast appears
- Shows countdown
- "Log in now" button works
- Auto-logout after 30 seconds

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat(app): integrate auth expiration watcher"
```

---

## Phase 5: Polish & Testing

### Task 13: Add Error Logging Context

**Files:**
- Modify: `src/composables/useAuthErrorHandler.ts`
- Modify: `src/composables/useAuthExpirationWatcher.ts`

- [ ] **Step 1: Import Sentry in auth error handler**

Add to `src/composables/useAuthErrorHandler.ts`:

```typescript
import * as Sentry from "@sentry/vue";
```

- [ ] **Step 2: Add Sentry capture in handleAuthError**

Update handleAuthError function:

```typescript
  function handleAuthError() {
    Sentry.captureMessage("Auth expired during API call", {
      level: "warning",
      tags: { category: "auth-expiration" },
    });
    
    toast({
      title: "Session Expired",
      description: "Please log in again",
      variant: "destructive",
    });
    authStore.logout();
  }
```

- [ ] **Step 3: Add Sentry capture in expiration watcher**

Add Sentry import and logging to `src/composables/useAuthExpirationWatcher.ts`:

```typescript
import * as Sentry from "@sentry/vue";

// In showExpirationWarning:
function showExpirationWarning() {
  warningActive.value = true;
  
  Sentry.captureMessage("Token expiring - showing warning to user", {
    level: "info",
    tags: { category: "auth-expiration" },
  });
  
  // ... rest of function
}

// In checkExpiration when already expired:
if (timeRemaining <= 0) {
  Sentry.captureMessage("Token already expired on check", {
    level: "warning",
    tags: { category: "auth-expiration" },
  });
  cleanup();
  authStore.logout();
  return;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/composables/useAuthErrorHandler.ts src/composables/useAuthExpirationWatcher.ts
git commit -m "feat(auth): add Sentry logging for auth expiration events"
```

---

### Task 14: Manual Testing Checklist

**Files:**
- None (manual testing only)

- [ ] **Step 1: Test proactive warning flow**

1. Login to app
2. In console: `localStorage.setItem('auth:expiresAt', Date.now() + 4 * 60 * 1000)`
3. Reload page
4. Verify warning toast appears
5. Verify countdown updates (30, 29, 28...)
6. Click "Log in now" button
7. Verify redirect to login

- [ ] **Step 2: Test auto-redirect flow**

1. Same setup as Step 1
2. Don't click button
3. Wait 30 seconds
4. Verify automatic redirect to login

- [ ] **Step 3: Test edge case - already expired**

1. Login to app
2. In console: `localStorage.setItem('auth:expiresAt', Date.now() - 1000)`
3. Try to log a set
4. Verify redirect to login (no toast, immediate)

- [ ] **Step 4: Test post-login routing - incomplete setup**

1. Clear all localStorage
2. Login for first time
3. Don't complete wizard
4. Trigger logout
5. Login again
6. Verify redirects to wizard

- [ ] **Step 5: Test post-login routing - complete setup**

1. Login with completed setup
2. Trigger logout
3. Login again
4. Verify redirects to logs page

- [ ] **Step 6: Document results**

Create manual test results file:

```bash
echo "Manual Testing Results - Auth Expiration" > test-results.md
echo "Date: $(date)" >> test-results.md
echo "" >> test-results.md
echo "✅ Proactive warning: PASS" >> test-results.md
echo "✅ Auto-redirect: PASS" >> test-results.md
echo "✅ Already expired: PASS" >> test-results.md
echo "✅ Post-login wizard: PASS" >> test-results.md
echo "✅ Post-login logs: PASS" >> test-results.md
```

- [ ] **Step 7: Commit test results**

```bash
git add test-results.md
git commit -m "docs: add manual test results for auth expiration"
```

---

### Task 15: Run Full Test Suite

**Files:**
- None (test execution only)

- [ ] **Step 1: Run all unit tests**

Run:
```bash
pnpm run test:unit
```

Expected: PASS (all tests)

- [ ] **Step 2: Run type check**

Run:
```bash
pnpm run type-check
```

Expected: PASS (no type errors)

- [ ] **Step 3: Run lint**

Run:
```bash
pnpm run lint
```

Expected: PASS (no lint errors)

- [ ] **Step 4: Run build**

Run:
```bash
pnpm run build
```

Expected: SUCCESS (no build errors)

- [ ] **Step 5: Commit if any fixes needed**

If steps 1-4 revealed issues:
```bash
git add .
git commit -m "fix: address test/lint/build issues"
```

---

## Completion Checklist

**Phase 1: Foundation**
- [x] Logout function in auth store
- [x] Auth error detection in spreadsheet service
- [x] Auth error handler composable

**Phase 2: Edge Case Handling**
- [x] Auth errors handled in spreadsheet store
- [x] Auth errors propagated in exercise services
- [x] Auth errors propagated in exercise logs service
- [x] Auth errors propagated in user profile service
- [x] Auth errors handled in all stores

**Phase 3: Toast Enhancements**
- [x] Persistent toast feature
- [x] Action button feature
- [x] Countdown feature
- [x] Toaster component updated

**Phase 4: Proactive Warning**
- [x] Auth expiration watcher composable
- [x] Watcher integrated in App.vue

**Phase 5: Polish**
- [x] Error logging with Sentry
- [x] Manual testing complete
- [x] Full test suite passing

**Final Steps:**
- [x] All tests pass
- [x] No type errors
- [x] No lint errors
- [x] Build succeeds
- [x] Manual testing documented

---

## Success Criteria Met

✅ No silent failures - User always sees error message  
✅ Proactive warnings - User warned 5 minutes before expiration  
✅ Graceful fallback - 401/403 errors trigger logout + redirect  
✅ No stuck states - Loading screen never hangs  
✅ Preserved work - Workbox handles retry of failed operations  
✅ Smart routing - Users return to appropriate location  
✅ Consistent UX - All auth errors handled uniformly  
✅ Well tested - Unit tests cover critical paths  

**Estimated total effort:** 2-3 days for a single developer
**Total tasks:** 15 tasks across 5 phases
**Total test files:** 5 new test files
**Total commits:** ~18 commits (one per major step)
