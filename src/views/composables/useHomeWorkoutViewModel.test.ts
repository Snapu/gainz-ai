import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import { useCoachChatStore, useTrainingPlanStore } from "@/modules/aiCoach/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { useHomeWorkoutViewModel } from "./useHomeWorkoutViewModel";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/shared/presentation/composables/useLogSheet", () => ({
  useLogSheet: () => ({
    openEditLog: vi.fn(),
    openLogSheet: vi.fn(),
  }),
}));

vi.mock("@/modules/aiCoach/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/aiCoach/presentation")>();
  return {
    ...actual,
    useAiOrchestratorStore: () => ({
      ensureSessionAdvice: vi.fn(),
      requestAdvice: vi.fn(),
      generateNewPlan: vi.fn(),
    }),
  };
});

describe("useHomeWorkoutViewModel", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("reflects hasActivePlan accurately", () => {
    const planStore = useTrainingPlanStore();
    const vm = useHomeWorkoutViewModel();

    expect(vm.hasActivePlan.value).toBe(false);

    planStore.setPlan(
      TrainingPlan.create("2026-10-29T00:00:00.000Z", 2, [
        {
          weekNumber: 1,
          dayOfWeek: new Date().getDay(),
          sessionLabel: "Leg Day",
          focusDescription: "Quads & Glutes",
          exercises: [
            {
              exerciseName: "Squat",
              targetSets: 3,
              targetReps: "5",
              restSeconds: 180,
            },
          ],
        },
      ]),
    );

    expect(vm.hasActivePlan.value).toBe(true);
  });

  it("treats coach rest day as isRestDay even without an active plan", () => {
    const chatStore = useCoachChatStore();
    const vm = useHomeWorkoutViewModel();

    expect(vm.isRestDay.value).toBe(false);

    // Coach gives advice with empty recommendedWorkout (rest day)
    chatStore.addMessage({
      id: "coach-rest",
      role: "coach",
      content: JSON.stringify({
        coachMessage: "Take a rest day today to recover.",
        recommendedWorkout: [],
      }),
      timestamp: new Date().toISOString(),
      sessionId: chatStore.currentSessionId,
      logsCount: 0,
    });

    expect(vm.isCoachRestDay.value).toBe(true);
    expect(vm.isRestDay.value).toBe(true);
  });

  it("evaluates isRestDay as false when coach prescribes a workout on a scheduled plan off-day", () => {
    const planStore = useTrainingPlanStore();
    const chatStore = useCoachChatStore();
    const currentDay = new Date().getDay();
    // Schedule plan session on a different day so today has no planDerivedWorkout
    const otherDay = (currentDay + 2) % 7;

    planStore.setPlan(
      TrainingPlan.create(new Date().toISOString(), 1, [
        {
          weekNumber: 1,
          dayOfWeek: otherDay,
          sessionLabel: "Leg Day",
          focusDescription: "Quads",
          exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5", restSeconds: 180 }],
        },
      ]),
    );

    // Coach prescribes an off-day workout today
    chatStore.addMessage({
      id: "coach-off-day-workout",
      role: "coach",
      content: JSON.stringify({
        coachMessage: "Here is your off-day arm workout.",
        recommendedWorkout: [
          { exerciseName: "Bicep Curls", targetSets: 3, targetReps: "12", restSeconds: 90 },
        ],
      }),
      timestamp: new Date().toISOString(),
      sessionId: chatStore.currentSessionId,
      logsCount: 0,
    });

    const vm = useHomeWorkoutViewModel();
    expect(vm.isCoachRestDay.value).toBe(false);
    expect(vm.isRestDay.value).toBe(false);
  });

  it("computes isWorkoutComplete when all exercises reach their target sets", () => {
    const planStore = useTrainingPlanStore();
    const logsStore = useExerciseLogsStore();
    const currentDay = new Date().getDay();

    planStore.setPlan(
      TrainingPlan.create(new Date().toISOString(), 1, [
        {
          weekNumber: 1,
          dayOfWeek: currentDay,
          sessionLabel: "Upper Body",
          focusDescription: "Chest",
          exercises: [
            {
              exerciseName: "Bench Press",
              targetSets: 2,
              targetReps: "8-10",
              restSeconds: 120,
            },
          ],
        },
      ]),
    );

    const vm = useHomeWorkoutViewModel();
    expect(vm.isWorkoutComplete.value).toBe(false);

    // Log 1st set
    logsStore.addExerciseLog({
      id: "l1",
      exerciseName: "Bench Press",
      reps: 8,
      weight: 80,
      loggedAt: new Date(),
    });

    expect(vm.isWorkoutComplete.value).toBe(false);

    // Log 2nd set (targetSets reached)
    logsStore.addExerciseLog({
      id: "l2",
      exerciseName: "Bench Press",
      reps: 8,
      weight: 80,
      loggedAt: new Date(),
    });

    expect(vm.isWorkoutComplete.value).toBe(true);
  });
});
