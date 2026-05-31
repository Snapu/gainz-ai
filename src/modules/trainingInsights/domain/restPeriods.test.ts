import { describe, expect, it } from "vitest";
import { clampRestSeconds } from "./restPeriods";

describe("clampRestSeconds", () => {
  it("defaults to 120 if no reps are provided", () => {
    expect(clampRestSeconds(undefined)).toBe(120);
    expect(clampRestSeconds(undefined, 90)).toBe(90);
  });

  it("handles string ranges correctly", () => {
    // 8-12 reps -> max 12 -> hypertrophy range (120-180s)
    expect(clampRestSeconds("8-12")).toBe(120);
    expect(clampRestSeconds("8-12", 60)).toBe(120); // clamped up
    expect(clampRestSeconds("8-12", 200)).toBe(180); // clamped down
    expect(clampRestSeconds("8-12", 150)).toBe(150); // within range
  });

  it("handles strength range (<= 5 reps)", () => {
    expect(clampRestSeconds("3-5", 60)).toBe(180);
    expect(clampRestSeconds(5, 400)).toBe(300);
    expect(clampRestSeconds(1, 240)).toBe(240);
  });

  it("handles endurance range (16-20 reps)", () => {
    expect(clampRestSeconds("15-20", 30)).toBe(45);
    expect(clampRestSeconds(18, 120)).toBe(90);
    expect(clampRestSeconds(20, 60)).toBe(60);
  });

  it("handles circuit range (>20 reps)", () => {
    expect(clampRestSeconds("20-30", 10)).toBe(15);
    expect(clampRestSeconds(25, 60)).toBe(45);
    expect(clampRestSeconds(30, 30)).toBe(30);
  });

  it("handles non-numeric strings gracefully", () => {
    expect(clampRestSeconds("Max", 90)).toBe(90);
    expect(clampRestSeconds("AMRAP", undefined)).toBe(120);
  });
});
