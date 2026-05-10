import { VALID_MUSCLE_GROUPS } from "@/modules/shared/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { getMuscleActivation, type MuscleActivation, type MuscleGroup } from "./exerciseMuscleMap";

/** Volume landmarks relative to MEV/MAV/MRV */
export type VolumeLandmark = "below_MEV" | "at_MEV" | "at_MAV" | "approaching_MRV" | "above_MRV";

export interface VolumeLandmarks {
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
}

interface WeeklyVolume {
  muscleGroup: MuscleGroup;
  sets: number;
  directSets: number;
  frequencyPerWeek: number;
  hoursSinceLastTrained: number | null;
}

export interface MuscleGroupInsight {
  sets: number;
  directSets: number;
  landmark: VolumeLandmark;
  frequencyPerWeek: number;
  hoursSinceLastTrained: number | null;
  recoveryReady: boolean;
}

/**
 * Weekly hypertrophy volume landmarks by muscle group.
 *
 * Research basis:
 * - Practical volume landmarks (MEV/MAV/MRV) framework from Israetel et al.
 *   ("Volume Landmarks for Muscle Growth", RP, 2017-2019 practical synthesis).
 * - Meta-analyses consistently show a dose-response relationship between weekly
 *   set volume and hypertrophy up to relatively high set counts before plateauing
 *   (Schoenfeld et al., 2017; Baz-Valle et al., 2022).
 *
 * Implementation note:
 * - These thresholds are calibrated to this app's "effective sets" model
 *   (direct sets + weighted secondary contributions), not strict direct-only sets.
 */
export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  Chest: { mev: 8, mavLow: 12, mavHigh: 18, mrv: 22 },
  Back: { mev: 8, mavLow: 14, mavHigh: 20, mrv: 25 },
  Quads: { mev: 6, mavLow: 12, mavHigh: 18, mrv: 20 },
  Hamstrings: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  Shoulders: { mev: 6, mavLow: 12, mavHigh: 20, mrv: 24 },
  Biceps: { mev: 4, mavLow: 8, mavHigh: 18, mrv: 24 },
  Triceps: { mev: 4, mavLow: 8, mavHigh: 16, mrv: 20 },
  Abs: { mev: 2, mavLow: 8, mavHigh: 16, mrv: 22 },
  Calves: { mev: 6, mavLow: 10, mavHigh: 18, mrv: 22 },
  Glutes: { mev: 6, mavLow: 8, mavHigh: 16, mrv: 20 },
};

/**
 * Minimum recovery window (hours) before hard re-stimulation.
 *
 * Research basis:
 * - Muscle protein synthesis and performance recovery generally normalize within
 *   ~24-72h depending on muscle size, damage, and training status
 *   (Damas et al., 2016; Schoenfeld et al., 2019 frequency review).
 *
 * Practical rule:
 * - Larger/high-fatigue groups are assigned 72h, smaller groups 24-48h.
 */
export const RECOVERY_HOURS: Record<MuscleGroup, number> = {
  Chest: 48,
  Back: 72,
  Quads: 72,
  Hamstrings: 72,
  Shoulders: 48,
  Biceps: 48,
  Triceps: 48,
  Abs: 24,
  Calves: 24,
  Glutes: 72,
};

export function classifyLandmark(sets: number, muscleGroup: MuscleGroup): VolumeLandmark {
  const { mev, mavLow, mavHigh, mrv } = VOLUME_LANDMARKS[muscleGroup];

  if (sets >= mrv) return "above_MRV";
  if (sets >= mavHigh) return "approaching_MRV";
  if (sets >= mavLow) return "at_MAV";
  if (sets >= mev) return "at_MEV";
  return "below_MEV";
}

