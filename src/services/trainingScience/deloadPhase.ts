/**
 * Deload Phase — Type definitions and duration logic.
 *
 * A deload is a planned period of reduced training volume and intensity, allowing
 * accumulated fatigue to dissipate and supercompensation to occur.
 *
 * Duration rationale (7 days):
 * - The neuromuscular and hormonal markers of overreaching normalise within
 *   5–10 days of reduced load (Meeusen et al., 2013; Kreher & Schwartz, 2012).
 * - A 7-day window aligns with the weekly training cycle, minimising schedule
 *   disruption and matching the ACWR acute window — after one full week of
 *   lower-intensity work the ACWR recalibrates to a safe baseline.
 *
 * References:
 * - Meeusen R et al. (2013). Prevention, diagnosis, and treatment of the
 *   overtraining syndrome. Med Sci Sports Exerc, 45(1), 186-205.
 * - Kreher JB & Schwartz JB (2012). Overtraining syndrome: a practical guide.
 *   Sports Health, 4(2), 128-138.
 */

import type { FatigueTriggerId } from "./fatigueDetection";

/** Duration of a standard deload week in milliseconds (7 days). */
export const DELOAD_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A deload phase record stored in the spreadsheet.
 * All timestamps are ISO 8601 strings for serialisation safety.
 */
export interface DeloadPhase {
  /** ISO timestamp: when the deload started. */
  startedAt: string;
  /** ISO timestamp: scheduled end of the deload (startedAt + DELOAD_DURATION_MS). */
  endsAt: string;
  /** Fatigue risk score snapshot at the moment of trigger (0–7 in this model). */
  fatigueRiskScore: number;
  /** Which fatigue triggers were active when the deload was initiated. */
  triggeredBy: FatigueTriggerId[];
  /** ISO timestamp: set when the user cancels early, absent otherwise. */
  canceledAt?: string;
}

/**
 * Derived runtime status — never stored, always computed from dates.
 *
 * - "active"    : deload ongoing, fatigue detection suppressed, e1RM excludes range
 * - "completed" : endsAt has passed, athlete is back to normal training
 * - "canceled"  : user cancelled early
 * - "none"      : no deload has occurred or data unavailable
 */
export type DeloadStatus = "active" | "completed" | "canceled" | "none";

/** Compute the derived status of a deload phase at a given reference time. */
export function getDeloadStatus(phase: DeloadPhase | null, now: Date = new Date()): DeloadStatus {
  if (!phase) return "none";
  if (phase.canceledAt) return "canceled";
  if (now.getTime() >= new Date(phase.endsAt).getTime()) return "completed";
  return "active";
}

/** Returns true when the deload is currently active (guards fatigue detection + e1RM). */
export function isDeloadActive(phase: DeloadPhase | null, now: Date = new Date()): boolean {
  return getDeloadStatus(phase, now) === "active";
}

/**
 * Derive how many full days remain in an active deload.
 * Returns null when not active.
 */
export function deloadDaysRemaining(
  phase: DeloadPhase | null,
  now: Date = new Date(),
): number | null {
  if (getDeloadStatus(phase, now) !== "active") return null;
  const msRemaining = new Date(phase!.endsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

/**
 * Derive completion percentage (0–100) for the cooldown progress bar.
 * Returns null when not active.
 */
export function deloadProgressPercent(
  phase: DeloadPhase | null,
  now: Date = new Date(),
): number | null {
  if (!phase || getDeloadStatus(phase, now) !== "active") return null;
  const start = new Date(phase.startedAt).getTime();
  const end = new Date(phase.endsAt).getTime();
  const elapsed = now.getTime() - start;
  return Math.min(100, Math.max(0, Math.round((elapsed / (end - start)) * 100)));
}

/**
 * Build a new DeloadPhase record with locally computed end date.
 * Called immediately after the AI returns startDeload: true.
 */
export function createDeloadPhase(
  fatigueRiskScore: number,
  triggeredBy: FatigueTriggerId[],
  now: Date = new Date(),
): DeloadPhase {
  return {
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + DELOAD_DURATION_MS).toISOString(),
    fatigueRiskScore,
    triggeredBy,
  };
}
