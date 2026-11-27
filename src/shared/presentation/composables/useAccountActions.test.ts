import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { LEGAL_CONSENT_STORAGE_KEY } from "@/lib/legalConsent";
import { LOCALE_STORAGE_KEY } from "@/lib/locale";

const pushMock = vi.fn(() => Promise.resolve());
const toastMock = vi.fn();
const logoutMock = vi.fn(() => {
  authState.isLoggedIn = false;
  return Promise.resolve();
});
const deleteAccountMock = vi.fn();
const trashActiveSpreadsheetMock = vi.fn();
const clearLinkedSpreadsheetMock = vi.fn();
const restTimerResetMock = vi.fn();
const clearDerivedSheetCachesMock = vi.fn();
const revokeLegalConsentMock = vi.fn();

const authState = reactive({
  isLoggedIn: true,
  logout: logoutMock,
  deleteAccount: deleteAccountMock,
});

const spreadsheetState = reactive<{
  activeSpreadsheetId: string | null;
  trashActiveSpreadsheet: typeof trashActiveSpreadsheetMock;
  clearLinkedSpreadsheet: typeof clearLinkedSpreadsheetMock;
}>({
  activeSpreadsheetId: "sheet-123",
  trashActiveSpreadsheet: trashActiveSpreadsheetMock,
  clearLinkedSpreadsheet: clearLinkedSpreadsheetMock,
});

const useSpreadsheetStoreMock = vi.fn(() => spreadsheetState);
const legalConsentState = {
  hasLegalConsent: { value: true },
  revokeLegalConsent: revokeLegalConsentMock,
};

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const billingClearMock = vi.fn();
const billingFetchEntitlementMock = vi.fn();
const billingState: {
  hasNonTerminatedSubscription: boolean;
  entitlement: unknown;
  isFetching: boolean;
  clear: typeof billingClearMock;
  fetchEntitlement: typeof billingFetchEntitlementMock;
} = {
  hasNonTerminatedSubscription: false,
  entitlement: null,
  isFetching: false,
  clear: billingClearMock,
  fetchEntitlement: billingFetchEntitlementMock,
};
const clearPendingInviteCodeMock = vi.fn();
const clearPendingCheckoutReturnMock = vi.fn();

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => authState,
}));

vi.mock("@/modules/billing/presentation", () => ({
  useBillingStore: () => billingState,
  clearPendingInviteCode: () => clearPendingInviteCodeMock(),
  clearPendingCheckoutReturn: () => clearPendingCheckoutReturnMock(),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetStore: () => useSpreadsheetStoreMock(),
  useRestTimerStore: () => ({
    reset: restTimerResetMock,
  }),
}));

vi.mock("@/shared/presentation/composables/useLegalConsent", () => ({
  useLegalConsent: () => legalConsentState,
}));

