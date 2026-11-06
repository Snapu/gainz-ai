import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref } from "vue";
import type { DisplayWorkoutGroup } from "@/modules/aiCoach/presentation";

// Mock child components that are not under test
vi.mock("@/shared/presentation/components/AppHeader.vue", () => ({
  default: { template: "<header><slot /><slot name='actions' /></header>" },
}));
vi.mock("@/shared/presentation/components/GlobalHeaderActions.vue", () => ({
  default: { template: "<div>Actions</div>" },
}));
vi.mock("@/shared/presentation/components/TrainInteractionDeck.vue", () => ({
  default: { template: "<div>Deck</div>" },
}));
vi.mock("@/modules/aiCoach/presentation", () => ({
  WorkoutExerciseCard: { template: "<div class='exercise-card'>Card</div>" },
}));
vi.mock("@/shared/presentation/components/EmptyState.vue", () => ({
  default: { template: "<div>EmptyState</div>" },
}));
vi.mock("@/shared/presentation/components/ui/UiBadge.vue", () => ({
  default: { template: "<span>Badge</span>" },
}));
vi.mock("@/shared/presentation/components/ui/UiButton.vue", () => ({
  default: { template: "<button><slot /></button>" },
}));
vi.mock("@/shared/presentation/components/ui/UiTelemetryLoader.vue", () => ({
  default: { template: "<div>Loading...</div>" },
}));

const mockAllWorkoutGroups = ref<DisplayWorkoutGroup[] | null>(null);
const mockVisibleGroupIndex = ref(0);
const mockCompletedMap = ref(new Map<string, boolean>());

vi.mock("@/views/composables/useHomeWorkoutViewModel", () => ({
  useHomeWorkoutViewModel: () => ({
    router: { push: vi.fn() },
    editLog: vi.fn(),
    chatStore: { isLoading: false },
    isRestDay: false,
    isWorkoutComplete: false,
    allWorkoutGroups: mockAllWorkoutGroups,
    currentSessionElapsedText: null,
    getExerciseProgress: (name: string) => ({
      done: mockCompletedMap.value.get(name) ? 3 : 0,
      isCompleted: mockCompletedMap.value.get(name) ?? false,
      progressPercent: mockCompletedMap.value.get(name) ? 100 : 0,
    }),
    getExerciseProgression: () => null,
    isHighlighted: () => false,
    getLastSessionSummary: () => null,
    getTodaysLogsForExercise: () => [],
    handleLogArbitrary: vi.fn(),
    skipRest: vi.fn(),
    visibleGroupIndex: mockVisibleGroupIndex,
    activeExerciseForDeck: null,
    activeExerciseProgress: null,
    supersetAlternatives: [],
    selectSupersetExercise: vi.fn(),
    handleDeckLogCurrent: vi.fn(),
    openGoogleSearch: vi.fn(),
    restTimerStore: { isResting: false, formattedTime: "00:00", isOvertime: false },
    requestOffDayWorkout: vi.fn(),
  }),
}));

import HomeTab from "./HomeTab.vue";

