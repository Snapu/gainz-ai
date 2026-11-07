import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { buildExerciseProgression, computeExercisePr } from "./exerciseProgression";

describe("exerciseProgression helper", () => {
  describe("buildExerciseProgression", () => {
    it("returns empty array when fewer than 2 logs exist", () => {
      const singleLog: ExerciseLog[] = [
        {
          id: "1",
          exerciseName: "Bench Press",
          weight: 80,
          reps: 8,
          loggedAt: new Date("2026-10-20T10:00:00Z"),
        },
      ];
      expect(buildExerciseProgression([])).toEqual([]);
      expect(buildExerciseProgression(singleLog)).toEqual([]);
    });

    it("groups logs by session date and formats date labels", () => {
      const logs: ExerciseLog[] = [
        {
          id: "1",
          exerciseName: "Bench Press",
          weight: 80,
          reps: 8,
          loggedAt: new Date("2026-10-20T10:00:00Z"),
        },
        {
          id: "2",
          exerciseName: "Bench Press",
          weight: 82.5,
          reps: 7,
          loggedAt: new Date("2026-10-20T10:05:00Z"),
        },
        {
          id: "3",
          exerciseName: "Bench Press",
          weight: 85,
          reps: 6,
          loggedAt: new Date("2026-10-22T10:00:00Z"),
        },
      ];

      const sessions = buildExerciseProgression(logs);
      expect(sessions).toHaveLength(2);
      expect(sessions[0].sets).toEqual([
        { weight: 80, reps: 8, duration: undefined },
        { weight: 82.5, reps: 7, duration: undefined },
      ]);
      expect(sessions[1].sets).toEqual([{ weight: 85, reps: 6, duration: undefined }]);
      expect(sessions[0].dateLabel).toBeTruthy();
      expect(sessions[1].dateLabel).toBeTruthy();
    });

    it("limits sessions to maxSessions", () => {
      const logs: ExerciseLog[] = [];
      for (let i = 1; i <= 30; i++) {
        logs.push({
          id: `log-${i}`,
          exerciseName: "Squat",
          weight: 100 + i,
          reps: 5,
          loggedAt: new Date(`2026-09-${i.toString().padStart(2, "0")}T10:00:00Z`),
        });
      }

      const sessions = buildExerciseProgression(logs, 5);
      expect(sessions).toHaveLength(5);
      expect(sessions[4].sets[0].weight).toBe(130);
    });

    it("safely handles uncoerced string dates for loggedAt", () => {
      const logs = [
        {
          id: "1",
          exerciseName: "Bench Press",
          weight: 80,
          reps: 8,
          loggedAt: "2026-10-20T10:00:00Z" as unknown as Date,
        },
        {
          id: "2",
          exerciseName: "Bench Press",
          weight: 85,
          reps: 6,
          loggedAt: "2026-10-22T10:00:00Z" as unknown as Date,
        },
      ];
      const sessions = buildExerciseProgression(logs as ExerciseLog[]);
      expect(sessions).toHaveLength(2);
    });
  });

  describe("computeExercisePr", () => {
    it("returns null when logs are empty", () => {
      expect(computeExercisePr([])).toBeNull();
    });

    it("prioritizes distance over duration for cardio runs", () => {
      const logs: ExerciseLog[] = [
        { id: "1", exerciseName: "Running", distance: 5000, duration: 28, loggedAt: new Date() },
        { id: "2", exerciseName: "Running", distance: 5000, duration: 25, loggedAt: new Date() },
        { id: "3", exerciseName: "Running", distance: 3000, duration: 15, loggedAt: new Date() },
      ];
      expect(computeExercisePr(logs)).toBe("PR: 5000 m");
    });

    it("finds best weight with reps", () => {
      const logs: ExerciseLog[] = [
        { id: "1", exerciseName: "Bench", weight: 90, reps: 10, loggedAt: new Date() },
        { id: "2", exerciseName: "Bench", weight: 100, reps: 5, loggedAt: new Date() },
        { id: "3", exerciseName: "Bench", weight: 100, reps: 8, loggedAt: new Date() },
        { id: "4", exerciseName: "Bench", weight: 95, reps: 12, loggedAt: new Date() },
      ];
      expect(computeExercisePr(logs)).toBe("PR: 100 kg × 8");
    });

    it("handles weight without reps", () => {
      const logs: ExerciseLog[] = [
        { id: "1", exerciseName: "Bench", weight: 80, loggedAt: new Date() },
      ];
      expect(computeExercisePr(logs)).toBe("PR: 80 kg");
    });

    it("finds max duration when duration-based", () => {
      const logs: ExerciseLog[] = [
        { id: "1", exerciseName: "Plank", duration: 1.5, loggedAt: new Date() },
        { id: "2", exerciseName: "Plank", duration: 3, loggedAt: new Date() },
      ];
      expect(computeExercisePr(logs)).toBe("PR: 3 min");
    });

    it("finds max distance when distance-based", () => {
      const logs: ExerciseLog[] = [
        { id: "1", exerciseName: "Running", distance: 3000, loggedAt: new Date() },
        { id: "2", exerciseName: "Running", distance: 5000, loggedAt: new Date() },
      ];
      expect(computeExercisePr(logs)).toBe("PR: 5000 m");
    });

    it("finds max reps for bodyweight exercises without weight", () => {
      const logs: ExerciseLog[] = [
        { id: "1", exerciseName: "Pushups", reps: 20, loggedAt: new Date() },
        { id: "2", exerciseName: "Pushups", reps: 35, loggedAt: new Date() },
      ];
      expect(computeExercisePr(logs)).toBe("PR: 35 reps");
    });
  });
});