vi.mock("@/shared/presentation/composables/useSheetCacheSync", () => ({
  clearDerivedSheetCaches: (options?: { onlyInstantiated?: boolean }) =>
    clearDerivedSheetCachesMock(options),
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import { useAccountActions } from "./useAccountActions";

describe("useAccountActions", () => {
  beforeEach(() => {
    setActivePinia(undefined);
    vi.clearAllMocks();
    localStorage.clear();
    authState.isLoggedIn = true;
    legalConsentState.hasLegalConsent.value = true;
    spreadsheetState.activeSpreadsheetId = "sheet-123";
    billingState.hasNonTerminatedSubscription = false;
    billingState.entitlement = null;
    billingState.isFetching = false;
  });

  afterEach(() => {
    setActivePinia(undefined);
  });

  it("does not instantiate spreadsheetStore eagerly at setup time", () => {
    legalConsentState.hasLegalConsent.value = false;
    const actions = useAccountActions();

    expect(useSpreadsheetStoreMock).not.toHaveBeenCalled();
    expect(actions.hasActiveSpreadsheet()).toBe(false);
    expect(useSpreadsheetStoreMock).not.toHaveBeenCalled();

    legalConsentState.hasLegalConsent.value = true;
    expect(actions.hasActiveSpreadsheet()).toBe(true);
    expect(useSpreadsheetStoreMock).toHaveBeenCalledTimes(1);
  });

  it("signOut clears session caches and session storage while preserving locale and legal consent", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "de");
    localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, '{"version":"2026-11-22"}');
    localStorage.setItem("gainz:linkedSpreadsheetId", "sheet-123");
    localStorage.setItem("hasCompletedSetup", "true");
    localStorage.setItem("gainz:restStartTime", "123456");

    const actions = useAccountActions();
    await actions.signOut();

    expect(revokeLegalConsentMock).not.toHaveBeenCalled();
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(clearLinkedSpreadsheetMock).toHaveBeenCalledTimes(1);
    expect(clearDerivedSheetCachesMock).toHaveBeenCalledWith({ onlyInstantiated: true });
    expect(restTimerResetMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("de");
    expect(localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY)).toBe('{"version":"2026-11-22"}');
    expect(localStorage.getItem("gainz:linkedSpreadsheetId")).toBeNull();
    expect(localStorage.getItem("hasCompletedSetup")).toBeNull();
    expect(localStorage.getItem("gainz:restStartTime")).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Signed Out",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("deleteAccount wipes server + local storage (preserving only locale) and navigates to /", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "de");
    localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, '{"version":"2026-11-22"}');
    localStorage.setItem("gainz:cacheSpreadsheetId", "sheet-123");
    localStorage.setItem("hasCompletedSetup", "true");
    localStorage.setItem("extra-key", "extra-val");

    deleteAccountMock.mockReturnValue(okAsync({ deleted: true, googleRevoked: true }));

    const actions = useAccountActions();
    const okResult = await actions.deleteAccount({ trashSpreadsheet: false });

    expect(okResult).toBe(true);
    expect(actions.isDeleting.value).toBe(false);
    expect(trashActiveSpreadsheetMock).not.toHaveBeenCalled();
    expect(deleteAccountMock).toHaveBeenCalledTimes(1);
    expect(revokeLegalConsentMock).toHaveBeenCalledTimes(1);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(clearLinkedSpreadsheetMock).toHaveBeenCalledTimes(1);
    expect(clearDerivedSheetCachesMock).toHaveBeenCalledWith({ onlyInstantiated: true });
    expect(restTimerResetMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("de");
    expect(localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("gainz:cacheSpreadsheetId")).toBeNull();
    expect(localStorage.getItem("hasCompletedSetup")).toBeNull();
    expect(localStorage.getItem("extra-key")).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Account & Data Deleted",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("skips instantiating uninstantiated spreadsheet and restTimer stores when active Pinia does not have them", async () => {
    setActivePinia(createPinia());
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    localStorage.setItem("gainz:linkedSpreadsheetId", "sheet-unvisited");
    localStorage.setItem("hasCompletedSetup", "true");
    deleteAccountMock.mockReturnValue(okAsync({ deleted: true, googleRevoked: true }));

    const actions = useAccountActions();
    const okResult = await actions.deleteAccount({ trashSpreadsheet: false });

    expect(okResult).toBe(true);
    expect(useSpreadsheetStoreMock).not.toHaveBeenCalled();
    expect(clearLinkedSpreadsheetMock).not.toHaveBeenCalled();
    expect(restTimerResetMock).not.toHaveBeenCalled();
    expect(clearDerivedSheetCachesMock).toHaveBeenCalledWith({ onlyInstantiated: true });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(localStorage.getItem("gainz:linkedSpreadsheetId")).toBeNull();
    expect(localStorage.getItem("hasCompletedSetup")).toBeNull();
  });

  it("trashes spreadsheet first when requested and aborts deletion if trashing fails", async () => {
    trashActiveSpreadsheetMock.mockReturnValueOnce(errAsync("forbidden"));

    const actions = useAccountActions();
    const failedResult = await actions.deleteAccount({ trashSpreadsheet: true });

    expect(failedResult).toBe(false);
    expect(actions.isDeleting.value).toBe(false);
    expect(deleteAccountMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "Could Not Trash Spreadsheet",
      }),
    );
  });

  it("keeps local state intact and shows destructive toast when server deletion fails", async () => {
    localStorage.setItem("hasCompletedSetup", "true");
    deleteAccountMock.mockReturnValueOnce(errAsync("account-deletion-failed"));

    const actions = useAccountActions();
    const result = await actions.deleteAccount({ trashSpreadsheet: false });

    expect(result).toBe(false);
    expect(revokeLegalConsentMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("hasCompletedSetup")).toBe("true");
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "Deletion Failed",
      }),
    );
  });

  it("reports hasActiveSubscription regardless of legal consent and refreshes stale cached entitlement when opened", () => {
    billingState.hasNonTerminatedSubscription = true;
    const actions = useAccountActions();
    expect(actions.hasActiveSubscription()).toBe(true);

    // Works on public /privacy even before consent is re-accepted
    legalConsentState.hasLegalConsent.value = false;
    expect(actions.hasActiveSubscription()).toBe(true);

    authState.isLoggedIn = false;
    expect(actions.hasActiveSubscription()).toBe(false);
    actions.ensureSubscriptionStatusLoaded();
    expect(billingFetchEntitlementMock).not.toHaveBeenCalled();

    authState.isLoggedIn = true;
    billingState.hasNonTerminatedSubscription = false;
    expect(actions.hasActiveSubscription()).toBe(false);

    // Refreshes even if a cached entitlement snapshot is present (avoids stale cross-device cache)
    billingState.entitlement = { source: "free_allowance" };
    billingState.isFetching = false;
    actions.ensureSubscriptionStatusLoaded();
    expect(billingFetchEntitlementMock).toHaveBeenCalledOnce();

    billingFetchEntitlementMock.mockClear();
    billingState.isFetching = true;
    actions.ensureSubscriptionStatusLoaded();
    expect(billingFetchEntitlementMock).not.toHaveBeenCalled();
  });

  it("clears billing store and surfaces pending-cancellation notice toast when billingCancellationPending is true", async () => {
    billingClearMock.mockClear();
    clearPendingInviteCodeMock.mockClear();
    clearPendingCheckoutReturnMock.mockClear();
    deleteAccountMock.mockReturnValueOnce(
      okAsync({
        deleted: true,
        googleRevoked: true,
        billingCancellationPending: true,
      }),
    );

    const actions = useAccountActions();
    const result = await actions.deleteAccount({ trashSpreadsheet: false });

    expect(result).toBe(true);
    expect(billingClearMock).toHaveBeenCalledOnce();
    expect(clearPendingInviteCodeMock).toHaveBeenCalledOnce();
    expect(clearPendingCheckoutReturnMock).toHaveBeenCalledOnce();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Subscription Cancellation Queued",
        duration: 10000,
      }),
    );
  });
});
