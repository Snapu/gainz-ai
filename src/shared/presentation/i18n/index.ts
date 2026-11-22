import { createI18n } from "vue-i18n";
import {
  detectInitialLocale,
  persistLocale,
  type SupportedLocale,
  toBcp47Locale,
} from "@/lib/locale";
import { de } from "./locales/de";
import { en, type MessageSchema } from "./locales/en";

export type { SupportedLocale } from "@/lib/locale";
export type { MessageSchema } from "./locales/en";

function syncDocumentLang(locale: SupportedLocale): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = locale;
  }
}

const initialLocale = detectInitialLocale();
syncDocumentLang(initialLocale);

export const i18n = createI18n<[MessageSchema], SupportedLocale, false>({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: "en",
  messages: { en, de },
});

/** Updates active i18n locale, persists preference, and syncs `<html lang>`. */
export function setLocale(nextLocale: SupportedLocale): void {
  i18n.global.locale.value = nextLocale;
  persistLocale(nextLocale);
  syncDocumentLang(nextLocale);
}

/** Returns the active app locale ("en" or "de"). */
export function getCurrentLocale(): SupportedLocale {
  return i18n.global.locale.value;
}

/** Returns the active BCP 47 locale tag ("en-US" or "de-DE"). */
export function getCurrentBcp47Locale(): string {
  return toBcp47Locale(getCurrentLocale());
}

/** Translation helper preserving all `vue-i18n` overloads, safe inside and outside `setup()`. */
export const t: typeof i18n.global.t = ((...args: unknown[]) =>
  (i18n.global.t as (...a: unknown[]) => string)(...args)) as typeof i18n.global.t;
