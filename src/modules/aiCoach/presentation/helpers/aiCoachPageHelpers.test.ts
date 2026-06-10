import { describe, expect, it } from "vitest";
import {
  groupWorkout,
  isDuration,
  parseFirstRep,
  parseWeight,
  renderMarkdown,
  setSegments,
  splitReps,
  splitWeight,
  titleClass,
  tryParseCoachingAdvice,
} from "./aiCoachPageHelpers";

// ---------------------------------------------------------------------------
// tryParseCoachingAdvice
// ---------------------------------------------------------------------------
describe("tryParseCoachingAdvice", () => {
  it("returns parsed data when JSON contains coachMessage", () => {
    const content = JSON.stringify({ coachMessage: "Great job!", scratchpad: "thinking..." });
    const result = tryParseCoachingAdvice(content);
    expect(result).toEqual({ coachMessage: "Great job!", scratchpad: "thinking..." });
  });

  it("returns null when JSON is valid but missing coachMessage", () => {
    const content = JSON.stringify({ recommendedWorkout: [] });
    expect(tryParseCoachingAdvice(content)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(tryParseCoachingAdvice("not json")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(tryParseCoachingAdvice("")).toBeNull();
  });

  it("returns null when coachMessage is not a string", () => {
    const content = JSON.stringify({ coachMessage: 42 });
    expect(tryParseCoachingAdvice(content)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// groupWorkout
// ---------------------------------------------------------------------------
describe("groupWorkout", () => {
  it("returns null for undefined input", () => {
    expect(groupWorkout(undefined)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(groupWorkout([])).toBeNull();
  });

  it("groups standalone exercises as individual groups", () => {
    const workout = [
      { exerciseName: "Squat", targetSets: 3, targetReps: "8" },
      { exerciseName: "Bench Press", targetSets: 4, targetReps: "6" },
    ];
    const groups = groupWorkout(workout);
    expect(groups).toHaveLength(2);
    expect(groups?.[0].isSuperset).toBe(false);
    expect(groups?.[0].exercises[0].exerciseName).toBe("Squat");
    expect(groups?.[1].isSuperset).toBe(false);
    expect(groups?.[1].exercises[0].exerciseName).toBe("Bench Press");
  });

  it("groups exercises sharing a supersetId into one superset group", () => {
    const workout = [
      { exerciseName: "Curl", targetSets: 3, targetReps: "12", supersetId: "ss-1" },
      { exerciseName: "Tricep Extension", targetSets: 3, targetReps: "12", supersetId: "ss-1" },
      { exerciseName: "Squat", targetSets: 4, targetReps: "8" },
    ];
    const groups = groupWorkout(workout);
    expect(groups).toHaveLength(2);
    expect(groups?.[0].isSuperset).toBe(true);
    expect(groups?.[0].id).toBe("ss-1");
    expect(groups?.[0].exercises).toHaveLength(2);
    expect(groups?.[1].isSuperset).toBe(false);
  });

  it("gives each standalone exercise a unique group id", () => {
    const workout = [
      { exerciseName: "A", targetSets: 1, targetReps: "10" },
      { exerciseName: "B", targetSets: 1, targetReps: "10" },
    ];
    const groups = groupWorkout(workout);
    expect(groups?.[0].id).not.toBe(groups?.[1].id);
  });
});

// ---------------------------------------------------------------------------
// parseWeight
// ---------------------------------------------------------------------------
describe("parseWeight", () => {
  it("parses integer kg string", () => {
    expect(parseWeight("80kg")).toBe(80);
  });

  it("parses decimal with dot", () => {
    expect(parseWeight("80.5 kg")).toBe(80.5);
  });

  it("parses decimal with comma", () => {
    expect(parseWeight("80,5kg")).toBe(80.5);
  });

  it("returns undefined for undefined input", () => {
    expect(parseWeight(undefined)).toBeUndefined();
  });

  it("returns undefined when no kg value found", () => {
    expect(parseWeight("bodyweight")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseFirstRep
// ---------------------------------------------------------------------------
describe("parseFirstRep", () => {
  it("returns upper bound of a rep range", () => {
    expect(parseFirstRep("8-12")).toBe(12);
  });

  it("returns the number for a single rep string", () => {
    expect(parseFirstRep("10")).toBe(10);
  });

  it("returns undefined for undefined input", () => {
    expect(parseFirstRep(undefined)).toBeUndefined();
  });

  it("returns undefined when no number found", () => {
    expect(parseFirstRep("AMRAP")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// splitWeight
// ---------------------------------------------------------------------------
describe("splitWeight", () => {
  it("splits integer kg string", () => {
    expect(splitWeight("80kg")).toEqual({ value: "80", unit: "kg" });
  });

  it("splits decimal with unit", () => {
    expect(splitWeight("80.5 kg")).toEqual({ value: "80.5", unit: "kg" });
  });

  it("defaults unit to kg when missing", () => {
    expect(splitWeight("80")).toEqual({ value: "80", unit: "kg" });
  });

  it("handles pure bodyweight string gracefully", () => {
    expect(splitWeight("bodyweight")).toEqual({ value: "BW", unit: "" });
    expect(splitWeight("BW")).toEqual({ value: "BW", unit: "" });
  });

  it("handles bodyweight plus additional weight gracefully", () => {
    expect(splitWeight("bodyweight + 10kg")).toEqual({ value: "BW + 10", unit: "kg" });
    expect(splitWeight("BW + 20")).toEqual({ value: "BW + 20", unit: "kg" });
    expect(splitWeight("bw+5.5 lbs")).toEqual({ value: "BW + 5.5", unit: "lbs" });
  });

  it("returns empty strings for undefined", () => {
    expect(splitWeight(undefined)).toEqual({ value: "", unit: "" });
  });
});

// ---------------------------------------------------------------------------
// isDuration & splitReps
// ---------------------------------------------------------------------------
describe("isDuration", () => {
  it("returns true for duration keywords", () => {
    expect(isDuration("30 secs")).toBe(true);
    expect(isDuration("1 min")).toBe(true);
    expect(isDuration("30 sec hold")).toBe(true);
  });

  it("returns true for single character duration suffixes like s", () => {
    expect(isDuration("30s")).toBe(true);
    expect(isDuration("30 s")).toBe(true);
  });

  it("returns false for standard rep formats and distance", () => {
    expect(isDuration("8-12")).toBe(false);
    expect(isDuration("to failure")).toBe(false);
    expect(isDuration(undefined)).toBe(false);
    // make sure that 's' within words doesn't trigger it if it's not the exact suffix
    expect(isDuration("10 reps")).toBe(false);
    // 'm' should be treated as meters, not minutes
    expect(isDuration("500m")).toBe(false);
  });
});

describe("splitReps", () => {
  it("splits duration correctly", () => {
    expect(splitReps("30 secs")).toEqual({ value: "30", unit: "secs" });
    expect(splitReps("1 min")).toEqual({ value: "1", unit: "min" });
  });

  it("handles standard rep ranges", () => {
    expect(splitReps("8-12")).toEqual({ value: "8-12", unit: "" });
    expect(splitReps("10")).toEqual({ value: "10", unit: "" });
  });

  it("handles freeform text", () => {
    expect(splitReps("to failure")).toEqual({ value: "to failure", unit: "" });
  });
});

// ---------------------------------------------------------------------------
// renderMarkdown
// ---------------------------------------------------------------------------
describe("renderMarkdown", () => {
  it("wraps content in <p> tags", () => {
    const result = renderMarkdown("Hello");
    expect(result).toContain("<p>");
  });

  it("renders bold text", () => {
    const result = renderMarkdown("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("renders italic text", () => {
    const result = renderMarkdown("*italic*");
    expect(result).toContain("<em>italic</em>");
  });

  it("converts double newlines to paragraph breaks", () => {
    const result = renderMarkdown("line1\n\nline2");
    expect(result).toContain("</p>");
    expect(result).toContain('<p class="mt-3">');
  });

  it("strips disallowed HTML tags (XSS protection)", () => {
    const result = renderMarkdown('<script>alert("xss")</script>**safe**');
    expect(result).not.toContain("<script>");
    expect(result).toContain("<strong>safe</strong>");
  });
});

// ---------------------------------------------------------------------------
// titleClass
// ---------------------------------------------------------------------------
describe("titleClass", () => {
  it("returns muted style when completed", () => {
    const classes = titleClass(true);
    expect(classes[0]).toContain("text-muted-foreground");
  });

  it("returns bold style when not completed", () => {
    const classes = titleClass(false);
    expect(classes[0]).toContain("font-bold");
  });
});

// ---------------------------------------------------------------------------
// setSegments
// ---------------------------------------------------------------------------
describe("setSegments", () => {
  it("returns array of given length", () => {
    expect(setSegments(4)).toHaveLength(4);
  });

  it("returns at least 1 segment for 0 sets", () => {
    expect(setSegments(0)).toHaveLength(1);
  });

  it("returns at least 1 segment for negative sets", () => {
    expect(setSegments(-1)).toHaveLength(1);
  });
});
