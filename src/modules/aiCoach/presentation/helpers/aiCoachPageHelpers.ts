import DOMPurify from "dompurify";
import type { AiResponseData } from "@/modules/aiCoach/presentation";

// ---------------------------------------------------------------------------
// View-model types
// ---------------------------------------------------------------------------

export interface DisplayExercise {
  exerciseName: string;
  targetSets: number;
  targetReps: string;
  targetWeight?: string;
  targetRpe?: number;
  notes?: string;
  supersetId?: string;
}

export interface DisplayWorkoutGroup {
  id: string;
  isSuperset: boolean;
  exercises: DisplayExercise[];
}

export interface DisplayInsight {
  id: string;
  timestamp: Date;
  isLatest: boolean;
  rawContent: string;
  parsedData: AiResponseData | null;
  requestPayload: string | null;
}

// ---------------------------------------------------------------------------
// AI response parsing
// ---------------------------------------------------------------------------

/** Tries to parse raw AI message content as structured AiResponseData. Returns null on failure. */
export function tryParseAiResponse(content: string): AiResponseData | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.coachMessage === "string") {
      return parsed as AiResponseData;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Workout grouping
// ---------------------------------------------------------------------------

/** Groups a flat workout exercise list into superset groups and standalone exercises. */
export function groupWorkout(workout: DisplayExercise[] | undefined): DisplayWorkoutGroup[] | null {
  if (!workout || workout.length === 0) return null;

  const groups: DisplayWorkoutGroup[] = [];
  workout.forEach((ex) => {
    if (ex.supersetId) {
      const existing = groups.find((g) => g.isSuperset && g.id === ex.supersetId);
      if (existing) {
        existing.exercises.push(ex);
      } else {
        groups.push({ id: ex.supersetId, isSuperset: true, exercises: [ex] });
      }
    } else {
      groups.push({ id: crypto.randomUUID(), isSuperset: false, exercises: [ex] });
    }
  });
  return groups;
}

// ---------------------------------------------------------------------------
// Weight / rep string parsing
// ---------------------------------------------------------------------------

/** Extracts numeric weight in kg from strings like "80kg", "80.5 kg", "80,5kg". */
export function parseWeight(targetWeight?: string): number | undefined {
  if (!targetWeight) return undefined;
  const match = targetWeight.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return match?.[1] ? parseFloat(match[1].replace(",", ".")) : undefined;
}

/**
 * Extracts the upper bound of a rep range from strings like "8-12" → 12, "10" → 10.
 * Uses the upper bound so the prefill starts at the target ceiling.
 */
export function parseFirstRep(targetReps?: string): number | undefined {
  if (!targetReps) return undefined;
  const rangeMatch = targetReps.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch?.[2]) return parseInt(rangeMatch[2], 10);
  const singleMatch = targetReps.match(/(\d+)/);
  return singleMatch?.[1] ? parseInt(singleMatch[1], 10) : undefined;
}

/** Splits a weight string like "80.5kg" into `{ value: "80.5", unit: "kg" }`. */
export function splitWeight(weightStr?: string): { value: string; unit: string } {
  if (!weightStr) return { value: "", unit: "" };
  const match = weightStr.match(/^(\d+[.,]?\d*)\s*(.*)$/);
  if (match) {
    return { value: match[1], unit: match[2] || "kg" };
  }
  return { value: weightStr, unit: "kg" };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/** Renders a minimal markdown subset (bold, italic, newlines) to safe HTML via DOMPurify. */
export function renderMarkdown(text: string): string {
  const html = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, "<br/>");
  return DOMPurify.sanitize(`<p>${html}</p>`, { ALLOWED_TAGS: ["p", "strong", "em", "br"] });
}

// ---------------------------------------------------------------------------
// Exercise card helpers
// ---------------------------------------------------------------------------

/** Returns the Tailwind classes for an exercise card title depending on completion state. */
export function titleClass(isCompleted: boolean): string[] {
  return [
    isCompleted
      ? "text-sm font-semibold text-muted-foreground truncate"
      : "text-base font-bold tracking-tight break-words leading-tight",
  ];
}

/** Returns an array of the given length to drive a segmented progress bar. */
export function setSegments(targetSets: number): unknown[] {
  return Array.from({ length: Math.max(1, targetSets) });
}
