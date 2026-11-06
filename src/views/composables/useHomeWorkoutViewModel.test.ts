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

  describe("deck & superset selection", () => {
    it("resolves activeExerciseForDeck, supersetAlternatives, and isHighlighted in sync with selectSupersetExercise and resets on set log", async () => {
      const { nextTick } = await import("vue");
      const planStore = useTrainingPlanStore();
      const logsStore = useExerciseLogsStore();
      const currentDay = new Date().getDay();

      planStore.setPlan(
        TrainingPlan.create(new Date().toISOString(), 1, [
          {
            weekNumber: 1,
            dayOfWeek: currentDay,
            sessionLabel: "Upper Body Superset",
            focusDescription: "Chest & Back",
            exercises: [
              {
                exerciseName: "Bench Press",
                targetSets: 2,
                targetReps: "8",
                targetWeight: "80kg",
                supersetId: "ss-1",
              },
              {
                exerciseName: "Barbell Row",
                targetSets: 2,
                targetReps: "8",
                targetWeight: "70kg",
                supersetId: "ss-1",
              },
              {
                exerciseName: "Lateral Raise",
                targetSets: 2,
                targetReps: "12",
              },
            ],
          },
        ]),
      );

      const vm = useHomeWorkoutViewModel();

      // Initially points to first exercise in the superset group (index 0)
      expect(vm.visibleGroupIndex.value).toBe(0);
      expect(vm.activeExerciseForDeck.value?.exerciseName).toBe("Bench Press");
      expect(vm.supersetAlternatives.value.map((e) => e.exerciseName)).toEqual(["Barbell Row"]);
      expect(vm.isHighlighted(0, 0)).toBe(true);
      expect(vm.isHighlighted(0, 1)).toBe(false);
      expect(vm.isHighlighted(1, 0)).toBe(false);

      // Selecting the superset partner updates both the deck target and the highlighted card
      vm.selectSupersetExercise("Barbell Row");
      expect(vm.activeExerciseForDeck.value?.exerciseName).toBe("Barbell Row");
      expect(vm.supersetAlternatives.value.map((e) => e.exerciseName)).toEqual(["Bench Press"]);
      expect(vm.isHighlighted(0, 0)).toBe(false);
      expect(vm.isHighlighted(0, 1)).toBe(true);

      // handleDeckLogCurrent logs the selected superset exercise
      vm.handleDeckLogCurrent();
      expect(mockOpenPrefilledLog).toHaveBeenCalledWith(
        expect.objectContaining({ exerciseName: "Barbell Row", weight: 70 }),
        null,
      );

      // Logging a set resets selectedSupersetExerciseName back to natural superset rotation
      logsStore.addExerciseLog({
        id: "log-row-1",
        exerciseName: "Barbell Row",
        reps: 8,
        weight: 70,
        loggedAt: new Date(),
      });
      await nextTick();

      // Bench Press now has 0 sets done while Barbell Row has 1, so Bench Press becomes active
      expect(vm.activeExerciseForDeck.value?.exerciseName).toBe("Bench Press");
      expect(vm.isHighlighted(0, 0)).toBe(true);
      expect(vm.isHighlighted(0, 1)).toBe(false);

      // Swiping to group 1 (Lateral Raise) updates deck target and highlight to group 1
      vm.visibleGroupIndex.value = 1;
      await nextTick();
      expect(vm.activeExerciseForDeck.value?.exerciseName).toBe("Lateral Raise");
      expect(vm.supersetAlternatives.value).toEqual([]);
      expect(vm.isHighlighted(0, 0)).toBe(false);
      expect(vm.isHighlighted(1, 0)).toBe(true);
    });
  });

  describe("sequential plan workout & stale coach message protection", () => {
    it("derives Today's Workout from the next uncompleted session (UP NEXT) rather than today's calendar weekday", () => {
      const planStore = useTrainingPlanStore();
      const currentDay = new Date().getDay();
      const otherDay = (currentDay + 2) % 7;

      // Session A is scheduled on today's weekday (currentDay), Session C is on another day (otherDay).
      // Session A is already completed! So UP NEXT in the plan is Session C.
      planStore.setPlan(
        TrainingPlan.create(new Date().toISOString(), 1, [
          {
            weekNumber: 1,
            dayOfWeek: currentDay,
            sessionLabel: "Einheit A",
            focusDescription: "Chest",
            exercises: [{ exerciseName: "Incline DB Press", targetSets: 3, targetReps: "8" }],
          },
          {
            weekNumber: 1,
            dayOfWeek: otherDay,
            sessionLabel: "Einheit C",
            focusDescription: "Bench & Row",
            exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "6-8" }],
          },
        ]),
      );
      planStore.setCompletedSessions(new Set([TrainingPlan.sessionKey(1, currentDay)]));

      const vm = useHomeWorkoutViewModel();
      expect(vm.isRestDay.value).toBe(false);
      expect(vm.allWorkoutGroups.value?.[0]?.exercises[0]?.exerciseName).toBe("Bench Press");
    });

    it("ignores a stale automated coach message whose workout matches a previously completed session instead of UP NEXT", () => {
      const planStore = useTrainingPlanStore();
      const chatStore = useCoachChatStore();

      planStore.setPlan(
        TrainingPlan.create("2026-11-01T08:00:00.000Z", 1, [
          {
            weekNumber: 1,
            dayOfWeek: 1,
            sessionLabel: "Einheit A",
            focusDescription: "Incline & Pull-ups",
            exercises: [
              { exerciseName: "Schrägbankdrücken Kurzhanteln", targetSets: 3, targetReps: "6-8" },
              { exerciseName: "Klimmzüge", targetSets: 3, targetReps: "6-8" },
            ],
          },
          {
            weekNumber: 1,
            dayOfWeek: 5,
            sessionLabel: "Einheit C",
            focusDescription: "Bench & Row",
            exercises: [
              { exerciseName: "Bankdrücken", targetSets: 3, targetReps: "6-8" },
              { exerciseName: "Seated Cable Row", targetSets: 3, targetReps: "8-10" },
            ],
          },
        ]),
      );
      // Einheit A was completed earlier in the week
      planStore.setCompletedSessions(new Set([TrainingPlan.sessionKey(1, 1)]));

      // Simulate an automated request message (no user question) followed by a coach message
      // that prescribed Einheit A due to the startup race condition
      chatStore.addMessage({
        id: "user-auto",
        role: "user",
        content: "# session\ndate: 2026-11-06 08:29\nstatus: Not started\nphase: planning",
        timestamp: new Date().toISOString(),
        sessionId: chatStore.currentSessionId,
        logsCount: 0,
      });
      chatStore.addMessage({
        id: "coach-stale",
        role: "coach",
        content: JSON.stringify({
          coachMessage: "Focus on Schrägbankdrücken today.",
          recommendedWorkout: [
            { exerciseName: "Schrägbankdrücken Kurzhanteln", targetSets: 3, targetReps: "6-8" },
            { exerciseName: "Klimmzüge", targetSets: 3, targetReps: "6-8" },
          ],
        }),
        timestamp: new Date().toISOString(),
        sessionId: chatStore.currentSessionId,
        logsCount: 0,
      });

      const vm = useHomeWorkoutViewModel();
      // Should fall back to UP NEXT (Einheit C: Bankdrücken) instead of showing stale Einheit A
      expect(vm.allWorkoutGroups.value?.[0]?.exercises[0]?.exerciseName).toBe("Bankdrücken");
    });

    it("keeps today's session active when satisfied today via substituted exercises (muscle-volume fallback)", () => {
      const planStore = useTrainingPlanStore();
      const logsStore = useExerciseLogsStore();

      planStore.setPlan(
        TrainingPlan.create("2026-11-01T08:00:00.000Z", 1, [
          {
            weekNumber: 1,
            dayOfWeek: 1,
            sessionLabel: "Einheit A",
            focusDescription: "Chest & Back",
            exercises: [
              { exerciseName: "Bench Press", targetSets: 2, targetReps: "8" },
              { exerciseName: "Barbell Row", targetSets: 2, targetReps: "8" },
            ],
          },
          {
            weekNumber: 1,
            dayOfWeek: 3,
            sessionLabel: "Einheit B",
            focusDescription: "Legs",
            exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5" }],
          },
        ]),
      );

      // User logged a Chest substitute (Incline Bench Press) today, which satisfies 50% of Einheit A's muscle volume
      const now = new Date();
      logsStore.exerciseLogs = [
        { id: "1", exerciseName: "Incline Bench Press", reps: 8, weight: 60, loggedAt: now },
        { id: "2", exerciseName: "Incline Bench Press", reps: 8, weight: 60, loggedAt: now },
      ];
      planStore.setCompletedSessions(new Set([TrainingPlan.sessionKey(1, 1)]));

      const vm = useHomeWorkoutViewModel();
      // Must stay on Einheit A (Bench Press / Barbell Row) for the rest of today rather than jumping to Squat
      expect(vm.allWorkoutGroups.value?.[0]?.exercises[0]?.exerciseName).toBe("Bench Press");
    });

    it("keeps active midnight-crossing workout and logs intact across midnight", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-06T00:15:00"));

      const chatStore = useCoachChatStore();
      const logsStore = useExerciseLogsStore();

      // Coach prescribed a workout on Thursday evening
      chatStore.addMessage({
        id: "coach-squat",
        role: "coach",
        content: JSON.stringify({
          coachMessage: "Heavy leg day.",
          recommendedWorkout: [{ exerciseName: "Squat", targetSets: 3, restSeconds: 180 }],
        }),
        timestamp: new Date("2026-11-05T23:25:00").toISOString(),
        sessionId: "2026-11-05",
        logsCount: 0,
      });

      // User logged 2 sets before midnight on Thursday and 1 set after midnight on Friday
      logsStore.exerciseLogs = [
        {
          id: "1",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-05T23:30:00"),
        },
        {
          id: "2",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-05T23:45:00"),
        },
        {
          id: "3",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-06T00:05:00"),
        },
      ];

      const vm = useHomeWorkoutViewModel();

      // The coach's prescribed workout must still be active (not replaced or wiped at midnight)
      expect(vm.allWorkoutGroups.value?.[0]?.exercises[0]?.exerciseName).toBe("Squat");

      // Progress should count all 3 sets (2 before midnight + 1 after midnight)
      const progress = vm.getExerciseProgress("Squat", 3);
      expect(progress.done).toBe(3);
      expect(progress.isCompleted).toBe(true);
      expect(vm.isWorkoutComplete.value).toBe(true);

      vi.useRealTimers();
    });
  });
});
