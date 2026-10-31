import { describe, expect, it } from "vitest";
import { sanitizeSuggestedFollowUps } from "./types";

describe("sanitizeSuggestedFollowUps", () => {
  it("returns undefined for non-array inputs", () => {
    expect(sanitizeSuggestedFollowUps(null)).toBeUndefined();
    expect(sanitizeSuggestedFollowUps(undefined)).toBeUndefined();
    expect(sanitizeSuggestedFollowUps("string")).toBeUndefined();
    expect(sanitizeSuggestedFollowUps(123)).toBeUndefined();
    expect(sanitizeSuggestedFollowUps({})).toBeUndefined();
  });

  it("returns undefined for empty array or array with only invalid/whitespace items", () => {
    expect(sanitizeSuggestedFollowUps([])).toBeUndefined();
    expect(sanitizeSuggestedFollowUps([{ label: "", prompt: "" }])).toBeUndefined();
    expect(sanitizeSuggestedFollowUps([{ label: "   ", prompt: "   " }])).toBeUndefined();
    expect(sanitizeSuggestedFollowUps([null, undefined, 42])).toBeUndefined();
  });

  it("trims valid labels and prompts", () => {
    const result = sanitizeSuggestedFollowUps([
      { label: "  Swap Bench  ", prompt: "  Can we use dumbbells?  " },
    ]);
    expect(result).toEqual([{ label: "Swap Bench", prompt: "Can we use dumbbells?" }]);
  });

  it("filters out items where either label or prompt is missing or blank", () => {
    const result = sanitizeSuggestedFollowUps([
      { label: "Valid Label", prompt: "Valid Prompt" },
      { label: "Missing prompt" },
      { prompt: "Missing label" },
      { label: "   ", prompt: "Has prompt" },
      { label: "Has label", prompt: "   " },
    ]);
    expect(result).toEqual([{ label: "Valid Label", prompt: "Valid Prompt" }]);
  });

  it("deduplicates by prompt case-insensitively", () => {
    const result = sanitizeSuggestedFollowUps([
      { label: "Bench Swap", prompt: "Can we swap bench?" },
      { label: "Different Label", prompt: "can we swap bench?" },
    ]);
    expect(result).toEqual([{ label: "Bench Swap", prompt: "Can we swap bench?" }]);
  });

  it("deduplicates by label case-insensitively", () => {
    const result = sanitizeSuggestedFollowUps([
      { label: "Warmup Sets", prompt: "How should I structure warmup sets for Bench?" },
      { label: "warmup sets", prompt: "How should I structure warmup sets for Incline?" },
    ]);
    expect(result).toEqual([
      { label: "Warmup Sets", prompt: "How should I structure warmup sets for Bench?" },
    ]);
  });

  it("caps the output to a maximum of 4 suggestions", () => {
    const items = [
      { label: "Item 1", prompt: "Prompt 1" },
      { label: "Item 2", prompt: "Prompt 2" },
      { label: "Item 3", prompt: "Prompt 3" },
      { label: "Item 4", prompt: "Prompt 4" },
      { label: "Item 5", prompt: "Prompt 5" },
      { label: "Item 6", prompt: "Prompt 6" },
    ];
    const result = sanitizeSuggestedFollowUps(items);
    expect(result).toHaveLength(4);
    expect(result?.map((r) => r.label)).toEqual(["Item 1", "Item 2", "Item 3", "Item 4"]);
  });
});
