import type { UserProgress } from "@/services/leveling";

export function computeReadinessTheme(readiness: number): {
  color: string;
  glow: string;
  border: string;
} {
  if (readiness < 0.7)
    return { color: "text-blue-400", glow: "bg-blue-400/20", border: "border-blue-400/30" };
  if (readiness < 0.9)
    return { color: "text-cyan-400", glow: "bg-cyan-400/20", border: "border-cyan-400/30" };
  if (readiness < 1.1)
    return { color: "text-primary", glow: "bg-primary/20", border: "border-primary/30" };
  if (readiness < 1.3)
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
