import { type Schema, Type } from "@google/genai";
import type { Event } from "@/modules/events/domain";
import type { UserProfile } from "@/modules/profile/domain";
import type { TrainingInsights } from "@/modules/trainingInsights/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { TrainingSummary } from "@/modules/trainingSummary/domain";
import type { TrainingPlan } from "./trainingPlan";

/**
 * AI Coach domain types and contracts.
 * Framework-agnostic request/response models for coaching orchestration.
 */

export interface CoachingAdviceRequest {
  apiKey: string | undefined;
  userProfile: UserProfile;
  insights: TrainingInsights;
  exerciseLogs: ExerciseLog[];
  trainingSummaries: TrainingSummary[];
  previousMessages: CoachingMessage[];
  events?: Event[];
  question?: string;
  mode?: "planning" | "execution";
  activePlan?: TrainingPlan | null;
}

export type CoachingMessage = {
  id: string;
  role: "user" | "coach";
  content: string;
  sessionId: string;
  /** ISO timestamp of when this message was created. Used to find new sets since last coaching advice. */
  timestamp: string;
  logsCount: number;
  logsChecksum?: string;
};

export type CoachingAdviceError =
  | "missing-api-key"
  | "generate-content-stream-failed"
  | "coaching-request-failed";

export interface CoachingAdviceResult {
  advice: CoachingAdvice;
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

export interface CoachingAdvice {
  scratchpad?: string;
  coachMessage: string;
  /** Set to true by AI when fatigue detection signals shouldDeload=true. App auto-starts the deload. */
  startDeload?: boolean;
  recommendedWorkout?: {
    exerciseName: string;
    targetSets: number;
    targetReps?: string;
    targetDurationSeconds?: number;
    targetDistanceMeters?: number;
    targetWeight?: string;
    targetRpe?: number;
    restSeconds?: number;
    isMetabolicProtocol?: boolean;
    notes?: string;
    supersetId?: string;
    primaryMuscle?: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
  }[];
  trainingPlan?: {
    cycleWeeks: number;
    sessions: PlannedSession[];
  };
}

/**
 * AI response JSON schema for structured output.
 * Defines the contract between GenAI and the app.
 */
export function createCoachingAdviceSchema(
  muscleGroupsList: string[],
  mode: "planning" | "execution" = "execution",
): Schema {
  const MUSCLE_GROUPS_PROMPT_LIST = muscleGroupsList.join(", ");

  const properties: Record<string, Schema> = {
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
      description:
        "Optional recommended exercises to add to today's workout. OMIT this entirely during mid-workout conversational Q&A to preserve the existing plan.",
      items: {
        type: Type.OBJECT,
        required: ["exerciseName", "targetSets", "restSeconds"],
        properties: {
          exerciseName: { type: Type.STRING },
          targetSets: { type: Type.INTEGER },
          targetReps: {
            type: Type.STRING,
            description:
              "Used for counting movements (e.g. '8-12', 'failure'). Do NOT use if duration or distance is provided.",
          },
          targetDurationSeconds: {
            type: Type.INTEGER,
            description:
              "Used ONLY for time-based exercises like planks or isometric holds (e.g. 30, 60). Do NOT use targetReps if this is used.",
          },
          targetDistanceMeters: {
            type: Type.INTEGER,
            description:
              "Used ONLY for distance-based cardio like running or rowing (e.g. 500, 1000). Do NOT use targetReps if this is used.",
          },
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
          isMetabolicProtocol: {
            type: Type.BOOLEAN,
            description:
              "Set to true for drop-sets, myo-reps, or rest-pause sets to bypass strict rest periods.",
          },
        },
      },
    },
  };

  if (mode === "planning") {
    properties.trainingPlan = {
      type: Type.OBJECT,
      description: "A 2-week training program generated by the AI.",
      properties: {
        cycleWeeks: { type: Type.INTEGER },
        sessions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              dayOfWeek: { type: Type.INTEGER, description: "0=Sun, 1=Mon...6=Sat" },
              weekNumber: { type: Type.INTEGER, description: "1 or 2" },
              sessionLabel: { type: Type.STRING, description: "e.g., 'Unit A — Push Focus'" },
              focusDescription: { type: Type.STRING },
              exercises: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ["exerciseName", "targetSets"],
                  properties: {
                    exerciseName: { type: Type.STRING },
                    targetSets: { type: Type.INTEGER },
                    targetReps: { type: Type.STRING },
                    targetDurationSeconds: { type: Type.INTEGER },
                    targetDistanceMeters: { type: Type.INTEGER },
                    targetWeight: { type: Type.STRING },
                    targetRpe: { type: Type.NUMBER },
                    restSeconds: { type: Type.INTEGER },
                    notes: { type: Type.STRING },
                    supersetId: { type: Type.STRING },
                    primaryMuscle: { type: Type.STRING },
                    secondaryMuscles: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          muscleGroup: { type: Type.STRING },
                          contribution: { type: Type.NUMBER },
                        },
                      },
                    },
                  },
                },
              },
            },
            required: ["dayOfWeek", "weekNumber", "sessionLabel", "focusDescription", "exercises"],
          },
        },
      },
      required: ["cycleWeeks", "sessions"],
    };
  }

  return {
    type: Type.OBJECT,
    properties,
    required: ["coachMessage"],
  };
}

export interface PlannedSession {
  dayOfWeek: number; // 0=Sun … 6=Sat
  weekNumber: number; // 1 or 2
  sessionLabel: string; // e.g., "Unit A — Push Focus"
  focusDescription: string; // e.g., "Heavy Chest & Quad-Dominant"
  exercises: PlannedExercise[];
}

interface PlannedExercise {
  exerciseName: string;
  targetSets: number;
  targetReps?: string;
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
  targetWeight?: string;
  targetRpe?: number;
  restSeconds?: number;
  notes?: string;
  supersetId?: string;
  primaryMuscle?: string;
  secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
}
