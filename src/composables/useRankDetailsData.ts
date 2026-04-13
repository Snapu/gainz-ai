import type { UserProgress } from "@/services/leveling";
import type { TrainingInsights } from "@/services/trainingScience";

export function consistencyLabel(momentum: number): string {
  if (momentum < 0.7) return "Developing Foundation";
  if (momentum < 0.9) return "Building Rhythm";
  if (momentum < 1.1) return "Solid Consistency";
  if (momentum < 1.3) return "Elite Discipline";
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
    return { label: "Deload", color: "text-orange-500", bg: "bg-orange-500/10" };
  }

  const trend = fatigue.weeklyTotalSets;
  const last = trend[trend.length - 1] ?? 0;
  const previous = trend[trend.length - 2] ?? 0;

  // Below Minimum Volume (MV) for the whole body
  // Trailing 14-day global volume sum. MEV for a full body is roughly 12 sets/week.
  // If sum is < 24 sets over 14 days, systemic tension is fundamentally lost.
  if (last + previous < 24) {
    return { label: "Inactive", color: "text-muted-foreground", bg: "bg-muted-foreground/10" };
  }

  // Active progression
  if (trend.length >= 2 && last > previous && last >= 10) {
    return { label: "Build", color: "text-primary", bg: "bg-primary/10" };
  }

  // Baseline maintenance
  return { label: "Maintain", color: "text-cyan-400", bg: "bg-cyan-400/10" };
}

export function computeMomentumTheme(momentum: number): {
  color: string;
  glow: string;
  border: string;
} {
  if (momentum < 0.7)
    return { color: "text-blue-400", glow: "bg-blue-400/20", border: "border-blue-400/30" };
  if (momentum < 0.9)
    return { color: "text-cyan-400", glow: "bg-cyan-400/20", border: "border-cyan-400/30" };
  if (momentum < 1.1)
    return { color: "text-primary", glow: "bg-primary/20", border: "border-primary/30" };
  if (momentum < 1.3)
    return {
      color: "text-emerald-400",
      glow: "bg-emerald-400/20",
      border: "border-emerald-400/30",
    };
  return {
    color: "text-fuchsia-400",
    glow: "bg-fuchsia-400/20",
    border: "border-fuchsia-400/30",
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
      color: "bg-discipline",
    },
    {
      label: "Intensity",
      value: intensity,
      percent: (intensity / total) * 100,
      color: "bg-intensity",
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
      color: "bg-mastery",
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
