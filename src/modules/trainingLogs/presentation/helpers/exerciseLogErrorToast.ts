import type { ExerciseLogMutationError } from "../stores/exerciseLogsStore";

type MutationErrorToastPayload = {
  id?: string;
  title: string;
  description: string;
  variant: "destructive";
};

const VALIDATION_FAILED_MESSAGES = {
  save: "Google Sheets rejected this set. Check your entries or sheet permissions.",
  delete: "Google Sheets rejected this change. Check sheet permissions.",
} as const;

export function buildExerciseLogErrorToast(
  action: "save" | "delete",
  error: ExerciseLogMutationError,
): MutationErrorToastPayload {
  const descriptions: Record<ExerciseLogMutationError, string> = {
    "validation-failed": VALIDATION_FAILED_MESSAGES[action],
    "not-found": "This set no longer exists in Google Sheets.",
    "auth-failed": "Authentication expired. Please sign in again.",
  };

  return {
    id: error === "auth-failed" ? "auth-session-expired" : undefined,
    title: action === "save" ? "Could Not Save Set" : "Could Not Delete Set",
    description: descriptions[error],
    variant: "destructive",
  };
}
