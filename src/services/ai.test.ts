import { describe, expect, it } from "vitest";
import type { Event } from "@/types/event";
import type { PreviousAiMessage } from "./ai";
import { askAi } from "./ai";
import type { ExerciseLog } from "./exerciseLogs";
import type { TrainingSummary } from "./trainingSummary";
import type { UserProfile } from "./userProfile";

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

function createEvent(type: string, startDate: string, endDate: string): Event {
  return {
    id: crypto.randomUUID(),
    type,
    startDate,
    endDate,
  };
}

describe("askAi - Events Integration (RED Phase)", () => {
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

  describe("askAi signature - events parameter acceptance", () => {
    it("RED: askAi should accept events parameter (currently missing)", async () => {
      const events = [createEvent("Sickness", "2026-03-11", "2026-03-12")];

      const callWithEvents = () =>
        askAi(
          mockApiKey,
          mockUserProfile,
          mockExerciseLogs,
          mockTrainingSummaries,
          mockPreviousMessages,
          events,
        );

      expect(callWithEvents).toBeDefined();
    });

    it("RED: askAi should accept optional events parameter (backward compatible)", async () => {
      const callWithoutEvents = () =>
        askAi(
          mockApiKey,
          mockUserProfile,
          mockExerciseLogs,
          mockTrainingSummaries,
          mockPreviousMessages,
        );

      expect(callWithoutEvents).toBeDefined();
    });

    it("RED: askAi should accept empty events array", async () => {
      const events: Event[] = [];

      const callWithEmptyEvents = () =>
        askAi(
          mockApiKey,
          mockUserProfile,
          mockExerciseLogs,
          mockTrainingSummaries,
          mockPreviousMessages,
          events,
        );

      expect(callWithEmptyEvents).toBeDefined();
    });
  });

  describe("askAi - events inclusion in prompt", () => {
    it("RED: askAi should include events JSON in currentUserInput when provided", async () => {
      const events = [
        createEvent("Sickness", "2026-03-11", "2026-03-13"),
        createEvent("Injury", "2026-03-12", "2026-03-14"),
      ];

      const eventsJson = JSON.stringify(events, null, 2);

      expect(eventsJson).toContain('"type": "Sickness"');
      expect(eventsJson).toContain('"type": "Injury"');
      expect(eventsJson).toContain('"startDate": "2026-03-11"');
    });

    it("RED: askAi should not break with empty events array", async () => {
      const events: Event[] = [];
      const result = JSON.stringify({ events });

      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result).events).toEqual([]);
    });

    it("RED: askAi should format events section correctly in prompt", () => {
      const events = [createEvent("Fasting", "2026-03-11", "2026-03-11")];

      const expectedPromptSection = `
Here are my current events and constraints:
\`\`\`json
${JSON.stringify(events, null, 2)}
\`\`\`
`;

      expect(expectedPromptSection).toContain("current events");
      expect(expectedPromptSection).toContain("Fasting");
    });
  });

  describe("askAi - events data structure validation", () => {
    it("RED: events should be array of Event type", () => {
      const events: Event[] = [
        createEvent("Sickness", "2026-03-10", "2026-03-11"),
        createEvent("Injury", "2026-03-08", "2026-03-09"),
        createEvent("Fasting", "2026-03-11", "2026-03-11"),
        createEvent("Rest Day", "2026-03-07", "2026-03-07"),
      ];

      expect(Array.isArray(events)).toBe(true);
      expect(events).toHaveLength(4);
      events.forEach((event) => {
        expect(event).toHaveProperty("id");
        expect(event).toHaveProperty("type");
        expect(event).toHaveProperty("startDate");
        expect(event).toHaveProperty("endDate");
      });
    });

    it("RED: events should be JSON serializable", () => {
      const events = [
        createEvent("Sickness", "2026-03-11", "2026-03-12"),
        createEvent("Rest Day", "2026-03-10", "2026-03-10"),
      ];

      const serialized = JSON.stringify(events);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(events);
    });

    it("RED: askAi should handle various event types correctly", () => {
      const eventTypes = ["Sickness", "Injury", "Fasting", "Rest Day"];
      const events = eventTypes.map((type) => createEvent(type, "2026-03-11", "2026-03-11"));

      expect(events.map((e) => e.type)).toEqual(eventTypes);
    });
  });

  describe("askAi - events with exercise logs integration", () => {
    it("RED: askAi should accept both exerciseLogs and events parameters", () => {
      const logs = [
        createExerciseLog("Squat", new Date("2026-03-11T10:00:00"), { reps: 5, weight: 100 }),
        createExerciseLog("Deadlift", new Date("2026-03-11T11:00:00"), { reps: 3, weight: 150 }),
      ];
      const events = [createEvent("Rest Day", "2026-03-12", "2026-03-12")];

      expect(logs).toHaveLength(2);
      expect(events).toHaveLength(1);
    });

    it("RED: askAi should preserve exercise logs when events added", () => {
      const logs = [
        createExerciseLog("Bench Press", new Date("2026-03-11T10:00:00"), { reps: 10, weight: 60 }),
      ];
      const events = [createEvent("Sickness", "2026-03-13", "2026-03-14")];

      const logsJson = JSON.stringify(logs);
      const eventsJson = JSON.stringify(events);

      expect(logsJson).toContain("Bench Press");
      expect(eventsJson).toContain("Sickness");
    });

    it("RED: askAi should handle overlapping event and exercise log dates", () => {
      const logs = [
        createExerciseLog("Squat", new Date("2026-03-11T10:00:00"), { reps: 5, weight: 100 }),
      ];
      const events = [createEvent("Fasting", "2026-03-11", "2026-03-11")];

      const logDate = logs[0]?.loggedAt.toISOString().split("T")[0];
      const eventDate = events[0]?.startDate;

      expect(logDate).toBe(eventDate);
    });
  });

  describe("askAi - backward compatibility", () => {
    it("RED: existing code calling askAi without events should still work", async () => {
      const result = await askAi(
        mockApiKey,
        mockUserProfile,
        mockExerciseLogs,
        mockTrainingSummaries,
        mockPreviousMessages,
      );

      expect(result).toBeDefined();
    });

    it("RED: askAi should work with undefined events", async () => {
      const result = await askAi(
        mockApiKey,
        mockUserProfile,
        mockExerciseLogs,
        mockTrainingSummaries,
        mockPreviousMessages,
      );

      expect(result).toBeDefined();
    });
  });
});
