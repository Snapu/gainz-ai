import type { MuscleGroup } from "@/modules/sharedKernel/domain";

/**
 * Physiological metric bounds representing empirical discoveries of an athlete's
 * true volume landmarks, overriding population averages.
 *
 * Based on the Volume Landmark theory codified by Dr. Mike Israetel (Renaissance Periodization).
 * References:
 * - Israetel, M., Hoffmann, J., & Smith, C. W. (2020). Scientific Principles of Hypertrophy Training.
 * - Israetel, M. (2017). How Much Should I Train? (MEV, MAV, MRV concepts).
 */
export interface PhysiologicalMetric {
  muscleGroup: MuscleGroup;

  /**
   * Maximum Adaptive Volume (MAV).
   * Empirically discovered when the athlete shows significant strength progression
   * (e1RM improving) while training at or above this volume threshold.
   */
  personalMAV?: number;

  /**
   * Maximum Recoverable Volume (MRV).
   * Empirically discovered when the athlete experiences a performance decline
   * (e1RM dropping) despite adequate recovery, indicating they have exceeded
   * their capacity to adapt to the stimulus.
   */
  personalMRV?: number;

  /** ISO 8601 Date string tracking when this metric was last discovered/updated. */
  lastUpdated: string;
}

export type PhysiologicalMetricsMap = Record<MuscleGroup, PhysiologicalMetric>;

/**
 * Structural type for the insight required to run empirical discovery.
 * Uses primitive types to avoid tight coupling to the TrainingInsights bounded context.
 */
export interface EmpiricalDiscoveryInput {
  sets: number;
  landmark: string;
  trendStatus?: "improving" | "plateau" | "dropping" | "stable";
}

/**
 * Domain policy for Empirical Landmark Discovery.
 * Evaluates recent training insights against existing metrics to determine
 * if a new personal volume landmark has been discovered.
 *
 * @param insight The current state of training for a muscle group
 * @param existingMetric The previously discovered metrics, if any
 * @returns The updates to apply, or null if no new discovery was made
 */
export function calculateMetricUpdates(
  insight: EmpiricalDiscoveryInput,
  existingMetric?: PhysiologicalMetric,
): Partial<Omit<PhysiologicalMetric, "muscleGroup">> | null {
  const updates: Partial<Omit<PhysiologicalMetric, "muscleGroup">> = {};
  let hasUpdates = false;

  if (insight.trendStatus === "improving" && insight.landmark === "at_MAV") {
    const existingMAV = existingMetric?.personalMAV || 0;
    if (insight.sets > existingMAV) {
      updates.personalMAV = insight.sets;
      hasUpdates = true;
    }
  } else if (insight.trendStatus === "dropping" && insight.landmark === "above_MRV") {
    // If they are dropping while above MRV, the current volume is recorded as their MRV ceiling.
    updates.personalMRV = insight.sets;
    hasUpdates = true;
  }

  return hasUpdates ? updates : null;
}
