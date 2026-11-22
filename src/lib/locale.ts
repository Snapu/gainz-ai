export type SupportedLocale = "en" | "de";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["en", "de"];

export const LOCALE_STORAGE_KEY = "gainz-locale";

/** Normalizes any language tag (e.g. "de-DE", "de-AT", "en-US") to a supported app locale. */
export function normalizeLocale(input: string | null | undefined): SupportedLocale {
  return input?.trim().toLowerCase().startsWith("de") ? "de" : "en";
}

function readPersistedLocale(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Detects the initial locale from persisted storage, falling back to browser language or "en". */
export function detectInitialLocale(): SupportedLocale {
  const stored = readPersistedLocale();
  if (stored) {
    return normalizeLocale(stored);
  }

  const browserLanguage = typeof navigator !== "undefined" ? navigator.language : undefined;
  return normalizeLocale(browserLanguage);
}

/** Reads the active stored locale (or browser fallback) for non-UI callers such as AI infrastructure. */
export function getStoredLocale(): SupportedLocale {
  return detectInitialLocale();
}

/** Persists the selected app locale to localStorage safely. */
export function persistLocale(locale: SupportedLocale): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore restricted storage environments (e.g. private browsing / sandboxed contexts)
  }
}

/** Maps a supported app locale to its canonical BCP 47 tag for Intl APIs and backend prompts. */
export function toBcp47Locale(locale: SupportedLocale): string {
  return locale === "de" ? "de-DE" : "en-US";
}
