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

  it("should clear the plan and return null if older than its expiry (e.g., 21 days for 2-week plan)", () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 22);

    const plan = TrainingPlan.create(staleDate.toISOString(), 2, []);
    repository.savePlan(plan);

    const result = repository.loadPlan();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeNull();
    expect(localStorage.getItem("training-plan-v1")).toBeNull();
  });

  it("should keep the plan if within expiry (e.g., exactly 20 days old)", () => {
    const freshDate = new Date();
    freshDate.setDate(freshDate.getDate() - 20);

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

  describe("completed sessions", () => {
    it("should load empty array when no completed sessions exist", () => {
      const result = repository.loadCompletedSessions();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it("should save and load completed session keys", () => {
      const keys = ["W1-D1", "W1-D3"];
      const saveResult = repository.saveCompletedSessions(keys);
      expect(saveResult.isOk()).toBe(true);

      const loadResult = repository.loadCompletedSessions();
      expect(loadResult.isOk()).toBe(true);
      expect(loadResult._unsafeUnwrap()).toEqual(keys);
    });

    it("should clear completed sessions", () => {
      repository.saveCompletedSessions(["W1-D1"]);
      const clearResult = repository.clearCompletedSessions();
      expect(clearResult.isOk()).toBe(true);

      const loadResult = repository.loadCompletedSessions();
      expect(loadResult.isOk()).toBe(true);
      expect(loadResult._unsafeUnwrap()).toEqual([]);
    });
  });
});
