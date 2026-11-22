import { computed } from "vue";
import { type SupportedLocale, toBcp47Locale } from "@/lib/locale";
import { i18n, setLocale } from "./index";

/** Reactive composable for reading and switching the app's UI & AI locale. */
export function useLocale() {
  const locale = computed<SupportedLocale>({
    get: () => i18n.global.locale.value,
    set: (nextLocale) => setLocale(nextLocale),
  });

  const bcp47Locale = computed(() => toBcp47Locale(locale.value));

  function toggleLocale(): void {
    setLocale(locale.value === "en" ? "de" : "en");
  }

  return {
    locale,
    bcp47Locale,
    setLocale,
    toggleLocale,
  };
}
