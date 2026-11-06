import { exerciseNameKey } from "@/modules/sharedKernel/domain";
import type { PlannedSession } from "./types";
import { upcastLegacyExercise } from "./upcaster";

/**
 * Domain Aggregate Root: TrainingPlan
 * Encapsulates validation and week calculation for a generated training plan.
 */
export class TrainingPlan {
  public readonly createdAt: string;
  public readonly cycleWeeks: number;
  public readonly sessions: PlannedSession[];

  private constructor(createdAt: string, cycleWeeks: number, sessions: PlannedSession[]) {
    this.createdAt = createdAt;
    this.cycleWeeks = cycleWeeks;
    this.sessions = sessions;
  }

  /**
   * Factory method to create a TrainingPlan. Ensures business rules are met.
   */
  public static create(
    createdAt: string,
    cycleWeeks: number,
    sessions: PlannedSession[],
  ): TrainingPlan {
    const validCycleWeeks = Math.max(1, Math.min(4, cycleWeeks || 2));
    const usedDaysByWeek = new Map<number, Set<number>>();
    const normalizedSessions: PlannedSession[] = [];

    for (const session of sessions) {
      let usedDays = usedDaysByWeek.get(session.weekNumber);
      if (!usedDays) {
        usedDays = new Set<number>();
        usedDaysByWeek.set(session.weekNumber, usedDays);
      }

      if (usedDays.size >= 7) {
        continue;
      }

      let dayOfWeek = ((session.dayOfWeek % 7) + 7) % 7;
      for (let offset = 0; offset < 7 && usedDays.has(dayOfWeek); offset++) {
        dayOfWeek = (dayOfWeek + 1) % 7;
      }
      usedDays.add(dayOfWeek);

      normalizedSessions.push(
        dayOfWeek === session.dayOfWeek ? session : { ...session, dayOfWeek },
      );
    }

    const toIsoDay = (d: number) => (d === 0 ? 7 : d);
    normalizedSessions.sort(
      (a, b) => a.weekNumber - b.weekNumber || toIsoDay(a.dayOfWeek) - toIsoDay(b.dayOfWeek),
    );

    return new TrainingPlan(createdAt, validCycleWeeks, normalizedSessions);
  }

