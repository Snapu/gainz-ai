/**
 * Deload Phase — Type definitions and duration logic.
 */

import { type FatigueTriggerId, isFatigueTriggerId } from "@/modules/sharedKernel/domain";

/** Duration of a standard deload week in milliseconds (7 days). */
export const DELOAD_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A deload phase record stored in the spreadsheet.
 * All timestamps are ISO 8601 strings for serialization safety.
 */
export interface DeloadPhase {
  startedAt: string;
  endsAt: string;
  fatigueRiskScore: number;
  triggeredBy: FatigueTriggerId[];
  canceledAt?: string;
}

export type DeloadStatus = "active" | "completed" | "canceled" | "none";

export function isDeloadFatigueTriggerId(value: string): value is FatigueTriggerId {
  return isFatigueTriggerId(value);
}

export function getDeloadStatus(phase: DeloadPhase | null, now: Date = new Date()): DeloadStatus {
  if (!phase) return "none";
  if (phase.canceledAt) return "canceled";
  if (now.getTime() >= new Date(phase.endsAt).getTime()) return "completed";
  return "active";
}

export function isDeloadActive(phase: DeloadPhase | null, now: Date = new Date()): boolean {
  return getDeloadStatus(phase, now) === "active";
}

export function deloadDaysRemaining(
  phase: DeloadPhase | null,
  now: Date = new Date(),
): number | null {
  if (getDeloadStatus(phase, now) !== "active") return null;
  if (!phase) return null;
  const msRemaining = new Date(phase.endsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

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
