import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, reactive, ref } from "vue";
import {
  type DisplayExercise,
  type DisplayWorkoutGroup,
  groupWorkout,
} from "@/modules/aiCoach/presentation";

// Mock child components that are not under test
vi.mock("@/shared/presentation/components/TrainInteractionDeck.vue", () => ({
  default: {
    name: "TrainInteractionDeck",
    props: ["currentExercise", "currentProgress", "isWorkoutComplete"],
    emits: ["logCurrent", "logCustom", "skipRest"],
    template: `
      <div
        data-testid="train-interaction-deck-stub"
        :data-workout-complete="String(Boolean(isWorkoutComplete))"
      />
    `,
  },
}));
vi.mock("@/modules/aiCoach/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/aiCoach/presentation")>();
  return {
    ...actual,
    WorkoutExerciseCard: {
      props: ["exercise", "loggedSets", "supersetLabel"],
      template:
        "<div class='exercise-card' :data-superset-label='supersetLabel'>{{ exercise?.exerciseName }} ({{ loggedSets?.length ?? 0 }})</div>",
    },
  };
});
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
const mockLogsByExercise = ref(new Map<string, { id: string }[]>());
const mockActiveExerciseForDeck = ref<DisplayExercise | null>(null);
const mockSelectedSupersetExerciseName = ref<string | null>(null);
const mockIsWorkoutComplete = ref(false);
const mockRestTimerStore = reactive({
  isResting: false,
  formattedTime: "00:00",
  isOvertime: false,
});
const mockSelectSupersetExercise = vi.fn((name: string) => {
  mockSelectedSupersetExerciseName.value = name;
});

vi.mock("@/views/composables/useHomeWorkoutViewModel", () => ({
  useHomeWorkoutViewModel: () => ({
    router: { push: vi.fn() },
    editLog: vi.fn(),
    chatStore: { isLoading: false },
    isRestDay: false,
    isWorkoutComplete: mockIsWorkoutComplete,
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
    getTodaysLogsForExercise: (name: string) => mockLogsByExercise.value.get(name) ?? [],
    handleLogArbitrary: vi.fn(),
    skipRest: vi.fn(),
    visibleGroupIndex: mockVisibleGroupIndex,
    activeExerciseForDeck: mockActiveExerciseForDeck,
    activeExerciseProgress: null,
    selectedSupersetExerciseName: mockSelectedSupersetExerciseName,
    selectSupersetExercise: mockSelectSupersetExercise,
    handleDeckLogCurrent: vi.fn(),
    openGoogleSearch: vi.fn(),
    restTimerStore: mockRestTimerStore,
    requestOffDayWorkout: vi.fn(),
  }),
}));

import HomeTab from "./HomeTab.vue";

