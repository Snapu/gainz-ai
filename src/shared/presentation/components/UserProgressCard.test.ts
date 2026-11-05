import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { UserProgress } from "@/modules/sharedKernel/presentation";
import UserProgressCard from "./UserProgressCard.vue";

function makeMockProgress(overrides: Partial<UserProgress> = {}): UserProgress {
  return {
    level: 42,
    totalXP: 12500,
    xpIntoLevel: 250,
    xpForNextLevel: 1000,
    progressPercent: 25,
    readiness: 1.2,
    title: "Champion of Will",
    description: "Battle-tested athlete.",
    avatar: "/assets/ranks/rank-8.png",
    totalWorkoutDays: 48,
    totalVolumeKg: 52400,
    totalSets: 320,
    totalReps: 3200,
    journeyDurationWeeks: 14,
    firstSessionDate: new Date("2026-01-01"),
    xpBreakdown: { discipline: 4000, intensity: 3500, progression: 3000, mastery: 2000 },
    ...overrides,
  };
}

function mountComponent(progress: UserProgress) {
  const container = document.createElement("div");
  const Host = defineComponent({
    setup() {
      return () => h(UserProgressCard, { progress });
    },
  });
  const app = createApp(Host);
  app.mount(container);
  return { container, unmount: () => app.unmount() };
}

describe("UserProgressCard", () => {
  it("renders rank title, level, and formatted 2x2 lifetime telemetry", async () => {
    const { container, unmount } = mountComponent(makeMockProgress());
    await nextTick();

    expect(container.textContent).toContain("Champion of Will");
    expect(container.textContent).toContain("42");
    expect(container.textContent).toContain("52.4 t");
    expect(container.textContent).toContain("3 mos");
    expect(container.textContent).toContain("48");
    expect(container.textContent).toMatch(/12[.,\s]?500 XP/);

    unmount();
  });

  it("formats kilograms when tonnage is below 1,000 kg", async () => {
    const { container, unmount } = mountComponent(makeMockProgress({ totalVolumeKg: 750 }));
    await nextTick();

    expect(container.textContent).toContain("750 kg");

    unmount();
  });

  it("formats years when journey exceeds 52 weeks", async () => {
    const { container, unmount } = mountComponent(makeMockProgress({ journeyDurationWeeks: 78 }));
    await nextTick();

    expect(container.textContent).toContain("1.5 yrs");

    unmount();
  });
});
