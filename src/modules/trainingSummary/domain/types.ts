import { z } from "zod";

export const TrainingSummarySchema = z.object({
  year: z.coerce.number(),
  month: z.coerce.number().min(1).max(12),
  workoutDays: z.coerce.number(),
  exerciseName: z.string(),
  sets: z.coerce.number(),
  totalReps: z.coerce.number().optional(),
  maxWeight: z.coerce.number().optional(),
  totalVolume: z.coerce.number().optional(),
  totalDistance: z.coerce.number().optional(),
  totalDuration: z.coerce.number().optional(),
});

export type TrainingSummary = z.infer<typeof TrainingSummarySchema>;