describe("HomeTab Stepper Highlights", () => {
  beforeEach(() => {
    mockCompletedMap.value = new Map<string, boolean>();
    mockVisibleGroupIndex.value = 0;
    mockAllWorkoutGroups.value = [
      {
        id: "g-0",
        isSuperset: false,
        exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8" }],
      },
      {
        id: "g-1",
        isSuperset: false,
        exercises: [{ exerciseName: "Incline DB Press", targetSets: 3, targetReps: "10" }],
      },
      {
        id: "g-2",
        isSuperset: false,
        exercises: [{ exerciseName: "Cable Flyes", targetSets: 3, targetReps: "12" }],
      },
    ];
  });

  it("uniquely highlights the currently visible step and does NOT falsely highlight activeGroupIndex with primary color", async () => {
    const container = document.createElement("div");
    const app = createApp(HomeTab);
    app.mount(container);
    await nextTick();

    // User is viewing group 1, but group 0 is incomplete (activeGroupIndex = 0)
    mockVisibleGroupIndex.value = 1;
    await nextTick();

    const stepButtons = container.querySelectorAll("button[aria-label]");
    expect(stepButtons.length).toBe(3);

    // Group 0 (incomplete, not visible) should NOT have primary color or activeGroupIndex primary tint
    const bar0 = stepButtons[0].querySelector("div");
    expect(bar0?.className).not.toContain("bg-primary");
    expect(bar0?.className).toContain("bg-white/10");

    // Group 1 (visible) should have primary color and ring
    const bar1 = stepButtons[1].querySelector("div");
    expect(bar1?.className).toContain("bg-primary");
    expect(bar1?.className).toContain("ring-2");

    // Group 2 (incomplete, not visible) should be inactive
    const bar2 = stepButtons[2].querySelector("div");
    expect(bar2?.className).not.toContain("bg-primary");
    expect(bar2?.className).toContain("bg-white/10");

    app.unmount();
  });

  it("correctly styles completed visible and non-visible steps", async () => {
    mockCompletedMap.value.set("Bench Press", true);
    mockVisibleGroupIndex.value = 0;

    const container = document.createElement("div");
    const app = createApp(HomeTab);
    app.mount(container);
    await nextTick();

    // User views completed Group 0
    mockVisibleGroupIndex.value = 0;
    await nextTick();

    const stepButtons = container.querySelectorAll("button[aria-label]");

    // Group 0 is completed AND visible: emerald with ring
    const bar0 = stepButtons[0].querySelector("div");
    expect(bar0?.className).toContain("bg-emerald-500");
    expect(bar0?.className).toContain("ring-2");

    // User navigates to Group 1
    mockVisibleGroupIndex.value = 1;
    await nextTick();

    // Group 0 is completed but NOT visible: emerald without ring
    expect(bar0?.className).toContain("bg-emerald-500/80");
    expect(bar0?.className).not.toContain("ring-2");

    // Group 1 is visible and incomplete: primary with ring
    const bar1 = stepButtons[1].querySelector("div");
    expect(bar1?.className).toContain("bg-primary");
    expect(bar1?.className).toContain("ring-2");

    app.unmount();
  });

  function mockGalleryLayout(gallery: HTMLElement, offsets = [0, 376, 752]) {
    const children = gallery.children;
    offsets.forEach((offset, idx) => {
      if (children[idx]) {
        Object.defineProperty(children[idx], "offsetLeft", { value: offset, configurable: true });
      }
    });
  }

  it("updates visibleGroupIndex and triggers scroll when a stepper button is clicked", async () => {
    const container = document.createElement("div");
    const app = createApp(HomeTab);
    app.mount(container);
    await nextTick();

    const gallery = container.querySelector(".overflow-x-auto") as HTMLElement;
    const scrollToSpy = vi.fn();
    gallery.scrollTo = scrollToSpy;

    mockGalleryLayout(gallery);

    const stepButtons = container.querySelectorAll("button[aria-label]");
    (stepButtons[2] as HTMLButtonElement).click();
    await nextTick();

    expect(mockVisibleGroupIndex.value).toBe(2);
    expect(scrollToSpy).toHaveBeenCalledWith({
      left: 752,
      behavior: "smooth",
    });

    app.unmount();
  });

  it("synchronizes visibleGroupIndex when user scrolls the gallery container", async () => {
    const container = document.createElement("div");
    const app = createApp(HomeTab);
    app.mount(container);
    await nextTick();

    const gallery = container.querySelector(".overflow-x-auto") as HTMLElement;
    mockGalleryLayout(gallery);

    // User scrolled to item 1
    Object.defineProperty(gallery, "scrollLeft", { value: 376, configurable: true });
    gallery.dispatchEvent(new Event("scroll"));
    await nextTick();

    expect(mockVisibleGroupIndex.value).toBe(1);

    // Scrollend event confirms settlement on item 1
    gallery.dispatchEvent(new Event("scrollend"));
    await nextTick();

    expect(mockVisibleGroupIndex.value).toBe(1);

    app.unmount();
  });

  it("ignores intermediate scroll events while a programmatic smooth scroll is running", async () => {
    const container = document.createElement("div");
    const app = createApp(HomeTab);
    app.mount(container);
    await nextTick();

    const gallery = container.querySelector(".overflow-x-auto") as HTMLElement;
    gallery.scrollTo = vi.fn();
    mockGalleryLayout(gallery);

    // Click step 2: initiates programmatic scroll to index 2
    const stepButtons = container.querySelectorAll("button[aria-label]");
    (stepButtons[2] as HTMLButtonElement).click();
    await nextTick();

    expect(mockVisibleGroupIndex.value).toBe(2);

    // Mid-scroll, intermediate scroll event fires passing by step 1
    Object.defineProperty(gallery, "scrollLeft", { value: 376, configurable: true });
    gallery.dispatchEvent(new Event("scroll"));
    await nextTick();

    // visibleGroupIndex must NOT be clobbered back to 1
    expect(mockVisibleGroupIndex.value).toBe(2);

    app.unmount();
  });
});
