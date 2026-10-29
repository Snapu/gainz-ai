import { describe, expect, it } from "vitest";
import { resolveCoachingIntent, resolveEffectiveCoachingMode } from "./coachingMode";
import { TrainingPlan } from "./trainingPlan";

const activePlan = TrainingPlan.create("2026-10-20T08:00:00.000Z", 2, [
  {
    dayOfWeek: 1,
    weekNumber: 1,
    sessionLabel: "Push",
    focusDescription: "Chest",
    exercises: [{ exerciseName: "Bench Press", targetSets: 3 }],
  },
]);

describe("resolveEffectiveCoachingMode", () => {
  it("plans when there is no active plan", () => {
    expect(resolveEffectiveCoachingMode({ requestedMode: "execution", hasActivePlan: false })).toBe(
      "planning",
    );
  });

  it("plans when a full regeneration is explicitly requested", () => {
    expect(resolveEffectiveCoachingMode({ requestedMode: "planning", hasActivePlan: true })).toBe(
      "planning",
    );
  });

  it("stays in execution when a plan exists, so the model decides on optional plan edits", () => {
    expect(resolveEffectiveCoachingMode({ requestedMode: "execution", hasActivePlan: true })).toBe(
      "execution",
    );
    expect(resolveEffectiveCoachingMode({ hasActivePlan: true })).toBe("execution");
  });
});

describe("resolveCoachingIntent", () => {
  it("hides the active plan from the prompt when planning", () => {
    expect(resolveCoachingIntent({ requestedMode: "planning", activePlan })).toEqual({
      effectiveMode: "planning",
      activePlanForPrompt: undefined,
    });
  });

  it("exposes the active plan in execution mode", () => {
    expect(resolveCoachingIntent({ requestedMode: "execution", activePlan })).toEqual({
      effectiveMode: "execution",
      activePlanForPrompt: activePlan,
    });
  });

  it("plans without a plan context when no active plan exists", () => {
    expect(resolveCoachingIntent({ requestedMode: "execution", activePlan: null })).toEqual({
      effectiveMode: "planning",
      activePlanForPrompt: undefined,
    });
  });

  it("plans when an active plan exists but has 0 sessions (corrupted or empty)", () => {
    const emptyPlan = TrainingPlan.create("2026-10-20T08:00:00.000Z", 2, []);
    expect(resolveCoachingIntent({ requestedMode: "execution", activePlan: emptyPlan })).toEqual({
      effectiveMode: "planning",
      activePlanForPrompt: undefined,
    });
  });
});