describe("HomeTab Stepper Highlights", () => {
  beforeEach(() => {
    mockCompletedMap.value = new Map<string, boolean>();
    mockLogsByExercise.value = new Map<string, { id: string }[]>();
    mockVisibleGroupIndex.value = 0;
    mockIsWorkoutComplete.value = false;
    mockRestTimerStore.isResting = false;
    mockRestTimerStore.formattedTime = "00:00";
    mockRestTimerStore.isOvertime = false;
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

    const stepButtons = container.querySelectorAll(
      "[data-testid='workout-stepper'] button[aria-label]",
    );
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

    const stepButtons = container.querySelectorAll(
      "[data-testid='workout-stepper'] button[aria-label]",
    );

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

    const stepButtons = container.querySelectorAll(
      "[data-testid='workout-stepper'] button[aria-label]",
    );
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
    const stepButtons = container.querySelectorAll(
      "[data-testid='workout-stepper'] button[aria-label]",
    );
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

  describe("Superset Auto-Scroll", () => {
    beforeEach(() => {
      mockCompletedMap.value = new Map<string, boolean>();
      mockVisibleGroupIndex.value = 0;
      mockSelectedSupersetExerciseName.value = null;
      mockSelectSupersetExercise.mockClear();
      mockAllWorkoutGroups.value = [
        {
          id: "g-0",
          isSuperset: true,
          exercises: [
            { exerciseName: "Bench Press", targetSets: 3, targetReps: "8" },
            { exerciseName: "Barbell Row", targetSets: 3, targetReps: "8" },
          ],
        },
      ];
    });

    it("smoothly scrolls main to the newly selected superset exercise when switch button is clicked", async () => {
      const container = document.createElement("div");
      const app = createApp(HomeTab);
      app.mount(container);
      await nextTick();

      const main = container.querySelector("main") as HTMLElement;
      const scrollToSpy = vi.fn();
      main.scrollTo = scrollToSpy;

      // Mock bounding rects and header offset
      main.getBoundingClientRect = () =>
        ({ top: 50, height: 600, bottom: 650, left: 0, right: 400, width: 400 }) as DOMRect;

      const cards = container.querySelectorAll<HTMLElement>("[data-exercise-name]");
      expect(cards.length).toBe(2);

      cards[0].getBoundingClientRect = () =>
        ({ top: 138, height: 200, bottom: 338, left: 0, right: 400, width: 400 }) as DOMRect;
      cards[1].getBoundingClientRect = () =>
        ({ top: 350, height: 200, bottom: 550, left: 0, right: 400, width: 400 }) as DOMRect;

      const pills = container.querySelectorAll<HTMLButtonElement>("[data-testid='superset-pill']");
      expect(pills.length).toBe(2);
      pills[1].click();
      await nextTick();

      expect(mockSelectSupersetExercise).toHaveBeenCalledWith("Barbell Row");
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: "smooth",
          top: expect.any(Number),
        }),
      );

      app.unmount();
    });

    it("falls back to scrollIntoView when container layout metrics are zero", async () => {
      const container = document.createElement("div");
      const app = createApp(HomeTab);
      app.mount(container);
      await nextTick();

      const cards = container.querySelectorAll<HTMLElement>("[data-exercise-name]");
      expect(cards.length).toBe(2);

      const scrollIntoViewSpy = vi.fn();
      cards[1].scrollIntoView = scrollIntoViewSpy;

      const pills = container.querySelectorAll<HTMLButtonElement>("[data-testid='superset-pill']");
      expect(pills.length).toBe(2);
      pills[1].click();
      await nextTick();

      expect(mockSelectSupersetExercise).toHaveBeenCalledWith("Barbell Row");
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "nearest",
      });

      app.unmount();
    });

    it("triggers scroll when selectedSupersetExerciseName changes via reactive watch", async () => {
      const container = document.createElement("div");
      const app = createApp(HomeTab);
      app.mount(container);
      await nextTick();

      const main = container.querySelector("main") as HTMLElement;
      const scrollToSpy = vi.fn();
      main.scrollTo = scrollToSpy;

      main.getBoundingClientRect = () =>
        ({ top: 50, height: 600, bottom: 650, left: 0, right: 400, width: 400 }) as DOMRect;

      const cards = container.querySelectorAll<HTMLElement>("[data-exercise-name]");
      cards[1].getBoundingClientRect = () =>
        ({ top: 350, height: 200, bottom: 550, left: 0, right: 400, width: 400 }) as DOMRect;

      mockSelectedSupersetExerciseName.value = "Barbell Row";
      await nextTick();

      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: "smooth",
          top: expect.any(Number),
        }),
      );

      app.unmount();
    });

    it("scopes exercise card query to the active superset group slide when an exercise appears in earlier groups", async () => {
      mockVisibleGroupIndex.value = 1;
      mockAllWorkoutGroups.value = [
        {
          id: "g-0",
          isSuperset: false,
          exercises: [{ exerciseName: "Bench Press", targetSets: 2, targetReps: "10" }],
        },
        {
          id: "g-1",
          isSuperset: true,
          exercises: [
            { exerciseName: "Bench Press", targetSets: 3, targetReps: "8" },
            { exerciseName: "Barbell Row", targetSets: 3, targetReps: "8" },
          ],
        },
      ];

      const container = document.createElement("div");
      const app = createApp(HomeTab);
      app.mount(container);
      await nextTick();

      // User navigated to group 1
      mockVisibleGroupIndex.value = 1;
      await nextTick();

      const main = container.querySelector("main") as HTMLElement;
      const scrollToSpy = vi.fn();
      main.scrollTo = scrollToSpy;

      main.getBoundingClientRect = () =>
        ({ top: 50, height: 600, bottom: 650, left: 0, right: 400, width: 400 }) as DOMRect;

      // Group 0 has 1 Bench Press card. Group 1 has 2 cards: Bench Press and Barbell Row.
      const cards = container.querySelectorAll<HTMLElement>("[data-exercise-name]");
      expect(cards.length).toBe(3);

      // Card 0 (in group 0): top 100
      cards[0].getBoundingClientRect = () =>
        ({ top: 100, height: 200, bottom: 300, left: 0, right: 400, width: 400 }) as DOMRect;
      // Card 1 (Bench Press in active group 1): top 300
      cards[1].getBoundingClientRect = () =>
        ({ top: 300, height: 200, bottom: 500, left: 0, right: 400, width: 400 }) as DOMRect;
      // Card 2 (Barbell Row in active group 1): top 520
      cards[2].getBoundingClientRect = () =>
        ({ top: 520, height: 200, bottom: 720, left: 0, right: 400, width: 400 }) as DOMRect;

      // Select Bench Press in active group 1
      mockSelectedSupersetExerciseName.value = "Bench Press";
      await nextTick();

      // Top should be calculated relative to card[1] (top 300 in group 1), NOT card[0] (top 100 in group 0)
      // cardRect.top (300) - containerRect.top (50) - 0 = 250
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          top: 250,
          behavior: "smooth",
        }),
      );

      app.unmount();
    });

    it("selects the superset exercise when clicking on its card directly", async () => {
      mockActiveExerciseForDeck.value = {
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: "8",
      };

      const container = document.createElement("div");
      const app = createApp(HomeTab);
      app.mount(container);
      await nextTick();

      const main = container.querySelector("main") as HTMLElement;
      const scrollToSpy = vi.fn();
      main.scrollTo = scrollToSpy;

      main.getBoundingClientRect = () =>
        ({ top: 50, height: 600, bottom: 650, left: 0, right: 400, width: 400 }) as DOMRect;

      const cards = container.querySelectorAll<HTMLElement>("[data-exercise-name]");
      expect(cards.length).toBe(2);

      cards[1].getBoundingClientRect = () =>
        ({ top: 350, height: 200, bottom: 550, left: 0, right: 400, width: 400 }) as DOMRect;

      // Click the Barbell Row card (index 1) directly
      cards[1].click();
      await nextTick();

      expect(mockSelectSupersetExercise).toHaveBeenCalledWith("Barbell Row");
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: "smooth",
          top: expect.any(Number),
        }),
      );

      app.unmount();
    });

    it("does not re-select or re-scroll when clicking an already active superset card", async () => {
      mockActiveExerciseForDeck.value = {
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: "8",
      };

      const container = document.createElement("div");
      const app = createApp(HomeTab);
      app.mount(container);
      await nextTick();

      const main = container.querySelector("main") as HTMLElement;
      const scrollToSpy = vi.fn();
      main.scrollTo = scrollToSpy;

      const cards = container.querySelectorAll<HTMLElement>("[data-exercise-name]");
      expect(cards.length).toBe(2);

      // Click the already active Bench Press card (index 0)
      cards[0].click();
      await nextTick();

      expect(mockSelectSupersetExercise).not.toHaveBeenCalled();
      expect(scrollToSpy).not.toHaveBeenCalled();

      app.unmount();
    });
  });

  it("preserves DOM identity of cards, slides, and stepper buttons when logging a set recomputes allWorkoutGroups", async () => {
    const workout: DisplayExercise[] = [
      { exerciseName: "Bench Press", targetSets: 1, targetReps: "8" },
      { exerciseName: "Squat", targetSets: 3, targetReps: "5" },
      { exerciseName: "Curl", targetSets: 3, targetReps: "12", supersetId: "ss-1" },
      { exerciseName: "Tricep Extension", targetSets: 3, targetReps: "12", supersetId: "ss-1" },
    ];
    mockAllWorkoutGroups.value = groupWorkout(workout);

    const container = document.createElement("div");
    const app = createApp(HomeTab);
    app.mount(container);
    await nextTick();

    const initialStepButtons = Array.from(
      container.querySelectorAll("[data-testid='workout-stepper'] button[aria-label]"),
    );
    const gallery = container.querySelector(".overflow-x-auto") as HTMLElement;
    const initialSlides = Array.from(gallery.children);
    const initialCards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-exercise-name]"),
    );

    expect(initialStepButtons).toHaveLength(3);
    expect(initialSlides).toHaveLength(3);
    expect(initialCards).toHaveLength(4);

    initialCards[0].scrollTop = 42;

    mockLogsByExercise.value.set("Bench Press", [{ id: "set-1" }]);
    mockCompletedMap.value.set("Bench Press", true);
    mockAllWorkoutGroups.value = groupWorkout(workout.map((ex) => ({ ...ex })));
    await nextTick();

    const nextStepButtons = Array.from(
      container.querySelectorAll("[data-testid='workout-stepper'] button[aria-label]"),
    );
    const nextSlides = Array.from(gallery.children);
    const nextCards = Array.from(container.querySelectorAll<HTMLElement>("[data-exercise-name]"));

    expect(nextStepButtons).toHaveLength(3);
    nextStepButtons.forEach((btn, idx) => {
      expect(btn).toBe(initialStepButtons[idx]);
    });
    expect(nextSlides).toHaveLength(3);
    nextSlides.forEach((slide, idx) => {
      expect(slide).toBe(initialSlides[idx]);
    });
    expect(nextCards).toHaveLength(4);
    nextCards.forEach((card, idx) => {
      expect(card).toBe(initialCards[idx]);
    });

    expect(initialCards[0].scrollTop).toBe(42);
    expect(initialCards[0].textContent).toContain("(1)");
    expect(initialStepButtons[0].querySelector("div")?.className).toContain("bg-emerald-500");

    app.unmount();
  });

  it("renders sticky header rest indicator in emerald during rest and red during overtime", async () => {
    mockRestTimerStore.isResting = true;
    mockRestTimerStore.formattedTime = "1:15";
    mockRestTimerStore.isOvertime = false;

    const container = document.createElement("div");
    const app = createApp(HomeTab);
    app.mount(container);
    await nextTick();

    const emeraldRestTime = Array.from(container.querySelectorAll("span")).find((el) =>
      el.textContent?.includes("1:15"),
    );
    expect(emeraldRestTime).toBeDefined();
    expect(emeraldRestTime?.className).toContain("text-emerald-400");

    mockRestTimerStore.formattedTime = "+0:15";
    mockRestTimerStore.isOvertime = true;
    await nextTick();

    const overtimeRestTime = Array.from(container.querySelectorAll("span")).find((el) =>
      el.textContent?.includes("+0:15"),
    );
    expect(overtimeRestTime).toBeDefined();
    expect(overtimeRestTime?.className).toContain("text-red-400");

    app.unmount();
  });

  it("forwards isWorkoutComplete to TrainInteractionDeck without rendering an inline completion banner", async () => {
    mockIsWorkoutComplete.value = true;

    const container = document.createElement("div");
    const app = createApp(HomeTab);
    app.mount(container);
    await nextTick();

    const deckStub = container.querySelector("[data-testid='train-interaction-deck-stub']");
    expect(deckStub?.getAttribute("data-workout-complete")).toBe("true");
    expect(container.querySelector("main")?.textContent).not.toContain("Workout Complete");

    app.unmount();
  });

  describe("Header Workout Navigation & Superset Switcher", () => {
    it("navigates between workout groups with prev/next buttons and displays group counter for non-superset exercises", async () => {
      const container = document.createElement("div");
      const app = createApp(HomeTab);
      app.mount(container);
      await nextTick();

      const gallery = container.querySelector(".overflow-x-auto") as HTMLElement;
      const scrollToSpy = vi.fn();
      gallery.scrollTo = scrollToSpy;
      mockGalleryLayout(gallery);

      const prevBtn = container.querySelector<HTMLButtonElement>(
        "[data-testid='workout-nav-prev']",
      );
      const nextBtn = container.querySelector<HTMLButtonElement>(
        "[data-testid='workout-nav-next']",
      );
      const counter = container.querySelector("[data-testid='workout-group-counter']");

      expect(prevBtn?.disabled).toBe(true);
      expect(nextBtn?.disabled).toBe(false);
      expect(counter?.textContent?.trim()).toBe("1 / 3");
      expect(container.querySelector("[data-testid='superset-switcher']")).toBeNull();

      nextBtn?.click();
      await nextTick();

      expect(mockVisibleGroupIndex.value).toBe(1);
      expect(scrollToSpy).toHaveBeenCalledWith({ left: 376, behavior: "smooth" });
      expect(prevBtn?.disabled).toBe(false);
      expect(counter?.textContent?.trim()).toBe("2 / 3");

      nextBtn?.click();
      await nextTick();

      expect(mockVisibleGroupIndex.value).toBe(2);
      expect(nextBtn?.disabled).toBe(true);
      expect(counter?.textContent?.trim()).toBe("3 / 3");

      prevBtn?.click();
      await nextTick();

      expect(mockVisibleGroupIndex.value).toBe(1);

      app.unmount();
    });

    it("renders Superset A/B switcher pills in the nav row and passes A/B labels to WorkoutExerciseCard", async () => {
      mockActiveExerciseForDeck.value = {
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: "8",
      };
      mockAllWorkoutGroups.value = [
        {
          id: "g-0",
          isSuperset: true,
          exercises: [
            { exerciseName: "Bench Press", targetSets: 3, targetReps: "8" },
            { exerciseName: "Barbell Row", targetSets: 3, targetReps: "8" },
          ],
        },
      ];

      const container = document.createElement("div");
      const app = createApp(HomeTab);
      app.mount(container);
      await nextTick();

      const switcher = container.querySelector("[data-testid='superset-switcher']");
      expect(switcher).not.toBeNull();
      expect(switcher?.textContent).toContain("Superset");
      expect(container.querySelector("[data-testid='workout-group-counter']")).toBeNull();

      const pills = container.querySelectorAll<HTMLButtonElement>("[data-testid='superset-pill']");
      expect(Array.from(pills).map((p) => p.textContent?.trim())).toEqual(["A", "B"]);
      expect(pills[0].getAttribute("aria-pressed")).toBe("true");
      expect(pills[1].getAttribute("aria-pressed")).toBe("false");

      const cards = container.querySelectorAll<HTMLElement>("[data-exercise-name]");
      expect(cards[0].getAttribute("data-superset-label")).toBe("A");
      expect(cards[1].getAttribute("data-superset-label")).toBe("B");

      app.unmount();
    });
  });
});
