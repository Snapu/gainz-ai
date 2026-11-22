import { type ComputedRef, computed, type Ref, ref } from "vue";
import {
  CURRENT_LEGAL_CONSENT_VERSION,
  clearLegalConsent,
  getLegalConsent,
  type LegalConsentRecord,
  recordLegalConsent,
} from "@/lib/legalConsent";

export interface UseLegalConsentReturn {
  consentRecord: Ref<LegalConsentRecord | null>;
  hasLegalConsent: ComputedRef<boolean>;
  syncLegalConsent: () => void;
  acceptLegalConsent: (acceptedAt?: string) => LegalConsentRecord;
  revokeLegalConsent: () => void;
}

const consentRecord: Ref<LegalConsentRecord | null> = ref(getLegalConsent());

/** Synchronizes reactive consent state from persisted storage. */
export function syncLegalConsent(): void {
  consentRecord.value = getLegalConsent();
}

/** Reactive composable for tracking, accepting, and revoking legal & AI/health consent. */
export function useLegalConsent(): UseLegalConsentReturn {
  const hasLegalConsent = computed(
    () => consentRecord.value?.version === CURRENT_LEGAL_CONSENT_VERSION,
  );

  function acceptLegalConsent(acceptedAt?: string): LegalConsentRecord {
    const record = recordLegalConsent(acceptedAt);
    consentRecord.value = record;
    return record;
  }

  function revokeLegalConsent(): void {
    clearLegalConsent();
    consentRecord.value = null;
  }

  return {
    consentRecord,
    hasLegalConsent,
    syncLegalConsent,
    acceptLegalConsent,
    revokeLegalConsent,
  };
}
