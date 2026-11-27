import { getActivePinia } from "pinia";
import { nextTick, type Ref, ref } from "vue";
import { useRouter } from "vue-router";
import { LEGAL_CONSENT_STORAGE_KEY } from "@/lib/legalConsent";
import { LOCALE_STORAGE_KEY } from "@/lib/locale";
import { useAuthStore } from "@/modules/auth/presentation";
import { clearPendingCheckoutReturn, clearPendingInviteCode } from "@/modules/billing/presentation";
import { useRestTimerStore, useSpreadsheetStore } from "@/modules/platform/presentation";
import { useLegalConsent } from "@/shared/presentation/composables/useLegalConsent";
import { clearDerivedSheetCaches } from "@/shared/presentation/composables/useSheetCacheSync";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";

interface AccountActions {
  isDeleting: Ref<boolean>;
  hasActiveSpreadsheet: () => boolean;
  signOut: () => Promise<void>;
  deleteAccount: (options: { trashSpreadsheet: boolean }) => Promise<boolean>;
}

function purgeLocalStorage(keepKeys: readonly string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const retained = new Set(keepKeys);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && !retained.has(key)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore restricted storage environments
  }
}

function isStoreInstantiated(storeId: string): boolean {
  const pinia = getActivePinia();
  return !pinia || pinia._s.has(storeId);
}

export function useAccountActions(): AccountActions {
  const router = useRouter();
  const authStore = useAuthStore();
  const { toast } = useToast();
  const { hasLegalConsent, revokeLegalConsent } = useLegalConsent();
  const isDeleting = ref(false);

  // Lazy store resolution avoids triggering spreadsheetStore.init() on public routes before consent
  function hasActiveSpreadsheet(): boolean {
    if (!authStore.isLoggedIn || !hasLegalConsent.value) {
      return false;
    }
    return Boolean(useSpreadsheetStore().activeSpreadsheetId);
  }

  async function clearLocalSessionState(options: { keepConsent: boolean }): Promise<void> {
    if (!options.keepConsent) {
      revokeLegalConsent();
    }
    await authStore.logout();
    if (isStoreInstantiated("spreadsheet")) {
      useSpreadsheetStore().clearLinkedSpreadsheet();
    }
    clearDerivedSheetCaches({ onlyInstantiated: true });
    if (isStoreInstantiated("restTimer")) {
      useRestTimerStore().reset();
    }
    clearPendingInviteCode();
    clearPendingCheckoutReturn();
    await nextTick();
    purgeLocalStorage(
      options.keepConsent ? [LOCALE_STORAGE_KEY, LEGAL_CONSENT_STORAGE_KEY] : [LOCALE_STORAGE_KEY],
    );
  }

  async function signOut(): Promise<void> {
    await clearLocalSessionState({ keepConsent: true });
    toast({
      title: t("account.signedOutToastTitle"),
      description: t("account.signedOutToastDesc"),
    });
    await router.push("/");
  }

  async function trashSpreadsheetIfRequested(shouldTrash: boolean): Promise<boolean> {
    if (!shouldTrash || !hasLegalConsent.value) {
      return true;
    }
    const trashResult = await useSpreadsheetStore().trashActiveSpreadsheet();
    if (trashResult.isErr()) {
      toast({
        variant: "destructive",
        title: t("account.trashSheetFailedTitle"),
        description:
          trashResult.error === "forbidden"
            ? t("account.trashSheetForbiddenDesc")
            : t("account.trashSheetFailedDesc"),
      });
      return false;
    }
    return true;
  }

  async function deleteAccount(options: { trashSpreadsheet: boolean }): Promise<boolean> {
    if (isDeleting.value) return false;
    isDeleting.value = true;

    try {
      if (!(await trashSpreadsheetIfRequested(options.trashSpreadsheet))) {
        return false;
      }

      const deleteResult = await authStore.deleteAccount();
      if (deleteResult.isErr()) {
        toast({
          variant: "destructive",
          title: t("account.deleteFailedTitle"),
          description: t("account.deleteFailedDesc"),
        });
        return false;
      }

      await clearLocalSessionState({ keepConsent: false });
      toast({
        title: t("account.deletedToastTitle"),
        description: deleteResult.value.googleRevoked
          ? t("account.deletedToastDesc")
          : t("account.deletedPartialRevokeToastDesc"),
      });
      await router.push("/");
      return true;
    } finally {
      isDeleting.value = false;
    }
  }

  return {
    isDeleting,
    hasActiveSpreadsheet,
    signOut,
    deleteAccount,
  };
}
