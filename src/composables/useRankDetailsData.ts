import type { UserProgress } from "@/services/leveling";
import type { TrainingInsights } from "@/services/trainingScience";

export function consistencyLabel(momentum: number): string {
  if (momentum < 1.2) return "Foundation Building";
  if (momentum < 1.35) return "Establishing Rhythm";
  if (momentum < 1.55) return "Solid Consistency";
  if (momentum < 1.75) return "Peak Discipline";
  if (momentum < 1.95) return "Elite Momentum";
  return "Unstoppable Force";
}

export function formatVolume(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)} tons`;
  }
  return `${kg} kg`;
}

export function computeTrainingPhase(insights: TrainingInsights): {
  label: string;
  color: string;
  bg: string;
} {
  const { fatigue } = insights;

  if (fatigue.shouldDeload) {
    return { label: "DELOAD PHASE", color: "text-orange-400", bg: "bg-orange-400/10" };
  }

  const trend = fatigue.weeklyTotalSets;
  const last = trend[trend.length - 1] ?? 0;
  const previous = trend[trend.length - 2] ?? 0;
  if (trend.length >= 2 && last > previous) {
    return { label: "ACCUMULATION", color: "text-primary", bg: "bg-primary/10" };
  }

  return { label: "STABILIZATION", color: "text-blue-400", bg: "bg-blue-400/10" };
}

export function computeMomentumEffect(momentum: number): {
  glowClass: boolean;
  animationClass: boolean;
} {
  return {
    glowClass: momentum >= 1.75,
    animationClass: momentum >= 1.95,
  };
}

export function computeXpPillars(
  xpBreakdown: UserProgress["xpBreakdown"],
): Array<{ label: string; value: number; percent: number; color: string }> {
  const { discipline, intensity, progression, mastery } = xpBreakdown;
  const total = discipline + intensity + progression + mastery || 1;

  return [
    {
      label: "Discipline",
      value: discipline,
      percent: (discipline / total) * 100,
      color: "bg-blue-500",
    },
    {
      label: "Intensity",
      value: intensity,
      percent: (intensity / total) * 100,
      color: "bg-red-500",
    },
    {
      label: "Progression",
      value: progression,
      percent: (progression / total) * 100,
      color: "bg-primary",
    },
    {
      label: "Mastery",
      value: mastery,
      percent: (mastery / total) * 100,
      color: "bg-fuchsia-500",
    },
  ];
}

export function formatJourneyDuration(weeks: number): string {
  if (weeks >= 52) {
    const years = Math.floor(weeks / 52);
    return `${years} ${years === 1 ? "year" : "years"}`;
  }

  if (weeks >= 4) {
    const months = Math.floor(weeks / 4);
    return `${months} ${months === 1 ? "month" : "months"}`;
  }

  return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}
