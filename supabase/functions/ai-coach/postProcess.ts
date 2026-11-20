import type {
  CoachActionRequestDto,
  CoachingAdvice,
  DeloadStatus,
  PlannedSession,
  WorkoutPhase,
} from "./schemas.ts";

export function isDuration(reps?: string): boolean {
  if (!reps) return false;
  const lower = reps.toLowerCase();
  return (
    lower.includes("sec") ||
    lower.includes("min") ||
    lower.includes("hr") ||
    lower.includes("time") ||
    lower.includes("hold") ||
    /^[\d\s.,-]+s$/.test(lower)
  );
}

export function parseFirstRep(targetReps?: string): number | undefined {
  if (!targetReps) return undefined;
  const rangeMatch = targetReps.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch?.[2]) return Number.parseInt(rangeMatch[2], 10);
  const singleMatch = targetReps.match(/(\d+)/);
  return singleMatch?.[1] ? Number.parseInt(singleMatch[1], 10) : undefined;
}

export function splitReps(reps?: string): { value: string; unit: string } {
  if (!reps) return { value: "", unit: "" };
  const match = reps.match(/^([\d\s.,-]+)(.*)$/);
  if (match?.[1] && match[1].trim() !== "") {
    return { value: match[1].trim(), unit: (match[2] ?? "").trim() };
  }
  return { value: reps, unit: "" };
}

function upcastLegacyExercise<
  T extends { targetReps?: string; targetDurationSeconds?: number; targetDistanceMeters?: number },
>(ex: T): T {
  if (!ex.targetReps) return ex;
  if (ex.targetDurationSeconds != null || ex.targetDistanceMeters != null) return ex;

  const lower = ex.targetReps.toLowerCase().trim();
  if (/m$/.test(lower) && !lower.includes("min") && !lower.includes("time")) {
    const distance = parseFirstRep(ex.targetReps);
    if (distance !== undefined && distance > 0) {
      return { ...ex, targetDistanceMeters: distance, targetReps: undefined };
    }
  }

  if (isDuration(ex.targetReps)) {
    const parsed = parseFirstRep(ex.targetReps);
    if (parsed !== undefined && parsed > 0) {
      const unit = splitReps(ex.targetReps).unit.toLowerCase();
      const durationSeconds = Math.round(
        unit.includes("hr") ? parsed * 3600 : unit.includes("min") ? parsed * 60 : parsed,
      );
      if (durationSeconds > 0) {
        return { ...ex, targetDurationSeconds: durationSeconds, targetReps: undefined };
      }
    }
  }

  return ex;
}

function clampRestSeconds(
  targetReps: string | number | undefined,
  currentRestSeconds?: number | null,
): number {
  if (targetReps === undefined || targetReps === null) {
    return currentRestSeconds ?? 120;
  }

  const maxRep = Math.max(...(String(targetReps).match(/\d+/g) || []).map(Number), 0);
  if (maxRep <= 0) {
    return currentRestSeconds ?? 120;
  }

  let minRest = 45;
  let maxRest = 300;
  if (maxRep <= 5) {
    minRest = 180;
    maxRest = 300;
  } else if (maxRep <= 15) {
    minRest = 120;
    maxRest = 180;
  } else if (maxRep <= 20) {
    minRest = 45;
    maxRest = 90;
  } else {
    minRest = 15;
    maxRest = 45;
  }

  if (typeof currentRestSeconds === "number") {
    if (currentRestSeconds < minRest) return minRest;
    if (currentRestSeconds > maxRest) return maxRest;
    return currentRestSeconds;
  }

  return minRest;
}

function normalizeExerciseParameters<
  T extends {
    exerciseName: string;
    targetSets: number;
    targetReps?: string;
    targetDurationSeconds?: number;
    targetDistanceMeters?: number;
    targetRpe?: number;
    restSeconds?: number;
    isMetabolicProtocol?: boolean;
  },
>(rawEx: T, deloadStatus: DeloadStatus): T {
  const ex = upcastLegacyExercise({ ...rawEx });

  let targetRpe = ex.targetRpe;
  if (targetRpe != null) {
    targetRpe = Math.max(6, Math.min(10, Math.round(targetRpe * 2) / 2));
  } else if (ex.targetReps && !ex.targetDurationSeconds && !ex.targetDistanceMeters) {
    targetRpe = deloadStatus === "active" ? 6.5 : 8.5;
  }

  let restSeconds = ex.restSeconds;
  if (ex.targetReps && !ex.isMetabolicProtocol) {
    restSeconds = clampRestSeconds(ex.targetReps, restSeconds);
  }

  return {
    ...ex,
    targetRpe,
    restSeconds,
  };
}

