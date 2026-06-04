import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TrainingPlan } from "../domain/types";
import { clearPlan, loadPlan, savePlan } from "./planStorage";

describe("planStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should return null if no plan is stored", () => {
    expect(loadPlan()).toBeNull();
  });

  it("should save and load a valid plan", () => {
    const plan: TrainingPlan = {
      createdAt: new Date().toISOString(),
      cycleWeeks: 2,
      sessions: [],
    };
    savePlan(plan);
    const loaded = loadPlan();
    expect(loaded).toEqual(plan);
  });

  it("should clear the plan on invalid JSON", () => {
    localStorage.setItem("training-plan-v1", "{invalid json");
    expect(loadPlan()).toBeNull();
    expect(localStorage.getItem("training-plan-v1")).toBeNull();
  });

  it("should clear the plan and return null if older than 28 days", () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 29);

    const plan: TrainingPlan = {
      createdAt: staleDate.toISOString(),
      cycleWeeks: 2,
      sessions: [],
    };
    savePlan(plan);

    expect(loadPlan()).toBeNull();
    expect(localStorage.getItem("training-plan-v1")).toBeNull();
  });

  it("should keep the plan if exactly 28 days old or newer", () => {
    const freshDate = new Date();
    freshDate.setDate(freshDate.getDate() - 27);

    const plan: TrainingPlan = {
      createdAt: freshDate.toISOString(),
      cycleWeeks: 2,
      sessions: [],
    };
    savePlan(plan);

    expect(loadPlan()).toEqual(plan);
  });

  it("clearPlan should remove the item from localStorage", () => {
    const plan: TrainingPlan = {
      createdAt: new Date().toISOString(),
      cycleWeeks: 2,
      sessions: [],
    };
    savePlan(plan);
    expect(loadPlan()).not.toBeNull();
    clearPlan();
    expect(loadPlan()).toBeNull();
  });
});
