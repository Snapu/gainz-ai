import { describe, expect, it } from "vitest";
import { upcastLegacyExercise } from "./upcaster";

describe("upcastLegacyExercise", () => {
  it("leaves standard rep strings untouched", () => {
    const ex = { targetReps: "8-12" };
    expect(upcastLegacyExercise(ex)).toEqual({ targetReps: "8-12" });

    const singleRep = { targetReps: "10" };
    expect(upcastLegacyExercise(singleRep)).toEqual({ targetReps: "10" });
  });

  it("leaves exercises with existing duration or distance untouched", () => {
    const exDuration = { targetReps: "30s", targetDurationSeconds: 30 };
    expect(upcastLegacyExercise(exDuration)).toEqual(exDuration);

    const exDistance = { targetReps: "500m", targetDistanceMeters: 500 };
    expect(upcastLegacyExercise(exDistance)).toEqual(exDistance);
  });

  it("converts seconds duration strings into targetDurationSeconds", () => {
    expect(upcastLegacyExercise({ targetReps: "30s" })).toEqual({
      targetDurationSeconds: 30,
      targetReps: undefined,
    });

    expect(upcastLegacyExercise({ targetReps: "45 sec hold" })).toEqual({
      targetDurationSeconds: 45,
      targetReps: undefined,
    });
  });

  it("converts minutes and hours duration strings to seconds", () => {
    expect(upcastLegacyExercise({ targetReps: "2 min" })).toEqual({
      targetDurationSeconds: 120,
      targetReps: undefined,
    });

    expect(upcastLegacyExercise({ targetReps: "1 hr" })).toEqual({
      targetDurationSeconds: 3600,
      targetReps: undefined,
    });
  });

  it("converts distance strings into targetDistanceMeters", () => {
    expect(upcastLegacyExercise({ targetReps: "500m" })).toEqual({
      targetDistanceMeters: 500,
      targetReps: undefined,
    });
  });

  it("does not mistake '30min' or 'time' for distance in meters", () => {
    const result = upcastLegacyExercise({ targetReps: "30min" });
    expect(result.targetDistanceMeters).toBeUndefined();
    expect(result.targetDurationSeconds).toBe(1800);
  });

  it("does not mutate the original exercise object", () => {
    const original = { targetReps: "60s" };
    const upcasted = upcastLegacyExercise(original);
    expect(original.targetReps).toBe("60s");
    expect(upcasted.targetDurationSeconds).toBe(60);
  });
});
