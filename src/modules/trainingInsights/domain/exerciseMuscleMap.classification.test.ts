import { describe, expect, it } from "vitest";
import type { MuscleActivation } from "./exerciseMuscleMap";
import { classifyExercise, getProgressionIncrement } from "./exerciseMuscleMap";

describe("Exercise Classification", () => {
  it("classifies unknown exercises as isolation", () => {
    expect(classifyExercise("Unknown Bicep Curl")).toBe("isolation");
  });

  it("classifies exercises with no secondary muscles as isolation", () => {
    // Bicep Curls only have Biceps
    expect(classifyExercise("Bicep Curls")).toBe("isolation");
    expect(classifyExercise("Calf Raises")).toBe("isolation");
  });

  it("classifies upper body compounds", () => {
    // Bench Press has Chest (primary) + Triceps/Shoulders
    expect(classifyExercise("Bench Press")).toBe("upper-compound");
    // Pull-Ups have Back (primary) + Biceps
    expect(classifyExercise("Pull-Ups")).toBe("upper-compound");
  });

  it("classifies lower body compounds", () => {
    // Squat has Quads (primary) + Glutes/Hamstrings
    expect(classifyExercise("Squat")).toBe("lower-compound");
  });

  it("classifies Deadlift as a lower compound despite having Back as primary", () => {
    // Our logic handles Deadlifts correctly because we added hasLowerInvolvement
    expect(classifyExercise("Deadlift")).toBe("lower-compound");
    expect(classifyExercise("Romanian Deadlift")).toBe("lower-compound");
  });

  it("returns correct progression increments", () => {
    expect(getProgressionIncrement("lower-compound")).toBe(5);
    expect(getProgressionIncrement("upper-compound")).toBe(2.5);
    expect(getProgressionIncrement("isolation")).toBe(1.25);
  });
});
