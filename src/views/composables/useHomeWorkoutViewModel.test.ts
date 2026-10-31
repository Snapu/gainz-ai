import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import { useCoachChatStore, useTrainingPlanStore } from "@/modules/aiCoach/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { useHomeWorkoutViewModel } from "./useHomeWorkoutViewModel";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockOpenPrefilledLog = vi.fn();
const mockOpenEditLog = vi.fn();

vi.mock("@/shared/presentation/composables/useLogSheet", () => ({
  useLogSheet: () => ({
    openEditLog: mockOpenEditLog,
    openPrefilledLog: mockOpenPrefilledLog,
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
    mockOpenPrefilledLog.mockClear();
    mockOpenEditLog.mockClear();
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

  describe("handleLogExercise", () => {
    it("prefills with plan optimum targets for the first set when no prior sets are logged", () => {
      const vm = useHomeWorkoutViewModel();

      vm.handleLogExercise({
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: "8-12",
        targetWeight: "100kg",
        targetRpe: 8,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Bench Press",
          reps: 12,
          duration: undefined,
          distance: undefined,
          weight: 100,
          rpe: 8,
        },
        null,
      );
    });

    it("prefills with numbers logged in the first set instead of optimum when logging second set", () => {
      const logsStore = useExerciseLogsStore();
      const vm = useHomeWorkoutViewModel();

      // User logged set 1 with adjusted numbers (different from the 8-12 / 100kg optimum)
      logsStore.addExerciseLog({
        id: "set-1",
        exerciseName: "Bench Press",
        reps: 9,
        weight: 92.5,
        rpe: 8.5,
        loggedAt: new Date(),
      });

      // User clicks to log set 2
      vm.handleLogExercise({
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: "8-12",
        targetWeight: "100kg",
        targetRpe: 8,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Bench Press",
          reps: 9,
          duration: undefined,
          distance: undefined,
          weight: 92.5,
          rpe: 8.5,
        },
        null,
      );
    });

    it("prefills with the latest logged set when multiple sets have already been logged", () => {
      const logsStore = useExerciseLogsStore();
      const vm = useHomeWorkoutViewModel();

      const now = Date.now();
      logsStore.addExerciseLog({
        id: "set-1",
        exerciseName: "Bench Press",
        reps: 10,
        weight: 95,
        rpe: 8,
        loggedAt: new Date(now - 120_000),
      });

      logsStore.addExerciseLog({
        id: "set-2",
        exerciseName: "Bench Press",
        reps: 8,
        weight: 92.5,
        rpe: 9,
        loggedAt: new Date(now - 60_000),
      });

      // User clicks to log set 3
      vm.handleLogExercise({
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: "8-12",
        targetWeight: "100kg",
        targetRpe: 8,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Bench Press",
          reps: 8,
          duration: undefined,
          distance: undefined,
          weight: 92.5,
          rpe: 9,
        },
        null,
      );
    });

    it("prefills duration from previous set for duration-based exercises", () => {
      const logsStore = useExerciseLogsStore();
      const vm = useHomeWorkoutViewModel();

      logsStore.addExerciseLog({
        id: "set-1",
        exerciseName: "Plank",
        duration: 0.75,
        loggedAt: new Date(),
      });

      vm.handleLogExercise({
        exerciseName: "Plank",
        targetSets: 3,
        targetReps: "60s",
        targetDurationSeconds: 60,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Plank",
          reps: undefined,
          duration: 0.75,
          distance: undefined,
          weight: undefined,
          rpe: undefined,
        },
        null,
      );
    });

    it("does not corrupt reps from targetReps for duration exercises when prior set has no logged volume", () => {
      const logsStore = useExerciseLogsStore();
      const vm = useHomeWorkoutViewModel();

      logsStore.addExerciseLog({
        id: "set-1",
        exerciseName: "Plank",
        weight: 10, // Weighted plank with only weight logged
        loggedAt: new Date(),
      });

      vm.handleLogExercise({
        exerciseName: "Plank",
        targetSets: 3,
        targetReps: "60s",
        targetDurationSeconds: 60,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Plank",
          reps: undefined,
          duration: 1, // 60s -> 1.0 min
          distance: undefined,
          weight: 10,
          rpe: undefined,
        },
        null,
      );
    });

    it("prefills distance from previous set or plan target for distance-based exercises", () => {
      const logsStore = useExerciseLogsStore();
      const vm = useHomeWorkoutViewModel();

      // Prefill from plan target
      vm.handleLogExercise({
        exerciseName: "Running",
        targetSets: 1,
        targetDistanceMeters: 5000,
        targetDurationSeconds: 1800,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Running",
          reps: undefined,
          duration: 30, // 1800s -> 30 min
          distance: 5000,
          weight: undefined,
          rpe: undefined,
        },
        null,
      );

      // Prefill from previous set
      mockOpenPrefilledLog.mockClear();
      logsStore.addExerciseLog({
        id: "set-1",
        exerciseName: "Running",
        distance: 5200,
        duration: 31.5,
        loggedAt: new Date(),
      });

      vm.handleLogExercise({
        exerciseName: "Running",
        targetSets: 2,
        targetDistanceMeters: 5000,
        targetDurationSeconds: 1800,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Running",
          reps: undefined,
          duration: 31.5,
          distance: 5200,
          weight: undefined,
          rpe: undefined,
        },
        null,
      );
    });

    it("preserves planned target duration when prior set only logged distance", () => {
      const logsStore = useExerciseLogsStore();
      const vm = useHomeWorkoutViewModel();

      logsStore.addExerciseLog({
        id: "set-1",
        exerciseName: "Running",
        distance: 5200,
        loggedAt: new Date(),
      });

      vm.handleLogExercise({
        exerciseName: "Running",
        targetSets: 2,
        targetDistanceMeters: 5000,
        targetDurationSeconds: 1800,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Running",
          reps: undefined,
          duration: 30, // Retained from targetDurationSeconds (1800s / 60)
          distance: 5200, // Retained from previous set
          weight: undefined,
          rpe: undefined,
        },
        null,
      );
    });

    it("respects user RPE opt-out from previous set instead of re-enabling planned targetRpe", () => {
      const logsStore = useExerciseLogsStore();
      const vm = useHomeWorkoutViewModel();

      logsStore.addExerciseLog({
        id: "set-1",
        exerciseName: "Bench Press",
        reps: 8,
        weight: 80,
        loggedAt: new Date(),
      });

      vm.handleLogExercise({
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: "8-10",
        targetWeight: "80kg",
        targetRpe: 8.5,
      });

      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        {
          exerciseName: "Bench Press",
          reps: 8,
          duration: undefined,
          distance: undefined,
          weight: 80,
          rpe: undefined,
        },
        null,
      );
    });
  });
});
