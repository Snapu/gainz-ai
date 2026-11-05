import { describe, expect, it } from "vitest";
import {
  getValidSupersetId,
  groupWorkout,
  isDuration,
  isSupersetStart,
  parseFirstRep,
  parseWeight,
  renderMarkdown,
  setSegments,
  shouldShowWeekBadge,
  splitReps,
  splitWeight,
  supersetConnectorClass,
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

  it("safely parses and trims valid suggestedFollowUps", () => {
    const content = JSON.stringify({
      coachMessage: "Ready!",
      suggestedFollowUps: [{ label: "  Swap Squats  ", prompt: "  Can we use Leg Press?  " }],
    });
    const result = tryParseCoachingAdvice(content);
    expect(result?.suggestedFollowUps).toEqual([
      { label: "Swap Squats", prompt: "Can we use Leg Press?" },
    ]);
  });

  it("filters out empty or invalid items in suggestedFollowUps", () => {
    const content = JSON.stringify({
      coachMessage: "Ready!",
      suggestedFollowUps: [
        { label: "Valid", prompt: "Valid prompt" },
        { label: "   ", prompt: "Blank label" },
        { label: "Blank prompt", prompt: "   " },
        null,
        123,
      ],
    });
    const result = tryParseCoachingAdvice(content);
    expect(result?.suggestedFollowUps).toEqual([{ label: "Valid", prompt: "Valid prompt" }]);
  });

  it("deletes suggestedFollowUps when it is not an array", () => {
    const content = JSON.stringify({
      coachMessage: "Ready!",
      suggestedFollowUps: "none",
    });
    const result = tryParseCoachingAdvice(content);
    expect(result?.suggestedFollowUps).toBeUndefined();
  });

  it("sets suggestedFollowUps to undefined when array contains only empty items", () => {
    const content = JSON.stringify({
      coachMessage: "Ready!",
      suggestedFollowUps: [{ label: " ", prompt: " " }],
    });
    const result = tryParseCoachingAdvice(content);
    expect(result?.suggestedFollowUps).toBeUndefined();
  });

  it("deduplicates by label and caps at 4 items", () => {
    const content = JSON.stringify({
      coachMessage: "Ready!",
      suggestedFollowUps: [
        { label: "Swap 1", prompt: "Prompt 1" },
        { label: "swap 1", prompt: "Prompt 2" },
        { label: "Swap 2", prompt: "Prompt 3" },
        { label: "Swap 3", prompt: "Prompt 4" },
        { label: "Swap 4", prompt: "Prompt 5" },
        { label: "Swap 5", prompt: "Prompt 6" },
      ],
    });
    const result = tryParseCoachingAdvice(content);
    expect(result?.suggestedFollowUps).toHaveLength(4);
    expect(result?.suggestedFollowUps?.map((f) => f.label)).toEqual([
      "Swap 1",
      "Swap 2",
      "Swap 3",
      "Swap 4",
    ]);
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
    expect(result).toContain("<p>line1</p>");
    expect(result).toContain("<p>line2</p>");
  });

  it("converts single newlines to br tags", () => {
    const result = renderMarkdown("line1\nline2");
    expect(result).toContain("<br");
  });

  it("renders bullet points starting with asterisk into unordered lists", () => {
    const result = renderMarkdown("* Item 1\n* Item 2");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Item 1</li>");
    expect(result).toContain("<li>Item 2</li>");
    expect(result).toContain("</ul>");
  });

  it("renders bullet points starting with hyphen into unordered lists", () => {
    const result = renderMarkdown("- Item A\n- Item B");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Item A</li>");
    expect(result).toContain("<li>Item B</li>");
    expect(result).toContain("</ul>");
  });

  it("renders bold text inside bullet points correctly without asterisk collisions", () => {
    const result = renderMarkdown("* **Bench Press**: 3 sets\n* **Incline Press**: 3 sets");
    expect(result).toContain("<li><strong>Bench Press</strong>: 3 sets</li>");
    expect(result).toContain("<li><strong>Incline Press</strong>: 3 sets</li>");
  });

  it("renders numbered lists into ordered lists", () => {
    const result = renderMarkdown("1. First step\n2. Second step");
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>First step</li>");
    expect(result).toContain("<li>Second step</li>");
    expect(result).toContain("</ol>");
  });

  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("strips disallowed HTML tags (XSS protection)", () => {
    const result = renderMarkdown('<script>alert("xss")</script>\n\n**safe**');
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

// ---------------------------------------------------------------------------
// getValidSupersetId & shouldShowWeekBadge
// ---------------------------------------------------------------------------
describe("getValidSupersetId", () => {
  it("returns supersetId when 2 or more exercises share the same id", () => {
    const exercises = [{ supersetId: "ss-1" }, { supersetId: "ss-1" }, { supersetId: "ss-2" }];
    expect(getValidSupersetId(exercises[0], exercises)).toBe("ss-1");
  });

  it("returns undefined for solitary superset exercises", () => {
    const exercises = [{ supersetId: "ss-orphan" }, { supersetId: "ss-2" }];
    expect(getValidSupersetId(exercises[0], exercises)).toBeUndefined();
  });

  it("returns undefined when exercise has no supersetId or is undefined", () => {
    expect(getValidSupersetId(undefined, [])).toBeUndefined();
    expect(getValidSupersetId({}, [{ supersetId: "ss-1" }])).toBeUndefined();
  });
});

describe("shouldShowWeekBadge", () => {
  it("returns false if label contains week or woche case-insensitively", () => {
    expect(shouldShowWeekBadge("Woche 1 - Einheit 1")).toBe(false);
    expect(shouldShowWeekBadge("Week 2 - Pull")).toBe(false);
    expect(shouldShowWeekBadge("WEEK 3")).toBe(false);
    expect(shouldShowWeekBadge("W1 - Push")).toBe(false);
    expect(shouldShowWeekBadge("w2 session")).toBe(false);
  });

  it("returns true if label does not contain week or woche", () => {
    expect(shouldShowWeekBadge("Push Session A")).toBe(true);
    expect(shouldShowWeekBadge("Lower Body Focus")).toBe(true);
    expect(shouldShowWeekBadge("")).toBe(true);
    expect(shouldShowWeekBadge(undefined)).toBe(true);
    expect(shouldShowWeekBadge(null)).toBe(true);
  });
});

describe("supersetConnectorClass and isSupersetStart", () => {
  const exercises = [
    { supersetId: "ss-1" },
    { supersetId: "ss-1" },
    { supersetId: "ss-2" },
    { supersetId: "ss-2" },
    { supersetId: "ss-2" },
    {},
  ];

  it("returns top rounded class for the first exercise in a pair", () => {
    expect(supersetConnectorClass(0, exercises)).toBe("top-2 bottom-0 rounded-t-full");
    expect(isSupersetStart(0, exercises)).toBe(true);
  });

  it("returns bottom rounded class for the last exercise in a pair", () => {
    expect(supersetConnectorClass(1, exercises)).toBe("top-0 bottom-2 rounded-b-full");
    expect(isSupersetStart(1, exercises)).toBe(false);
  });

  it("returns middle continuous class for the middle exercise in a triplet", () => {
    expect(supersetConnectorClass(3, exercises)).toBe("top-0 bottom-0");
    expect(isSupersetStart(3, exercises)).toBe(false);
  });

  it("returns empty string and false for non-superset exercises", () => {
    expect(supersetConnectorClass(5, exercises)).toBe("");
    expect(isSupersetStart(5, exercises)).toBe(false);
  });
});
