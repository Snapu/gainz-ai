import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyAiCleanupResults,
  clearLearnedMap,
  getLearnedMapSize,
  getLearnedMuscleMap,
  learnFromAiResponse,
} from "./exerciseMuscleMap";

beforeEach(() => {
  clearLearnedMap();
});

afterEach(() => {
  clearLearnedMap();
});

describe("learnFromAiResponse", () => {
  it("does nothing for empty input", () => {
    learnFromAiResponse([]);
    expect(getLearnedMapSize()).toBe(0);
  });

  it("learns a valid exercise→muscle mapping", () => {
    learnFromAiResponse([{ exerciseName: "Cable Crossover", primaryMuscle: "Chest" }]);
    const map = getLearnedMuscleMap();
    expect(map["cable crossover"]?.primaryMuscle).toBe("Chest");
  });

  it("normalizes the key to lowercase", () => {
    learnFromAiResponse([{ exerciseName: "CABLE CROSSOVER", primaryMuscle: "Chest" }]);
    const map = getLearnedMuscleMap();
    expect(map["cable crossover"]).toBeDefined();
  });

  it("rejects exercises with invalid primaryMuscle", () => {
    learnFromAiResponse([{ exerciseName: "Mystery Move", primaryMuscle: "InvalidMuscle" }]);
    expect(getLearnedMapSize()).toBe(0);
  });

  it("accepts legacy muscleGroup field as primaryMuscle fallback", () => {
    learnFromAiResponse([{ exerciseName: "Reverse Fly", muscleGroup: "Back" }]);
    const map = getLearnedMuscleMap();
    expect(map["reverse fly"]?.primaryMuscle).toBe("Back");
  });

  it("skips entries with no exerciseName", () => {
    learnFromAiResponse([{ exerciseName: "", primaryMuscle: "Chest" }]);
    expect(getLearnedMapSize()).toBe(0);
  });

  it("skips entries with no primaryMuscle or muscleGroup", () => {
    learnFromAiResponse([{ exerciseName: "Mystery Move" }]);
    expect(getLearnedMapSize()).toBe(0);
  });

  it("stores valid secondary muscles", () => {
    learnFromAiResponse([
      {
        exerciseName: "Cable Crossover",
        primaryMuscle: "Chest",
        secondaryMuscles: [{ muscleGroup: "Shoulders", contribution: 0.3 }],
      },
    ]);
    const entry = getLearnedMuscleMap()["cable crossover"];
    expect(entry?.secondaryMuscles).toHaveLength(1);
    expect(entry?.secondaryMuscles[0]?.muscleGroup).toBe("Shoulders");
  });

  it("silently drops secondary muscles with invalid muscle group", () => {
    learnFromAiResponse([
      {
        exerciseName: "Cable Crossover",
        primaryMuscle: "Chest",
        secondaryMuscles: [{ muscleGroup: "InvalidMuscle" }],
      },
    ]);
    const entry = getLearnedMuscleMap()["cable crossover"];
    expect(entry?.secondaryMuscles).toHaveLength(0);
  });

  it("clamps secondary contribution to [0, 1]", () => {
    learnFromAiResponse([
      {
        exerciseName: "Cable Crossover",
        primaryMuscle: "Chest",
        secondaryMuscles: [{ muscleGroup: "Shoulders", contribution: 2.5 }],
      },
    ]);
    const entry = getLearnedMuscleMap()["cable crossover"];
    expect(entry?.secondaryMuscles[0]?.contribution).toBe(1);
  });

  it("does not overwrite exercises already in the default activation map", () => {
    // "Bench Press" is in the default map — AI should not override it
    learnFromAiResponse([{ exerciseName: "Bench Press", primaryMuscle: "Back" }]);
    const map = getLearnedMuscleMap();
    // Should not appear in learned map (or if it does, not with "Back")
    expect(map["bench press"]?.primaryMuscle).not.toBe("Back");
  });

  it("learns multiple exercises in one call", () => {
    learnFromAiResponse([
      { exerciseName: "Cable Crossover", primaryMuscle: "Chest" },
      { exerciseName: "Reverse Fly", primaryMuscle: "Back" },
    ]);
    expect(getLearnedMapSize()).toBe(2);
  });
});

describe("applyAiCleanupResults", () => {
  it("does nothing for empty input", () => {
    applyAiCleanupResults([]);
    expect(getLearnedMapSize()).toBe(0);
  });

  it("classifies exercise when confidence >= 0.8", () => {
    applyAiCleanupResults([{ exerciseName: "Pec Deck", primaryMuscle: "Chest", confidence: 0.9 }]);
    expect(getLearnedMuscleMap()["pec deck"]?.primaryMuscle).toBe("Chest");
  });

  it("rejects classification when confidence < 0.8", () => {
    applyAiCleanupResults([{ exerciseName: "Pec Deck", primaryMuscle: "Chest", confidence: 0.7 }]);
    expect(getLearnedMapSize()).toBe(0);
  });

  it("rejects classification with invalid primaryMuscle", () => {
    applyAiCleanupResults([
      { exerciseName: "Pec Deck", primaryMuscle: "FakeMuscle", confidence: 0.95 },
    ]);
    expect(getLearnedMapSize()).toBe(0);
  });

  it("skips exercises already in the default map", () => {
    applyAiCleanupResults([
      { exerciseName: "Bench Press", primaryMuscle: "Back", confidence: 0.99 },
    ]);
    expect(getLearnedMuscleMap()["bench press"]?.primaryMuscle).not.toBe("Back");
  });

  it("stores secondary muscles when provided", () => {
    applyAiCleanupResults([
      {
        exerciseName: "Pec Deck",
        primaryMuscle: "Chest",
        confidence: 0.9,
        secondaryMuscles: [{ muscleGroup: "Shoulders", contribution: 0.2 }],
      },
    ]);
    const entry = getLearnedMuscleMap()["pec deck"];
    expect(entry?.secondaryMuscles[0]?.muscleGroup).toBe("Shoulders");
    expect(entry?.secondaryMuscles[0]?.contribution).toBe(0.2);
  });

  it("applies multiple classifications in one call", () => {
    // Use exercises NOT in the default map
    applyAiCleanupResults([
      { exerciseName: "Pec Deck", primaryMuscle: "Chest", confidence: 0.9 },
      { exerciseName: "Sissy Squat", primaryMuscle: "Quads", confidence: 0.85 },
    ]);
    expect(getLearnedMapSize()).toBe(2);
  });
});
