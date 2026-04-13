import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import type { UserProgress } from "@/services/leveling";
import RankDetailsOverlay from "./RankDetailsOverlay.vue";

function createMockProgress(overrides?: Partial<UserProgress>): UserProgress {
  return {
    level: 10,
    totalXP: 1000,
    xpIntoLevel: 200,
    xpForNextLevel: 300,
    progressPercent: 66.67,
    readiness: 1.5,
    title: "Iron Fist",
    description: "A warrior's journey begins",
    avatar: "/avatars/rank-10.webp",
    totalWorkoutDays: 50,
    totalVolumeKg: 50000,
    totalSets: 500,
    totalReps: 5000,
    journeyDurationWeeks: 12,
    firstSessionDate: new Date("2024-01-01"),
    xpBreakdown: {
      discipline: 250,
      intensity: 250,
      progression: 250,
      mastery: 250,
    },
    ...overrides,
  };
}

describe("RankDetailsOverlay", () => {
  it("renders the rank hero section", () => {
    const wrapper = mount(RankDetailsOverlay, {
      props: {
        open: true,
        progress: createMockProgress(),
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          BottomSheet: { template: "<div><slot /></div>" },
          UiCard: {
            template: "<div :data-section=\"$attrs['data-section']\"><slot /></div>",
          },
          Progress: { template: "<div></div>" },
          UiDonutChart: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.find('[data-section="rank-hero"]').exists()).toBe(true);
  });

  it("displays user progress data", () => {
    const wrapper = mount(RankDetailsOverlay, {
      props: {
        open: true,
        progress: createMockProgress(),
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          BottomSheet: { template: "<div><slot /></div>" },
          UiCard: {
            template: "<div :data-section=\"$attrs['data-section']\"><slot /></div>",
          },
          Progress: { template: "<div></div>" },
          UiDonutChart: { template: "<div><slot /></div>" },
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Iron Fist");
    expect(text).toContain("Level 10");
  });

  it("mounts without errors", () => {
    expect(() => {
      mount(RankDetailsOverlay, {
        props: {
          open: true,
          progress: createMockProgress(),
        },
        global: {
          plugins: [createPinia()],
          stubs: {
            BottomSheet: { template: "<div><slot /></div>" },
            UiCard: {
              template: "<div :data-section=\"$attrs['data-section']\"><slot /></div>",
            },
            Progress: { template: "<div></div>" },
            UiDonutChart: { template: "<div><slot /></div>" },
          },
        },
      });
    }).not.toThrow();
  });
});
