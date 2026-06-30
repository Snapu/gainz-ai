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
    return new TrainingPlan(createdAt, validCycleWeeks, sessions);
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
    return this.sessions.every((s) => TrainingPlan.isCompleted(s, completedKeys));
  }

  /**
   * Determines if a session is satisfied by the given logs by checking if at least 50%
   * of the planned exercises (by canonical name and target sets) were completed.
   */
  public isSessionSatisfiedByLogs(
    session: PlannedSession,
    logs: { exerciseName: string }[],
    normalizeFn: (name: string) => string = (name) => name,
    getPrimaryMuscleFn?: (name: string) => string | undefined,
  ): boolean {
    if (session.exercises.length === 0) return true;

    if (getPrimaryMuscleFn) {
      // 1. Group planned volume by primary muscle
      const plannedVolume = new Map<string, number>();
      for (const ex of session.exercises) {
        const muscle = getPrimaryMuscleFn(ex.exerciseName);
        if (muscle) {
          const current = plannedVolume.get(muscle) || 0;
          plannedVolume.set(muscle, current + ex.targetSets);
        }
      }

      // If we couldn't resolve any muscles, fallback to name matching
      if (plannedVolume.size > 0) {
        // 2. Group logged volume by primary muscle
        const loggedVolume = new Map<string, number>();
        for (const log of logs) {
          const muscle = getPrimaryMuscleFn(log.exerciseName);
          if (muscle) {
            const current = loggedVolume.get(muscle) || 0;
            loggedVolume.set(muscle, current + 1);
          }
        }

        // 3. Evaluate by total muscle volume satisfied (capped per muscle)
        let totalPlannedSets = 0;
        let totalSatisfiedSets = 0;
        for (const [muscle, targetSets] of plannedVolume.entries()) {
          totalPlannedSets += targetSets;
          const doneSets = loggedVolume.get(muscle) || 0;
          totalSatisfiedSets += Math.min(doneSets, targetSets);
        }

        if (totalPlannedSets === 0) return true;
        return totalSatisfiedSets / totalPlannedSets >= 0.5;
      }
    }

    // Fallback: evaluate by canonical name
    const completedSetsMap = new Map<string, number>();
    for (const log of logs) {
      const normalizedName = normalizeFn(log.exerciseName);
      const count = completedSetsMap.get(normalizedName) || 0;
      completedSetsMap.set(normalizedName, count + 1);
    }

    let completedExercisesCount = 0;
    for (const ex of session.exercises) {
      const normalizedName = normalizeFn(ex.exerciseName);
      const doneSets = completedSetsMap.get(normalizedName) || 0;
      if (doneSets >= ex.targetSets) {
        completedExercisesCount++;
      }
    }

    return completedExercisesCount / session.exercises.length >= 0.5;
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
    return Math.floor((currentDay - createdDay) / (24 * 60 * 60 * 1000));
  }

  /**
   * Determines if a log date falls into the same cycle as the current date.
   */
  public isInCurrentCycle(logDate: Date, currentDate: Date = new Date()): boolean {
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
