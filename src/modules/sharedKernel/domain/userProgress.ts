export type RankTierId =
  | "foundation"
  | "consistent"
  | "committed"
  | "disciplined"
  | "structured"
  | "resilient"
  | "dedicated"
  | "methodical"
  | "seasoned"
  | "proficient"
  | "advanced"
  | "veteran"
  | "specialist"
  | "performance"
  | "highCapacity"
  | "master"
  | "elite"
  | "pinnacle";

export interface UserProgress {
  level: number;
  totalXP: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  readiness: number;
  rankId: RankTierId;
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
