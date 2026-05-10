export interface UserProgress {
  level: number;
  totalXP: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  readiness: number;
  title: string;
  description: string;
  avatar: string;
  totalWorkoutDays: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  journeyDurationWeeks: number;
  firstSessionDate: Date;
  xpBreakdown: {
    discipline: number;
    intensity: number;
    progression: number;
    mastery: number;
  };
}