  /**
   * Reconstitutes a TrainingPlan from storage without running creation rules again.
   */
  public static reconstitute(data: {
    createdAt: string;
    cycleWeeks: number;
    sessions: PlannedSession[];
  }): TrainingPlan {
    // TODO(TechDebt): Remove `upcastLegacyExercise` mapping once all active plans have been migrated
    // to the new `targetDurationSeconds`/`targetDistanceMeters` schema in LocalStorage.
    const upcastedSessions = data.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map(upcastLegacyExercise),
    }));
    return new TrainingPlan(data.createdAt, data.cycleWeeks, upcastedSessions);
  }

  /**
   * Generates a unique string identifier for a session based on its week and day number.
   */
  public static sessionKey(weekNumber: number, dayOfWeek: number): string {
    return `W${weekNumber}-D${dayOfWeek}`;
  }

  private static isCompleted(s: PlannedSession, completedKeys: ReadonlySet<string>): boolean {
    return completedKeys.has(TrainingPlan.sessionKey(s.weekNumber, s.dayOfWeek));
  }

  public isFullyCompleted(completedKeys: ReadonlySet<string>): boolean {
    return (
      this.sessions.length > 0 &&
      this.sessions.every((s) => TrainingPlan.isCompleted(s, completedKeys))
    );
  }

  /**
   * Determines if this plan represents a structural replacement
   * (different cycle weeks, session count, or session schedule) rather
   * than an in-place exercise adjustment of the current cycle.
   */
  public isStructuralReplacementFor(other: TrainingPlan): boolean {
    if (this.cycleWeeks !== other.cycleWeeks) return true;
    if (this.sessions.length !== other.sessions.length) return true;

    const otherKeys = new Set(
      other.sessions.map((s) => TrainingPlan.sessionKey(s.weekNumber, s.dayOfWeek)),
    );
    return this.sessions.some(
      (s) => !otherKeys.has(TrainingPlan.sessionKey(s.weekNumber, s.dayOfWeek)),
    );
  }

  private static startOfDayMs(d: Date | string): number {
    const date = new Date(d);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  /**
   * Calculates the difference in days between a given date and the plan's creation date.
   */
  private getDiffDays(currentDate: Date): number {
    if (!this.createdAt) return -1;
    const currentDay = TrainingPlan.startOfDayMs(currentDate);
    const createdDay = TrainingPlan.startOfDayMs(this.createdAt);
    return Math.round((currentDay - createdDay) / (24 * 60 * 60 * 1000));
  }

  /**
   * Determines if a log date falls into the same cycle as the current date.
   */
  public isInCurrentCycle(logDate: Date, currentDate: Date = new Date()): boolean {
    if (!this.createdAt) return false;
    const createdMs = new Date(this.createdAt).getTime();
    if (!Number.isNaN(createdMs) && logDate.getTime() < createdMs) return false;

    const logDiffDays = this.getDiffDays(logDate);
    // If the log is from before the plan started, it's never in the current cycle
    if (logDiffDays < 0) return false;

    const currentDiffDays = this.getDiffDays(currentDate);
    const currentCycleNumber =
      currentDiffDays >= 0 ? Math.floor(currentDiffDays / (this.cycleWeeks * 7)) : 0;
    const logCycleNumber = Math.floor(logDiffDays / (this.cycleWeeks * 7));

    return logCycleNumber === currentCycleNumber;
  }

  /**
   * Calculates the current cycle week (1-indexed) based on the current date.
   */
  public getCurrentWeekNumber(currentDate: Date = new Date()): number {
    const diffDays = this.getDiffDays(currentDate);
    if (diffDays < 0) return 1;

    const diffWeeks = Math.floor(diffDays / 7);
    return (diffWeeks % this.cycleWeeks) + 1;
  }

  /**
   * Finds the first uncompleted session chronologically in the plan.
   * This is used to determine the next overall milestone in the mesocycle (e.g., for highlighting the next session).
   */
  public getNextUncompletedSession(completedKeys: ReadonlySet<string>): PlannedSession | undefined {
    return this.sessions.find((s) => !TrainingPlan.isCompleted(s, completedKeys));
  }

  /**
   * Resolves the target planned session for today:
   * - If today's logs already satisfy a completed session (checked newest-first), keeps that session active for the rest of today.
   * - Otherwise, returns the next uncompleted session in sequence.
   */
  public getTodayTargetSession(
    completedKeys: ReadonlySet<string>,
    todaysLogs: { exerciseName: string }[] = [],
    normalizeFn: (name: string) => string = exerciseNameKey,
    getPrimaryMuscleFn?: (name: string) => string | undefined,
  ): PlannedSession | undefined {
    if (todaysLogs.length > 0) {
      const completedReversed = [...this.sessions]
        .reverse()
        .filter((s) => TrainingPlan.isCompleted(s, completedKeys));

      const exactTodayMatch = completedReversed.find((s) =>
        isSessionSatisfiedByExactExercises(s, todaysLogs, normalizeFn),
      );
      if (exactTodayMatch) return exactTodayMatch;

      if (getPrimaryMuscleFn) {
        const muscleTodayMatch = completedReversed.find((s) =>
          isSessionSatisfiedByMuscleVolume(s, todaysLogs, normalizeFn, getPrimaryMuscleFn),
        );
        if (muscleTodayMatch) return muscleTodayMatch;
      }
    }

    return this.getNextUncompletedSession(completedKeys);
  }

  /**
   * Resolves which uncompleted session in the plan is satisfied by a single day's logs.
   * Prioritizes exact exercise matches before falling back to primary muscle volume,
   * and prioritizes the next sequential session before weekday-matched or remaining sessions.
   */
  public findSatisfiedSession(
    date: Date,
    dayLogs: { exerciseName: string }[],
    completedKeys: ReadonlySet<string>,
    normalizeFn: (name: string) => string = exerciseNameKey,
    getPrimaryMuscleFn?: (name: string) => string | undefined,
  ): PlannedSession | undefined {
    const weekNum = this.getCurrentWeekNumber(date);
    const dayOfWeek = date.getDay();

    const orderedCandidates: PlannedSession[] = [];
    const seenKeys = new Set<string>();

    const addCandidate = (candidate: PlannedSession | undefined) => {
      if (!candidate) return;
      const key = TrainingPlan.sessionKey(candidate.weekNumber, candidate.dayOfWeek);
      if (completedKeys.has(key) || seenKeys.has(key)) return;
      seenKeys.add(key);
      orderedCandidates.push(candidate);
    };

    addCandidate(this.getNextUncompletedSession(completedKeys));
    addCandidate(this.getPlannedSessionForDay(dayOfWeek, weekNum));
    for (const session of this.sessions) {
      addCandidate(session);
    }

    // Pass 1: Exact exercise match
    const exactMatch = orderedCandidates.find((s) =>
      isSessionSatisfiedByExactExercises(s, dayLogs, normalizeFn),
    );
    if (exactMatch) return exactMatch;

    // Pass 2: Muscle volume fallback (when exercise substitutions occurred)
    if (getPrimaryMuscleFn) {
      return orderedCandidates.find((s) =>
        isSessionSatisfiedByMuscleVolume(s, dayLogs, normalizeFn, getPrimaryMuscleFn),
      );
    }

    return undefined;
  }

  /**
   * Determines whether a prescribed workout list matches a session that was already completed
   * prior to the current target session (e.g. from a pre-sync startup race condition).
   */
  public isWorkoutFromCompletedSession(
    workout: readonly { exerciseName: string }[],
    completedKeys: ReadonlySet<string>,
    targetSession?: PlannedSession,
    normalizeFn: (name: string) => string = exerciseNameKey,
  ): boolean {
    if (workout.length === 0 || completedKeys.size === 0) return false;
    const activeTarget = targetSession ?? this.getNextUncompletedSession(completedKeys);
    if (!activeTarget) return false;

    const workoutNames = workout.map((ex) => normalizeFn(ex.exerciseName));
    const overlapRatio = (session: PlannedSession): number => {
      if (session.exercises.length === 0) return 0;
      const sessionNames = new Set(session.exercises.map((ex) => normalizeFn(ex.exerciseName)));
      const matches = workoutNames.filter((name) => sessionNames.has(name)).length;
      return matches / workoutNames.length;
    };

    if (overlapRatio(activeTarget) >= 0.5) return false;

    const targetKey = TrainingPlan.sessionKey(activeTarget.weekNumber, activeTarget.dayOfWeek);
    return this.sessions.some((s) => {
      const key = TrainingPlan.sessionKey(s.weekNumber, s.dayOfWeek);
      return key !== targetKey && completedKeys.has(key) && overlapRatio(s) >= 0.5;
    });
  }

  /**
   * Finds the exact planned session for a given day and week, regardless of completion status.
   * This ensures the calendar representation (what is scheduled for today) remains stable.
   */
  public getPlannedSessionForDay(
    dayOfWeek: number,
    weekNumber: number,
  ): PlannedSession | undefined {
    // 1. Exact match for today
    const exactMatch = this.sessions.find(
      (s) => s.dayOfWeek === dayOfWeek && s.weekNumber === weekNumber,
    );
    if (exactMatch) return exactMatch;

    // 2. Fallback: match by day only
    return this.sessions.find((s) => s.dayOfWeek === dayOfWeek);
  }
}