export function calculateWeeklyVolume(
  logs: ExerciseLog[],
  targetDate: Date,
  overrideMap?: Record<string, MuscleActivation>,
): WeeklyVolume[] {
  const oneWeekAgo = new Date(targetDate.getTime() - 7 * 86400000);
  // Rolling 7-day window: strictly after (targetDate - 7d).
  // Logs at exactly the 7-day mark are excluded by convention; in practice this
  // never occurs because loggedAt is a real timestamp, not a calendar-day boundary.
  const recentLogs = logs.filter((l) => l.loggedAt > oneWeekAgo && l.loggedAt <= targetDate);

  const muscleVolume = new Map<MuscleGroup, number>();
  const directMuscleVolume = new Map<MuscleGroup, number>();
  const muscleLastTrained = new Map<MuscleGroup, Date>();
  const muscleTrainingDays = new Map<MuscleGroup, Set<string>>();

  for (const log of recentLogs) {
    const activation = getMuscleActivation(log.exerciseName, overrideMap);
    if (!activation) continue;

    const dayKey = log.loggedAt.toDateString();
    const markMuscleTraining = (muscleGroup: MuscleGroup): void => {
      const days = muscleTrainingDays.get(muscleGroup) ?? new Set<string>();
      days.add(dayKey);
      muscleTrainingDays.set(muscleGroup, days);

      const prevLast = muscleLastTrained.get(muscleGroup);
      if (!prevLast || log.loggedAt > prevLast) {
        muscleLastTrained.set(muscleGroup, log.loggedAt);
      }
    };

    muscleVolume.set(
      activation.primaryMuscle,
      (muscleVolume.get(activation.primaryMuscle) ?? 0) + 1,
    );
    directMuscleVolume.set(
      activation.primaryMuscle,
      (directMuscleVolume.get(activation.primaryMuscle) ?? 0) + 1,
    );
    markMuscleTraining(activation.primaryMuscle);

    /**
     * Indirect work contributes a discounted hypertrophy stimulus.
     * We also count secondary exposure as a "trained day" for frequency so the
     * readiness signal reflects total weekly muscle stress, not only direct isolation work.
     */
    for (const secondary of activation.secondaryMuscles) {
      muscleVolume.set(
        secondary.muscleGroup,
        (muscleVolume.get(secondary.muscleGroup) ?? 0) + secondary.contribution,
      );
      markMuscleTraining(secondary.muscleGroup);
    }
  }

  const result: WeeklyVolume[] = [];
  for (const muscleGroup of VALID_MUSCLE_GROUPS) {
    if (!muscleVolume.has(muscleGroup)) continue;

    const lastTrained = muscleLastTrained.get(muscleGroup);
    const hoursSince = lastTrained
      ? (targetDate.getTime() - lastTrained.getTime()) / (1000 * 3600)
      : null;
    const trainedDays = muscleTrainingDays.get(muscleGroup)?.size ?? 0;

    result.push({
      muscleGroup,
      sets: muscleVolume.get(muscleGroup) ?? 0,
      directSets: directMuscleVolume.get(muscleGroup) ?? 0,
      frequencyPerWeek: trainedDays,
      hoursSinceLastTrained: hoursSince,
    });
  }

  return result;
}

export function isRecovered(
  hoursSinceLastTrained: number | null,
  muscleGroup: MuscleGroup,
): boolean {
  if (hoursSinceLastTrained === null) return true;
  return hoursSinceLastTrained >= RECOVERY_HOURS[muscleGroup];
}

export function calculateMuscleGroupInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleActivation>,
): Partial<Record<MuscleGroup, MuscleGroupInsight>> {
  const weeklyVolumes = calculateWeeklyVolume(logs, targetDate, overrideMap);
  const result: Partial<Record<MuscleGroup, MuscleGroupInsight>> = {};

  for (const volume of weeklyVolumes) {
    const landmark = classifyLandmark(volume.sets, volume.muscleGroup);
    const recovered = isRecovered(volume.hoursSinceLastTrained, volume.muscleGroup);

    result[volume.muscleGroup] = {
      sets: Math.round(volume.sets * 10) / 10,
      directSets: Math.round(volume.directSets * 10) / 10,
      landmark,
      frequencyPerWeek: volume.frequencyPerWeek,
      hoursSinceLastTrained: volume.hoursSinceLastTrained,
      recoveryReady: recovered,
    };
  }

  return result;
}
