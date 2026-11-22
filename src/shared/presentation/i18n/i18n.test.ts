import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { LOCALE_STORAGE_KEY } from "@/lib/locale";
import {
  formatMediumDate,
  formatNextUtcMidnightLocalTime,
  formatNumber,
  formatRelativeDays,
  formatSessionDate,
  formatShortDate,
  formatTime,
} from "./formatters";
import { getCurrentBcp47Locale, getCurrentLocale, setLocale, t } from "./index";
import { de } from "./locales/de";
import { en } from "./locales/en";

function collectLeafEntries(obj: Record<string, unknown>, prefix = ""): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.push([path, value]);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      entries.push(...collectLeafEntries(value as Record<string, unknown>, path));
    }
  }
  return entries;
}

function extractPlaceholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? ""))].sort();
}

describe("i18n infrastructure", () => {
  it("keeps complete leaf-key parity and non-empty strings across en and de", () => {
    const enEntries = new Map(collectLeafEntries(en));
    const deEntries = new Map(collectLeafEntries(de));

    expect([...enEntries.keys()].sort()).toEqual([...deEntries.keys()].sort());

    for (const [key, enValue] of enEntries) {
      const deValue = deEntries.get(key) ?? "";
      expect(enValue.trim().length, `empty en key: ${key}`).toBeGreaterThan(0);
      expect(deValue.trim().length, `empty de key: ${key}`).toBeGreaterThan(0);
      expect(extractPlaceholders(deValue), `placeholder mismatch at ${key}`).toEqual(
        extractPlaceholders(enValue),
      );
    }
  });

  it("syncs locale state, localStorage, BCP 47 tag, and document lang", () => {
    setLocale("de");
    expect(getCurrentLocale()).toBe("de");
    expect(getCurrentBcp47Locale()).toBe("de-DE");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("de");
    expect(document.documentElement.lang).toBe("de");

    setLocale("en");
    expect(getCurrentLocale()).toBe("en");
    expect(getCurrentBcp47Locale()).toBe("en-US");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("supports singular and plural forms in English and German", () => {
    setLocale("en");
    expect(t("plan.cycleWeeks", { count: 1 }, 1)).toBe("1 Week");
    expect(t("plan.cycleWeeks", { count: 4 }, 4)).toBe("4 Weeks");
    expect(t("coach.exerciseCount", { count: 1 }, 1)).toBe("1 Exercise");
    expect(t("coach.exerciseCount", { count: 5 }, 5)).toBe("5 Exercises");
    expect(t("progress.mo", { value: 1 }, 1)).toBe("1 mo");
    expect(t("progress.mo", { value: 3 }, 3)).toBe("3 mos");

    setLocale("de");
    expect(t("plan.cycleWeeks", { count: 1 }, 1)).toBe("1 Woche");
    expect(t("plan.cycleWeeks", { count: 4 }, 4)).toBe("4 Wochen");
    expect(t("coach.exerciseCount", { count: 1 }, 1)).toBe("1 Übung");
    expect(t("coach.exerciseCount", { count: 5 }, 5)).toBe("5 Übungen");
    expect(t("progress.mo", { value: 1 }, 1)).toBe("1 Monat");
    expect(t("progress.mo", { value: 3 }, 3)).toBe("3 Monate");
  });

  it("reactively updates bare createApp components without an i18n plugin", async () => {
    setLocale("en");
    const container = document.createElement("div");
    const Comp = defineComponent({
      setup() {
        return () => h("span", t("nav.train"));
      },
    });

    const app = createApp(Comp);
    app.mount(container);
    await nextTick();
    expect(container.textContent).toBe("Train");

    setLocale("de");
    await nextTick();
    expect(container.textContent).toBe("Training");

    app.unmount();
  });

  describe("locale-aware formatters", () => {
    it("formats numbers using active locale conventions", () => {
      setLocale("en");
      expect(formatNumber(1234.5, { maximumFractionDigits: 1 })).toBe("1,234.5");

      setLocale("de");
      expect(formatNumber(1234.5, { maximumFractionDigits: 1 })).toBe("1.234,5");
    });

    it("formats short, medium, session dates and times cleanly", () => {
      const sample = new Date(2026, 10, 22, 14, 30, 0);

      setLocale("en");
      expect(formatShortDate(sample)).toContain("Nov");
      expect(formatMediumDate(sample)).toContain("2026");
      expect(formatSessionDate(sample)).toContain("Sunday");
      expect(formatTime(sample)).toBeTruthy();

      setLocale("de");
      expect(formatShortDate(sample)).toContain("Nov");
      expect(formatMediumDate(sample)).toContain("2026");
      expect(formatSessionDate(sample)).toContain("Sonntag");
      expect(formatNextUtcMidnightLocalTime(sample)).toBeTruthy();
    });

    it("formats relative days cleanly in English and German", () => {
      const now = new Date(2026, 10, 22, 12, 0, 0);
      const todayDate = new Date(2026, 10, 22, 8, 0, 0);
      const yesterdayDate = new Date(2026, 10, 21, 8, 0, 0);
      const threeDaysAgo = new Date(2026, 10, 19, 8, 0, 0);

      setLocale("en");
      expect(formatRelativeDays(todayDate, now)).toBe("Today");
      expect(formatRelativeDays(yesterdayDate, now)).toBe("Yesterday");
      expect(formatRelativeDays(threeDaysAgo, now)).toBe("3d ago");

      setLocale("de");
      expect(formatRelativeDays(todayDate, now)).toBe("Heute");
      expect(formatRelativeDays(yesterdayDate, now)).toBe("Gestern");
      expect(formatRelativeDays(threeDaysAgo, now)).toBe("vor 3 T.");
    });
  });
});
