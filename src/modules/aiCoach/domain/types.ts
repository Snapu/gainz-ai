import { type Schema, Type } from "@google/genai";

/**
 * AI Coach domain types and contracts.
 * Framework-agnostic request/response models for coaching orchestration.
 */

export type PreviousAiMessage = {
  role: "user" | "assistant";
  content: string;
  sessionDate: string;
  /** ISO timestamp of when this message was created. Used to find new sets since last AI response. */
  timestamp: string;
  logsCount: number;
};

export type AskAiError = "missing-api-key" | "generate-content-stream-failed" | "ai-request-failed";

export interface AskAiResult {
  responseText: string;
  requestPayload: string;
}

export interface ExerciseCleanupResult {
  classifications: Array<{
    exerciseName: string;
    primaryMuscle: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
    confidence: number;
  }>;
}

export interface AiResponseData {
  scratchpad?: string;
  coachMessage: string;
  /** Set to true by AI when fatigue detection signals shouldDeload=true. App auto-starts the deload. */
  startDeload?: boolean;
  recommendedWorkout?: {
    exerciseName: string;
    targetSets: number;
    targetReps: string;
    targetWeight?: string;
    targetRpe?: number;
    restSeconds?: number;
    notes?: string;
    supersetId?: string;
    primaryMuscle?: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
  }[];
}

/**
 * AI response JSON schema for structured output.
 * Defines the contract between GenAI and the app.
 */
export function createAiResponseSchema(muscleGroupsList: string[]): Schema {
  const MUSCLE_GROUPS_PROMPT_LIST = muscleGroupsList.join(", ");

  return {
    type: Type.OBJECT,
    properties: {
      scratchpad: {
        type: Type.STRING,
        description:
          "Internal workspace for reasoning and calculations. Usage depends on phase — see system instructions. NOT shown to user.",
      },
      startDeload: {
        type: Type.BOOLEAN,
        description:
          "Set to true ONLY when fatigue.shouldDeload is true. This signals the app to automatically begin a 7-day deload phase. Do NOT set true during an already-active deload (deloadStatus='active'). Omit or set false otherwise.",
      },
      coachMessage: {
        type: Type.STRING,
        description:
          "The empathetic, motivating, and analytical message from the coach. Max 2-3 short paragraphs.",
      },
      recommendedWorkout: {
        type: Type.ARRAY,
        description: "Optional recommended exercises to add to today's workout.",
        items: {
          type: Type.OBJECT,
          required: ["exerciseName", "targetSets", "targetReps", "restSeconds"],
          properties: {
            exerciseName: { type: Type.STRING },
            targetSets: { type: Type.INTEGER },
            targetReps: { type: Type.STRING },
            targetWeight: {
              type: Type.STRING,
              description:
                "Exact numeric weight only (e.g. '60kg', 'Bodyweight'). Keep it extremely concise (1-2 words). Do not explain logic.",
            },
            targetRpe: {
              type: Type.NUMBER,
              description:
                "Optional Target RPE (Rate of Perceived Exertion) from 6.0 to 10.0 (e.g. 8.5).",
            },
            notes: {
              type: Type.STRING,
              description:
                "Advanced execution cue, tempo (e.g. '3s eccentric pause'), or anatomical focus (e.g. 'Bias long head'). Omit if nothing special.",
            },
            supersetId: {
              type: Type.STRING,
              description:
                "Optional. Assign the same identifier (e.g. 'A', 'B') to exercises that should be performed together as a superset.",
            },
            primaryMuscle: {
              type: Type.STRING,
              description: `Primary muscle group this exercise targets. Must be one of: ${MUSCLE_GROUPS_PROMPT_LIST}.`,
            },
            secondaryMuscles: {
              type: Type.ARRAY,
              description:
                "Optional secondary muscle groups this exercise also activates, with their fractional contribution (0.0–1.0). E.g. Bench Press also activates Triceps (0.5) and Shoulders (0.3).",
              items: {
                type: Type.OBJECT,
                required: ["muscleGroup"],
                properties: {
                  muscleGroup: {
                    type: Type.STRING,
                    description: `Must be one of: ${MUSCLE_GROUPS_PROMPT_LIST}.`,
                  },
                  contribution: {
                    type: Type.NUMBER,
                    description:
                      "Fraction of a set credited to this muscle (0.0–1.0). Omit to default to 0.5.",
                  },
                },
              },
            },
            restSeconds: {
              type: Type.INTEGER,
              description:
                "Recommended rest between sets in seconds. 180–300 for strength (1–5 reps), 120–180 for hypertrophy (6–12 reps), 45–90 for fat loss/endurance (12–20 reps), 15–30 for endurance/circuit (20–25 reps).",
            },
          },
        },
      },
    },
    required: ["coachMessage"],
  };
}
