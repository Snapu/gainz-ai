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

  public isFullyCompleted(completedKeys: ReadonlySet<string>): boolean {
    return this.sessions.every((s) =>
      completedKeys.has(TrainingPlan.sessionKey(s.weekNumber, s.dayOfWeek)),
    );
  }

  /**
   * Calculates the current cycle week (1-indexed) based on the current date.
   */
  public getCurrentWeekNumber(currentDate: Date = new Date()): number {
    if (!this.createdAt) return 1;

    const created = new Date(this.createdAt);
    const diffMs = currentDate.getTime() - created.getTime();

    // If the plan is somehow created in the future, default to week 1 to avoid negative values
    if (diffMs < 0) return 1;

    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return (diffWeeks % this.cycleWeeks) + 1;
  }

  /**
   * Finds the appropriate session for a given day and week number.
   * Prioritizes an exact match for day AND week, then falls back to a day-only match.
   */
  public getPlannedSessionForDay(
    dayOfWeek: number,
    weekNumber: number,
  ): PlannedSession | undefined {
    return (
      this.sessions.find((s) => s.dayOfWeek === dayOfWeek && s.weekNumber === weekNumber) ??
      this.sessions.find((s) => s.dayOfWeek === dayOfWeek)
    );
  }
}
