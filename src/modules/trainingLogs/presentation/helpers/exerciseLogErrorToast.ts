import { t } from "@/shared/presentation/i18n";
import type { ExerciseLogMutationError } from "../stores/exerciseLogsStore";

type MutationErrorToastPayload = {
  id?: string;
  title: string;
  description: string;
  variant: "destructive";
};

export function buildExerciseLogErrorToast(
  action: "save" | "delete",
  error: ExerciseLogMutationError,
): MutationErrorToastPayload {
  const descriptions: Record<ExerciseLogMutationError, string> = {
    "validation-failed":
      action === "save" ? t("logSheet.validationSaveFailed") : t("logSheet.validationDeleteFailed"),
    "not-found": t("logSheet.setNotFound"),
    "auth-failed": t("auth.sessionExpiredDesc"),
  };

  return {
    id: error === "auth-failed" ? "auth-session-expired" : undefined,
    title: action === "save" ? t("logSheet.saveErrorTitle") : t("logSheet.deleteErrorTitle"),
    description: descriptions[error],
    variant: "destructive",
  };
}
