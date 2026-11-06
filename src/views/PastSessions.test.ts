import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import PastSessions from "./PastSessions.vue";

vi.mock("vue-router", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/shared/presentation/composables/useLogSheet", () => ({
  useLogSheet: () => ({
    isOpen: { value: false },
    logToEdit: { value: null },
    prefillData: { value: null },
    restSeconds: { value: 90 },
    openEditLog: vi.fn(),
  }),
}));

vi.mock("@/modules/trainingLogs/presentation/components/LogExerciseSheet.vue", () => ({
  default: { template: "<div data-testid='log-sheet' />" },
}));

describe("PastSessions.vue", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("groups sets crossing midnight into a single session on the starting day", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const logsStore = useExerciseLogsStore();

    // Thursday evening sets (3 sets)
    const log1 = {
      id: "1",
      exerciseName: "Squat",
      loggedAt: new Date("2026-11-05T23:20:00"),
      weight: 100,
      reps: 5,
    };
    const log2 = {
      id: "2",
      exerciseName: "Squat",
      loggedAt: new Date("2026-11-05T23:35:00"),
      weight: 100,
      reps: 5,
    };
    const log3 = {
      id: "3",
      exerciseName: "Squat",
      loggedAt: new Date("2026-11-05T23:50:00"),
      weight: 100,
      reps: 5,
    };

    // Friday morning sets after midnight (2 sets within 45 min of log3)
    const log4 = {
      id: "4",
      exerciseName: "Plank",
      loggedAt: new Date("2026-11-06T00:05:00"),
      weight: 0,
      reps: 1,
    };
    const log5 = {
      id: "5",
      exerciseName: "Face Pulls",
      loggedAt: new Date("2026-11-06T00:15:00"),
      weight: 45,
      reps: 10,
    };

    logsStore.exerciseLogs = [log1, log2, log3, log4, log5];

    const container = document.createElement("div");
    const app = createApp(PastSessions);
    app.use(pinia);
    app.mount(container);
    await nextTick();

    // Look for rendered session groups
    // The session date header is inside the session card toggle button
    const sessionHeaders = container.querySelectorAll("button h3");
    // Crucial: Must be ONE session card, NOT two!
    expect(sessionHeaders.length).toBe(1);

    const expectedDate = new Date("2026-11-05T23:20:00").toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    expect(sessionHeaders[0]?.textContent?.trim().toLowerCase()).toBe(expectedDate.toLowerCase());

    // Total duration: 23:20 to 00:15 = 55 minutes
    expect(container.textContent).toContain("55");
    // Volume: 5 sets
    expect(container.textContent).toContain("5");

    app.unmount();
  });

  it("renders distinct sessions when gap between workouts exceeds inactivity window", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const logsStore = useExerciseLogsStore();

    const morningLog = {
      id: "1",
      exerciseName: "Squat",
      loggedAt: new Date("2026-11-05T09:00:00"),
      weight: 100,
      reps: 5,
    };
    const eveningLog = {
      id: "2",
      exerciseName: "Bench Press",
      loggedAt: new Date("2026-11-05T18:00:00"),
      weight: 80,
      reps: 5,
    };

    logsStore.exerciseLogs = [morningLog, eveningLog];

    const container = document.createElement("div");
    const app = createApp(PastSessions);
    app.use(pinia);
    app.mount(container);
    await nextTick();

    const sessionHeaders = container.querySelectorAll("button h3");
    expect(sessionHeaders.length).toBe(2);

    app.unmount();
  });
});
