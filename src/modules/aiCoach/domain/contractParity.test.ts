import { describe, expect, it } from "vitest";
import {
  isDuration as edgeIsDuration,
  parseFirstRep as edgeParseFirstRep,
  splitReps as edgeSplitReps,
} from "../../../../supabase/functions/ai-coach/postProcess";
import { sanitizeSuggestedFollowUps as edgeSanitizeSuggestedFollowUps } from "../../../../supabase/functions/ai-coach/schemas";
import { isDuration, parseFirstRep, sanitizeSuggestedFollowUps, splitReps } from "./index";

describe("aiCoach Client & Edge cross-boundary contract parity", () => {
  const repEdgeCases: Array<string | undefined> = [
    "45s",
    "8-12",
    "0m",
    "30 secs",
    "1 min",
    "30 sec hold",
    "500m",
    "10",
    "AMRAP",
    "to failure",
    "10 reps",
    "",
    undefined,
  ];

  it("maintains 100% parity on isDuration across all rep and duration edge cases", () => {
    for (const input of repEdgeCases) {
      expect(isDuration(input)).toBe(edgeIsDuration(input));
    }
  });

  it("maintains 100% parity on parseFirstRep across all rep range and duration edge cases", () => {
    for (const input of repEdgeCases) {
      expect(parseFirstRep(input)).toBe(edgeParseFirstRep(input));
    }
  });

  it("maintains 100% parity on splitReps across all rep and unit edge cases", () => {
    for (const input of repEdgeCases) {
      expect(splitReps(input)).toEqual(edgeSplitReps(input));
    }
  });

  it("maintains 100% parity on sanitizeSuggestedFollowUps across edge cases and sanitization boundaries", () => {
    const testCases: unknown[] = [
      null,
      undefined,
      123,
      "string",
      {},
      [],
      [{ label: "", prompt: "" }],
      [{ label: "   ", prompt: "   " }],
      [null, undefined, 42],
      [{ label: "45s", prompt: "Should I hold for 45s?" }],
      [{ label: "8-12", prompt: "Should I target 8-12 reps?" }],
      [{ label: "0m", prompt: "Zero meter warm-up?" }],
      [
        { label: "  Swap Bench  ", prompt: "  Can we use dumbbells?  " },
        { label: "Valid Label", prompt: "Valid Prompt" },
        { label: "Missing prompt" },
        { prompt: "Missing label" },
        { label: "   ", prompt: "Has prompt" },
        { label: "Has label", prompt: "   " },
      ],
      [
        { label: "Bench Swap", prompt: "Can we swap bench?" },
        { label: "Different Label", prompt: "can we swap bench?" },
      ],
      [
        { label: "Warmup Sets", prompt: "How should I structure warmup sets for Bench?" },
        { label: "warmup sets", prompt: "How should I structure warmup sets for Incline?" },
      ],
      [
        { label: "Item 1", prompt: "Prompt 1" },
        { label: "Item 2", prompt: "Prompt 2" },
        { label: "Item 3", prompt: "Prompt 3" },
        { label: "Item 4", prompt: "Prompt 4" },
        { label: "Item 5", prompt: "Prompt 5" },
      ],
    ];

    for (const tc of testCases) {
      expect(sanitizeSuggestedFollowUps(tc)).toEqual(edgeSanitizeSuggestedFollowUps(tc));
    }
  });
});
