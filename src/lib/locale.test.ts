import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectInitialLocale,
  getStoredLocale,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  persistLocale,
  SUPPORTED_LOCALES,
  toBcp47Locale,
} from "./locale";

describe("locale utilities", () => {
  const originalNavigatorLanguage = navigator.language;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "language", {
      value: originalNavigatorLanguage,
      configurable: true,
    });
  });

  it("exposes en and de as supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "de"]);
  });

  describe("normalizeLocale", () => {
    it("normalizes German language tags to de", () => {
      expect(normalizeLocale("de")).toBe("de");
      expect(normalizeLocale("de-DE")).toBe("de");
      expect(normalizeLocale("de-AT")).toBe("de");
      expect(normalizeLocale("  DE-ch ")).toBe("de");
    });

    it("falls back to en for English, unsupported, or missing values", () => {
      expect(normalizeLocale("en")).toBe("en");
      expect(normalizeLocale("en-US")).toBe("en");
      expect(normalizeLocale("fr-FR")).toBe("en");
      expect(normalizeLocale("")).toBe("en");
      expect(normalizeLocale(null)).toBe("en");
      expect(normalizeLocale(undefined)).toBe("en");
    });
  });

  describe("detectInitialLocale and getStoredLocale", () => {
    it("prefers persisted locale over browser language", () => {
      localStorage.setItem(LOCALE_STORAGE_KEY, "en");
      Object.defineProperty(navigator, "language", {
        value: "de-DE",
        configurable: true,
      });

      expect(detectInitialLocale()).toBe("en");
      expect(getStoredLocale()).toBe("en");
    });

    it("detects German browser language when nothing is stored", () => {
      Object.defineProperty(navigator, "language", {
        value: "de-AT",
        configurable: true,
      });

      expect(detectInitialLocale()).toBe("de");
      expect(getStoredLocale()).toBe("de");
    });

    it("falls back to en for non-German browser languages", () => {
      Object.defineProperty(navigator, "language", {
        value: "es-ES",
        configurable: true,
      });

      expect(detectInitialLocale()).toBe("en");
    });
  });

  describe("persistLocale", () => {
    it("stores the locale in localStorage", () => {
      persistLocale("de");
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("de");

      persistLocale("en");
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    });

    it("does not throw when localStorage throws", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      expect(() => persistLocale("de")).not.toThrow();
    });
  });

  describe("toBcp47Locale", () => {
    it("maps supported locales to BCP 47 tags", () => {
      expect(toBcp47Locale("de")).toBe("de-DE");
      expect(toBcp47Locale("en")).toBe("en-US");
    });
  });
});
