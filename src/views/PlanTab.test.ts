import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, ref } from "vue";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import { setLocale } from "@/shared/presentation/i18n";

const samplePlan = TrainingPlan.create("2026-11-15T00:00:00.000Z", 2, [
  {
    weekNumber: 1,
    dayOfWeek: 1,
    sessionLabel: "Upper A",
    focusDescription: "Push & Pull",
    exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8-10" }],
  },
]);

const mockPlanVm = {
  isLoading: ref(false),
  isRegenerating: ref(false),
  activePlan: ref<TrainingPlan | null>(samplePlan),
  activeSessionIndex: ref(0),
  showStarterBadge: ref(false),
  starterRemainingCount: ref(30),
  starterLimitCount: ref(30),
  isCoachLocked: ref(false),
  isPlanSessionCompleted: vi.fn(() => false),
  regeneratePlan: vi.fn(),
  copyPlanJson: vi.fn(),
};

vi.mock("@/modules/aiCoach/presentation", () => ({
  usePlanTabViewModel: () => mockPlanVm,
  shouldShowWeekBadge: () => true,
  WorkoutExerciseList: defineComponent({ template: '<div data-testid="exercise-list" />' }),
}));

import { UpgradeCard } from "@/modules/billing/presentation";
import PlanTab from "./PlanTab.vue";

function mountPlanTab() {
  const host = document.createElement("div");
  const app = createApp(PlanTab);
  app.component("EmptyState", defineComponent({ template: "<div><slot /></div>" }));
  app.component("UiBadge", defineComponent({ template: "<span><slot /></span>" }));
  app.component("UiButton", defineComponent({ template: "<button><slot /></button>" }));
  app.component("UiCard", defineComponent({ template: "<div><slot /></div>" }));
  app.component("UiTelemetryLoader", defineComponent({ template: "<div />" }));
  app.mount(host);
  return {
    host,
    text: host.textContent ?? "",
    unmount: () => app.unmount(),
  };
}

describe("PlanTab.vue & UpgradeCard.vue", () => {
  it("displays starter counter badge while FreeAllowance is active and keeps active plan visible when locked", () => {
    setLocale("en");
    mockPlanVm.showStarterBadge.value = true;
    mockPlanVm.starterRemainingCount.value = 14;
    mockPlanVm.starterLimitCount.value = 30;
    mockPlanVm.isCoachLocked.value = false;

    const badgeMount = mountPlanTab();
    try {
      expect(badgeMount.text).toContain("14 / 30");
      expect(badgeMount.text).toContain("Upper A");
    } finally {
      badgeMount.unmount();
    }

    mockPlanVm.showStarterBadge.value = false;
    mockPlanVm.isCoachLocked.value = true;
    const lockedMount = mountPlanTab();
    try {
      expect(lockedMount.text).toContain("Upper A");
      expect(lockedMount.text).toContain("7.99");
      expect(lockedMount.text).toContain("LINK.COM*");
      expect(lockedMount.text).toContain("Always Free Without Pro");
    } finally {
      mockPlanVm.isCoachLocked.value = false;
      lockedMount.unmount();
    }
  });

  it("renders localized UpgradeCard copy in German and English without any fantasy jargon", () => {
    const mountCard = () => {
      const host = document.createElement("div");
      const app = createApp(UpgradeCard);
      app.component("UiBadge", defineComponent({ template: "<span><slot /></span>" }));
      app.component("UiCard", defineComponent({ template: "<div><slot /></div>" }));
      app.mount(host);
      const text = host.textContent ?? "";
      app.unmount();
      return text;
    };

    setLocale("de");
    const deText = mountCard();
    expect(deText).toContain("Mit GainzAI Pro");
    expect(deText).toContain("Ohne Pro immer kostenlos");
    expect(deText).toContain("7,99 € / Monat inkl. MwSt.");
    expect(deText).toContain("Stripe / Link");
    expect(deText).not.toMatch(/Hunter|Dungeon|Awakening|Quest/i);

    setLocale("en");
    const enText = mountCard();
    expect(enText).toContain("With GainzAI Pro");
    expect(enText).toContain("Always Free Without Pro");
    expect(enText).toContain("€7.99 / month incl. VAT");
    expect(enText).toContain("Stripe / Link");
    expect(enText).not.toMatch(/Hunter|Dungeon|Awakening|Quest/i);
  });
});
