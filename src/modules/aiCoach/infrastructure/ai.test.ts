import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiCoachService, PreviousAiMessage } from "@/modules/aiCoach/application";
import { askCoach, classifyExerciseNames, getTodayLogsCount } from "@/modules/aiCoach/application";
import type { ExerciseCleanupResult } from "@/modules/aiCoach/domain";
import type { Event } from "@/modules/events/domain";
import type { UserProfile } from "@/modules/profile/domain";
import type { TrainingInsights } from "@/modules/trainingInsights/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { TrainingSummary } from "@/modules/trainingSummary/application";

function createExerciseLog(
  exerciseName: string,
  loggedAt: Date,
  options: Partial<Pick<ExerciseLog, "reps" | "weight" | "distance" | "duration">> = {},
): ExerciseLog {
  return {
    id: crypto.randomUUID(),
    exerciseName,
    loggedAt,
    ...options,
  };
}

function createUserProfile(): UserProfile {
  return {
    age: 30,
    heightCm: 180,
    weightKg: 80,
    fitnessGoal: ["build_muscle"],
    fitnessLevel: "intermediate",
    workoutDaysPerWeek: 4,
    workoutLocation: "gym",
    equipmentAccess: ["barbell_rack", "dumbbells"],
  };
}

function createEvent(type: string, dates: string[]): Event {
  return {
    id: crypto.randomUUID(),
    type,
    dates,
  };
}

function createMockInsights(): TrainingInsights {
  return {
    phase: "Maintain",
    acwr: null,
    fatigue: {
      shouldDeload: false,
      reason: undefined,
      hasSufficientHistory: false,
      weeklyTotalSets: [],
      weeklyTonnage: [],
      loadWindow: {
        sets: {
          weekMinus3: 0,
          weekMinus2: 0,
          weekMinus1: 0,
          current: 0,
          prior3WeekAvg: 0,
          ratioVsPriorAvg: null,
        },
        tonnage: {
          weekMinus3: 0,
          weekMinus2: 0,
          weekMinus1: 0,
          current: 0,
          prior3WeekAvg: 0,
          ratioVsPriorAvg: null,
        },
      },
      triggeredBy: [],
      decliningExercises: 0,
      riskScore: 0,
    },
    e1rm: {},
    muscleGroups: {},
    deloadStatus: "none",
    deloadEndsAt: null,
    deloadTimeRemainingMs: null,
    e1rmPaused: false,
    plateauPaused: false,
    deloadTriggerSnapshot: null,
  };
}

describe("AI application service port", () => {
  const askMock = vi.fn();
  const classifyMock = vi.fn();
  const getTodayLogsCountMock = vi.fn();

  const aiService: AiCoachService = {
    ask: askMock,
    classifyExercises: classifyMock,
    getTodayLogsCount: getTodayLogsCountMock,
  };

  const mockApiKey = "test-api-key";
  const mockUserProfile = createUserProfile();
  const mockExerciseLogs = [
    createExerciseLog("Bench Press", new Date("2026-03-11T10:00:00"), {
      reps: 10,
      weight: 60,
    }),
  ];
  const mockTrainingSummaries: TrainingSummary[] = [];
  const mockPreviousMessages: PreviousAiMessage[] = [];

  beforeEach(() => {
    askMock.mockReset();
    classifyMock.mockReset();
    getTodayLogsCountMock.mockReset();
  });

  it("forwards ask calls and keeps events optional", async () => {
    const events = [createEvent("Sickness", ["2026-03-11", "2026-03-12"])];
    askMock.mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: { responseText: "{}", requestPayload: "payload" },
    });

    await askCoach(aiService, {
      apiKey: mockApiKey,
      userProfile: mockUserProfile,
      insights: createMockInsights(),
      exerciseLogs: mockExerciseLogs,
      trainingSummaries: mockTrainingSummaries,
      previousMessages: mockPreviousMessages,
      events,
    });

    expect(askMock).toHaveBeenCalledTimes(1);
    expect(askMock).toHaveBeenCalledWith({
      apiKey: mockApiKey,
      userProfile: mockUserProfile,
      insights: expect.objectContaining({ phase: "Maintain" }),
      exerciseLogs: mockExerciseLogs,
      trainingSummaries: mockTrainingSummaries,
      previousMessages: mockPreviousMessages,
      events,
    });
  });

  it("forwards classify calls", async () => {
    const result: ExerciseCleanupResult = {
      classifications: [
        {
          exerciseName: "Bench Press",
          primaryMuscle: "Chest",
          confidence: 0.99,
        },
      ],
    };

    classifyMock.mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: result,
    });

    const response = await classifyExerciseNames(aiService, ["Bench Press"], mockApiKey);

    expect(classifyMock).toHaveBeenCalledTimes(1);
    expect(classifyMock).toHaveBeenCalledWith(["Bench Press"], mockApiKey);
    expect(response.isOk()).toBe(true);
  });

  it("forwards getTodayLogsCount", () => {
    getTodayLogsCountMock.mockReturnValue(2);
    const session = { logs: mockExerciseLogs };

    const count = getTodayLogsCount(aiService, session as never);

    expect(getTodayLogsCountMock).toHaveBeenCalledWith(session);
    expect(count).toBe(2);
  });
});
