import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TrainingPlan } from "../domain";
import { LocalStoragePlanRepository } from "./LocalStoragePlanRepository";

describe("LocalStoragePlanRepository", () => {
  let repository: LocalStoragePlanRepository;

  beforeEach(() => {
    localStorage.clear();
    repository = new LocalStoragePlanRepository();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should return null if no plan is stored", () => {
    const result = repository.loadPlan();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeNull();
  });

  it("should save and load a valid plan", () => {
    const plan = TrainingPlan.create(new Date().toISOString(), 2, []);
    repository.savePlan(plan);
    const loadedResult = repository.loadPlan();
    expect(loadedResult.isOk()).toBe(true);
    expect(loadedResult._unsafeUnwrap()).toEqual(plan);
  });

  it("should clear the plan on invalid JSON", () => {
    localStorage.setItem("training-plan-v1", "{invalid json");
    const result = repository.loadPlan();
    expect(result.isErr()).toBe(true);
  });

  it("should clear the plan and return null if older than 28 days", () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 29);

    const plan = TrainingPlan.create(staleDate.toISOString(), 2, []);
    repository.savePlan(plan);

    const result = repository.loadPlan();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeNull();
    expect(localStorage.getItem("training-plan-v1")).toBeNull();
  });

  it("should keep the plan if exactly 28 days old or newer", () => {
    const freshDate = new Date();
    freshDate.setDate(freshDate.getDate() - 27);

    const plan = TrainingPlan.create(freshDate.toISOString(), 2, []);
    repository.savePlan(plan);

    const result = repository.loadPlan();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(plan);
  });

  it("clearPlan should remove the item from localStorage", () => {
    const plan = TrainingPlan.create(new Date().toISOString(), 2, []);
    repository.savePlan(plan);

    let result = repository.loadPlan();
    expect(result._unsafeUnwrap()).not.toBeNull();

    repository.clearPlan();

    result = repository.loadPlan();
    expect(result._unsafeUnwrap()).toBeNull();
  });
});
