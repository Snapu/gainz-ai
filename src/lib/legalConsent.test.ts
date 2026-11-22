import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CURRENT_LEGAL_CONSENT_VERSION,
  clearLegalConsent,
  getLegalConsent,
  hasValidLegalConsent,
  LEGAL_CONSENT_STORAGE_KEY,
  recordLegalConsent,
} from "./legalConsent";

describe("legalConsent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null and false when no consent is stored", () => {
    expect(getLegalConsent()).toBeNull();
    expect(hasValidLegalConsent()).toBe(false);
  });

  it("returns null and false for malformed or incomplete stored values", () => {
    localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, "{invalid json");
    expect(getLegalConsent()).toBeNull();
    expect(hasValidLegalConsent()).toBe(false);

    localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, JSON.stringify({ version: "" }));
    expect(getLegalConsent()).toBeNull();
    expect(hasValidLegalConsent()).toBe(false);
  });

  it("records consent with the current version and ISO timestamp", () => {
    const timestamp = "2026-11-22T19:00:00.000Z";
    const recorded = recordLegalConsent(timestamp);

    expect(recorded).toEqual({
      version: CURRENT_LEGAL_CONSENT_VERSION,
      acceptedAt: timestamp,
    });
    expect(getLegalConsent()).toEqual(recorded);
    expect(hasValidLegalConsent()).toBe(true);
  });

  it("treats outdated consent versions as invalid", () => {
    localStorage.setItem(
      LEGAL_CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: "2025-01-01",
        acceptedAt: "2025-01-01T10:00:00.000Z",
      }),
    );

    expect(getLegalConsent()).not.toBeNull();
    expect(hasValidLegalConsent()).toBe(false);
  });

  it("clears stored consent cleanly", () => {
    recordLegalConsent("2026-11-22T19:00:00.000Z");
    expect(hasValidLegalConsent()).toBe(true);

    clearLegalConsent();
    expect(getLegalConsent()).toBeNull();
    expect(hasValidLegalConsent()).toBe(false);
  });

  it("does not throw when localStorage throws", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(getLegalConsent()).toBeNull();
    expect(hasValidLegalConsent()).toBe(false);
    expect(() => recordLegalConsent("2026-11-22T19:00:00.000Z")).not.toThrow();
    expect(() => clearLegalConsent()).not.toThrow();
  });
});
