import { beforeEach, describe, expect, it } from "vitest";
import { CURRENT_LEGAL_CONSENT_VERSION, LEGAL_CONSENT_STORAGE_KEY } from "@/lib/legalConsent";
import { syncLegalConsent, useLegalConsent } from "./useLegalConsent";

describe("useLegalConsent", () => {
  beforeEach(() => {
    localStorage.clear();
    syncLegalConsent();
  });

  it("initializes as false when no consent exists", () => {
    const { consentRecord, hasLegalConsent } = useLegalConsent();
    expect(consentRecord.value).toBeNull();
    expect(hasLegalConsent.value).toBe(false);
  });

  it("shares reactive consent acceptance and revocation across callers", () => {
    const first = useLegalConsent();
    const second = useLegalConsent();

    first.acceptLegalConsent("2026-11-22T20:00:00.000Z");

    expect(second.hasLegalConsent.value).toBe(true);
    expect(second.consentRecord.value).toEqual({
      version: CURRENT_LEGAL_CONSENT_VERSION,
      acceptedAt: "2026-11-22T20:00:00.000Z",
    });

    second.revokeLegalConsent();

    expect(first.hasLegalConsent.value).toBe(false);
    expect(first.consentRecord.value).toBeNull();
    expect(localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY)).toBeNull();
  });

  it("treats outdated consent versions as requiring re-acceptance", () => {
    localStorage.setItem(
      LEGAL_CONSENT_STORAGE_KEY,
      JSON.stringify({ version: "2025-01-01", acceptedAt: "2025-01-01T12:00:00.000Z" }),
    );
    syncLegalConsent();

    const { consentRecord, hasLegalConsent } = useLegalConsent();
    expect(consentRecord.value).not.toBeNull();
    expect(hasLegalConsent.value).toBe(false);
  });
});