function computeSessionVolumeKey(
  exerciseName: string,
  normalizeFn: (name: string) => string,
  getPrimaryMuscleFn: (name: string) => string | undefined,
): string {
  const muscle = getPrimaryMuscleFn(exerciseName);
  return muscle ? `muscle:${muscle}` : `name:${normalizeFn(exerciseName)}`;
}

function isSessionSatisfiedByMuscleVolume(
  session: PlannedSession,
  logs: { exerciseName: string }[],
  normalizeFn: (name: string) => string,
  getPrimaryMuscleFn: (name: string) => string | undefined,
): boolean {
  const plannedVolume = new Map<string, number>();
  for (const ex of session.exercises) {
    const key = computeSessionVolumeKey(ex.exerciseName, normalizeFn, getPrimaryMuscleFn);
    plannedVolume.set(key, (plannedVolume.get(key) ?? 0) + ex.targetSets);
  }

  if (plannedVolume.size === 0) return true;

  const loggedVolume = new Map<string, number>();
  for (const log of logs) {
    const key = computeSessionVolumeKey(log.exerciseName, normalizeFn, getPrimaryMuscleFn);
    loggedVolume.set(key, (loggedVolume.get(key) ?? 0) + 1);
  }

  let totalPlannedSets = 0;
  let totalSatisfiedSets = 0;
  for (const [key, targetSets] of plannedVolume.entries()) {
    totalPlannedSets += targetSets;
    const doneSets = loggedVolume.get(key) ?? 0;
    totalSatisfiedSets += Math.min(doneSets, targetSets);
  }

  if (totalPlannedSets === 0) return true;
  return totalSatisfiedSets / totalPlannedSets >= 0.5;
}

function isSessionSatisfiedByExactExercises(
  session: PlannedSession,
  logs: { exerciseName: string }[],
  normalizeFn: (name: string) => string,
): boolean {
  const completedSetsMap = new Map<string, number>();
  for (const log of logs) {
    const normalizedName = normalizeFn(log.exerciseName);
    completedSetsMap.set(normalizedName, (completedSetsMap.get(normalizedName) ?? 0) + 1);
  }

  let completedExercisesCount = 0;
  for (const ex of session.exercises) {
    const normalizedName = normalizeFn(ex.exerciseName);
    const doneSets = completedSetsMap.get(normalizedName) ?? 0;
    if (doneSets >= ex.targetSets) {
      completedExercisesCount++;
    }
  }

  return completedExercisesCount / session.exercises.length >= 0.5;
}
