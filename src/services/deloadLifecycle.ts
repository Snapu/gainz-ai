export type DeloadStatus = "active" | "inactive";

export interface DeloadTriggerSnapshot {
  weeklyTotalSets: number[];
  weeklyTonnage: number[];
  triggeredBy?: string[]; // trigger IDs active at deload start (e.g. ['volumeSpike', 'performanceDecline'])
  decliningExercisesAtStart?: number; // strength-decline count at trigger time
}

export interface DeloadLifecycle {
  status: DeloadStatus;
  startedAtIso?: string;
  endsAtIso?: string;
  recommendationIssuedAtIso?: string;
  triggerReason?: string;
  triggerSnapshot?: DeloadTriggerSnapshot;
  lastEndedAtIso?: string;
  currentBlockStartedAtIso?: string;
  postStopConservativeSessionsRemaining?: number;
}

export interface DeloadRecommendation {
  shouldDeload: boolean;
  reason?: string;
  snapshot?: DeloadTriggerSnapshot;
}

interface DeloadTransitionOptions {
  now?: Date;
  manualStop?: boolean;
  deloadDurationDays?: number;
  conservativeSessionsAfterManualStop?: number;
  restartCooldownMs?: number;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const DEFAULT_DELOAD_DURATION_DAYS = 7;
const DEFAULT_POST_STOP_CONSERVATIVE_SESSIONS = 3;
const DEFAULT_RESTART_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function toIso(date: Date): string {
  return date.toISOString();
}

function toDate(iso?: string): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDeloadEndDate(startedAt: Date, deloadDurationDays: number): Date {
  return new Date(startedAt.getTime() + deloadDurationDays * MS_PER_DAY);
}

function ensureBaseLifecycle(
  lifecycle: DeloadLifecycle | undefined,
  now: Date,
): DeloadLifecycle {
  if (lifecycle) return { ...lifecycle };
  return {
    status: "inactive",
    currentBlockStartedAtIso: toIso(now),
    postStopConservativeSessionsRemaining: 0,
  };
}

function autoEndIfExpired(lifecycle: DeloadLifecycle, now: Date): DeloadLifecycle {
  if (lifecycle.status !== "active") return lifecycle;
  const endsAt = toDate(lifecycle.endsAtIso);
  if (!endsAt) return lifecycle;
  if (now.getTime() < endsAt.getTime()) return lifecycle;

  return {
    ...lifecycle,
    status: "inactive",
    lastEndedAtIso: toIso(endsAt),
    currentBlockStartedAtIso: toIso(endsAt),
    postStopConservativeSessionsRemaining: 0,
  };
}

function isRestartCoolingDown(
  lifecycle: DeloadLifecycle,
  now: Date,
  restartCooldownMs: number,
): boolean {
  const postStopRemaining = lifecycle.postStopConservativeSessionsRemaining ?? 0;
  if (postStopRemaining <= 0) return false;
  const lastEndedAt = toDate(lifecycle.lastEndedAtIso);
  if (!lastEndedAt) return false;
  return now.getTime() - lastEndedAt.getTime() < restartCooldownMs;
}

function startDeload(
  lifecycle: DeloadLifecycle,
  recommendation: DeloadRecommendation,
  now: Date,
  deloadDurationDays: number,
): DeloadLifecycle {
  const endsAt = getDeloadEndDate(now, deloadDurationDays);
  return {
    ...lifecycle,
    status: "active",
    startedAtIso: toIso(now),
    endsAtIso: toIso(endsAt),
    recommendationIssuedAtIso: toIso(now),
    triggerReason: recommendation.reason,
    triggerSnapshot: recommendation.snapshot,
  };
}

export function applyDeloadLifecycleTransition(
  previousLifecycle: DeloadLifecycle | undefined,
  recommendation: DeloadRecommendation,
  options: DeloadTransitionOptions = {},
): DeloadLifecycle {
  const now = options.now ?? new Date();
  const deloadDurationDays = options.deloadDurationDays ?? DEFAULT_DELOAD_DURATION_DAYS;
  const conservativeSessionsAfterManualStop =
    options.conservativeSessionsAfterManualStop ?? DEFAULT_POST_STOP_CONSERVATIVE_SESSIONS;
  const restartCooldownMs = options.restartCooldownMs ?? DEFAULT_RESTART_COOLDOWN_MS;

  let lifecycle = ensureBaseLifecycle(previousLifecycle, now);
  lifecycle = autoEndIfExpired(lifecycle, now);

  if (options.manualStop && lifecycle.status === "active") {
    lifecycle = {
      ...lifecycle,
      status: "inactive",
      lastEndedAtIso: toIso(now),
      currentBlockStartedAtIso: toIso(now),
      postStopConservativeSessionsRemaining: conservativeSessionsAfterManualStop,
    };
  }

  if (
    lifecycle.status === "inactive" &&
    recommendation.shouldDeload &&
    !isRestartCoolingDown(lifecycle, now, restartCooldownMs)
  ) {
    lifecycle = startDeload(lifecycle, recommendation, now, deloadDurationDays);
  }

  if (lifecycle.status === "inactive" && !lifecycle.currentBlockStartedAtIso) {
    lifecycle.currentBlockStartedAtIso = toIso(now);
  }

  return lifecycle;
}

export function getMesocycleWeekFromLifecycle(
  lifecycle: DeloadLifecycle | undefined,
  now: Date = new Date(),
): number {
  if (lifecycle?.status === "active") return 0;

  const blockStart = toDate(lifecycle?.currentBlockStartedAtIso);
  if (!blockStart) return 1;

  const elapsedMs = Math.max(now.getTime() - blockStart.getTime(), 0);
  return Math.floor(elapsedMs / MS_PER_WEEK) + 1;
}

export function getDeloadTimeRemainingMs(
  lifecycle: DeloadLifecycle | undefined,
  now: Date = new Date(),
): number {
  if (lifecycle?.status !== "active") return 0;
  const endsAt = toDate(lifecycle.endsAtIso);
  if (!endsAt) return 0;
  return Math.max(endsAt.getTime() - now.getTime(), 0);
}

export function consumePostStopConservativeSession(
  lifecycle: DeloadLifecycle | undefined,
): DeloadLifecycle | undefined {
  if (!lifecycle) return lifecycle;
  const remaining = lifecycle.postStopConservativeSessionsRemaining ?? 0;
  if (remaining <= 0) return lifecycle;
  return {
    ...lifecycle,
    postStopConservativeSessionsRemaining: remaining - 1,
  };
}
