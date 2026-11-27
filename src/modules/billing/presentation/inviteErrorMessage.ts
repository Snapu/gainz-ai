import { t } from "@/shared/presentation/i18n";
import type { BillingError } from "../domain";

const INVITE_ERROR_KEYS: Record<BillingError, string> = {
  "invite-invalid": "billing.inviteErrors.invalid",
  "invite-exhausted": "billing.inviteErrors.exhausted",
  "invite-expired": "billing.inviteErrors.expired",
  "invite-already-redeemed": "billing.inviteErrors.alreadyRedeemed",
  "rate-limit-exceeded": "billing.inviteErrors.rateLimited",
  "payment-required": "billing.inviteErrors.unavailable",
  "billing-unavailable": "billing.inviteErrors.unavailable",
  unauthorized: "billing.inviteErrors.unavailable",
};

export function resolveInviteErrorMessage(error: BillingError): string {
  return t(INVITE_ERROR_KEYS[error] ?? "billing.inviteErrors.unavailable");
}
