export type { FatigueTriggerId } from "@/modules/trainingInsights/domain";
export {
  createDeloadPhase,
  DELOAD_DURATION_MS,
  type DeloadPhase,
  type DeloadStatus,
  deloadDaysRemaining,
  deloadProgressPercent,
  getDeloadStatus,
  isDeloadActive,
} from "@/modules/trainingInsights/domain";