function sortSessionsChronologically(sessions: PlannedSession[]): PlannedSession[] {
  const toIsoDay = (d: number) => (d === 0 ? 7 : d);
  return [...sessions].sort(
    (a, b) => a.weekNumber - b.weekNumber || toIsoDay(a.dayOfWeek) - toIsoDay(b.dayOfWeek),
  );
}

function normalizePlanSessions(sessions: PlannedSession[]): PlannedSession[] {
  const usedDaysByWeek = new Map<number, Set<number>>();
  const normalized: PlannedSession[] = [];

  for (const session of sessions) {
    let usedDays = usedDaysByWeek.get(session.weekNumber);
    if (!usedDays) {
      usedDays = new Set<number>();
      usedDaysByWeek.set(session.weekNumber, usedDays);
    }
    if (usedDays.size >= 7) continue;

    let dayOfWeek = ((session.dayOfWeek % 7) + 7) % 7;
    for (let offset = 0; offset < 7 && usedDays.has(dayOfWeek); offset++) {
      dayOfWeek = (dayOfWeek + 1) % 7;
    }
    usedDays.add(dayOfWeek);

    normalized.push(dayOfWeek === session.dayOfWeek ? session : { ...session, dayOfWeek });
  }

  return sortSessionsChronologically(normalized);
}

function isStructuralReplacement(
  cycleWeeks: number,
  normalizedSessions: PlannedSession[],
  activePlan?: CoachActionRequestDto["activePlan"],
): boolean {
  if (!activePlan) return false;
  if (cycleWeeks !== activePlan.cycleWeeks) return true;
  if (normalizedSessions.length !== activePlan.sessions.length) return true;

  const activeKeys = new Set(activePlan.sessions.map((s) => `W${s.weekNumber}-D${s.dayOfWeek}`));
  return normalizedSessions.some((s) => !activeKeys.has(`W${s.weekNumber}-D${s.dayOfWeek}`));
}

function backfillRecommendedWorkout(
  rawPlan: NonNullable<CoachingAdvice["trainingPlan"]>,
  completedSessionKeys: ReadonlySet<string>,
  activePlan?: CoachActionRequestDto["activePlan"],
) {
  if (rawPlan.sessions.length === 0) return undefined;

  const validCycleWeeks = Math.max(1, Math.min(4, rawPlan.cycleWeeks || 2));
  const sorted = normalizePlanSessions(rawPlan.sessions);
  const effectiveCompletedKeys = isStructuralReplacement(validCycleWeeks, sorted, activePlan)
    ? new Set<string>()
    : completedSessionKeys;

  const matchingSession =
    sorted.find((s) => !effectiveCompletedKeys.has(`W${s.weekNumber}-D${s.dayOfWeek}`)) ??
    sorted[0];

  if (!matchingSession || matchingSession.exercises.length === 0) return undefined;
  return matchingSession.exercises.map((ex) => ({ ...ex }));
}

export function postProcessCoachingAdvice(
  parsedCoachingAdvice: CoachingAdvice,
  phase: WorkoutPhase,
  deloadStatus: DeloadStatus,
  completedSessionKeys: ReadonlySet<string> = new Set(),
  activePlan?: CoachActionRequestDto["activePlan"],
): CoachingAdvice {
  const cleaned: CoachingAdvice = structuredClone(parsedCoachingAdvice);

  if (phase === "post-workout") {
    delete cleaned.recommendedWorkout;
  }

  if (deloadStatus === "active") {
    delete cleaned.startDeload;
  }

  if (Array.isArray(cleaned.recommendedWorkout)) {
    cleaned.recommendedWorkout = cleaned.recommendedWorkout
      .filter((ex): ex is NonNullable<typeof ex> => typeof ex === "object" && ex !== null)
      .map((ex) => normalizeExerciseParameters(ex, deloadStatus));
  }

  if (cleaned.trainingPlan?.sessions) {
    cleaned.trainingPlan.sessions = normalizePlanSessions(cleaned.trainingPlan.sessions).map(
      (session) => ({
        ...session,
        exercises: session.exercises.map((ex) => normalizeExerciseParameters(ex, deloadStatus)),
      }),
    );

    if (phase === "planning" && cleaned.recommendedWorkout === undefined) {
      cleaned.recommendedWorkout = backfillRecommendedWorkout(
        cleaned.trainingPlan,
        completedSessionKeys,
        activePlan,
      );
    }
  }

  return cleaned;
}
