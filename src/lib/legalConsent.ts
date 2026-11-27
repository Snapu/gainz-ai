export const LEGAL_CONSENT_STORAGE_KEY = "gainz-legal-consent";
export const CURRENT_LEGAL_CONSENT_VERSION = "2026-11-27";

export interface LegalConsentRecord {
  version: string;
  acceptedAt: string;
}

function isLegalConsentRecord(value: unknown): value is LegalConsentRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === "string" &&
    candidate.version.length > 0 &&
    typeof candidate.acceptedAt === "string" &&
    candidate.acceptedAt.length > 0
  );
}

/** Reads and validates the persisted legal consent record from localStorage safely. */
export function getLegalConsent(): LegalConsentRecord | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLegalConsentRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Returns true when the user has accepted the active legal consent version. */
export function hasValidLegalConsent(): boolean {
  return getLegalConsent()?.version === CURRENT_LEGAL_CONSENT_VERSION;
}

/** Persists acceptance of the current legal consent version in localStorage safely. */
export function recordLegalConsent(acceptedAt?: string): LegalConsentRecord {
  const record: LegalConsentRecord = {
    version: CURRENT_LEGAL_CONSENT_VERSION,
    acceptedAt: acceptedAt ?? new Date().toISOString(),
  };

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, JSON.stringify(record));
    }
  } catch {
    // Ignore restricted storage environments (e.g. private browsing / sandboxed contexts)
  }

  return record;
}

/** Clears the persisted legal consent record from localStorage safely. */
export function clearLegalConsent(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(LEGAL_CONSENT_STORAGE_KEY);
  } catch {
    // Ignore restricted storage environments (e.g. private browsing / sandboxed contexts)
  }
}
