export type EntitlementSource = "subscription" | "invite_grant" | "free_allowance" | "none";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type BillingError =
  | "payment-required"
  | "invite-invalid"
  | "invite-exhausted"
  | "invite-expired"
  | "invite-already-redeemed"
  | "rate-limit-exceeded"
  | "billing-unavailable"
  | "unauthorized";

export interface Entitlement {
  source: EntitlementSource;
  canUseCoach: boolean;
  canUseClassify: boolean;
  evaluatedAt: string;
  freeAllowance: {
    coachUsed: number;
    coachLimit: number;
    classifyUsed: number;
    classifyLimit: number;
  };
  subscription: {
    status: SubscriptionStatus;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
  } | null;
  inviteGrant: {
    expiresAt: string | null;
  } | null;
  hasCustomerPortal: boolean;
}

const DEFAULT_FREE_COACH_LIMIT = 30;

export function canUseCoach(entitlement: Entitlement | null): boolean {
  return entitlement === null ? true : entitlement.canUseCoach;
}

export function canUseClassify(entitlement: Entitlement | null): boolean {
  return entitlement === null ? true : entitlement.canUseClassify;
}

export function isFreeAllowance(entitlement: Entitlement | null): boolean {
  return entitlement?.source === "free_allowance";
}

export function isInviteGrant(entitlement: Entitlement | null): boolean {
  return entitlement?.source === "invite_grant";
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function getRemainingFreeCoachCount(entitlement: Entitlement | null): number {
  if (!entitlement) return DEFAULT_FREE_COACH_LIMIT;
  return Math.max(0, entitlement.freeAllowance.coachLimit - entitlement.freeAllowance.coachUsed);
}

export function isInPastDueGrace(entitlement: Entitlement | null, nowMs = Date.now()): boolean {
  if (entitlement?.subscription?.status !== "past_due") return false;
  const graceEndsAt = entitlement.subscription.graceEndsAt;
  if (!graceEndsAt) return false;
  const deadlineMs = Date.parse(graceEndsAt);
  return Number.isFinite(deadlineMs) && deadlineMs > nowMs;
}

export function isNewerOrEqualSnapshot(
  incoming: Entitlement,
  current: Entitlement | null,
): boolean {
  if (!current) return true;
  const incomingMs = Date.parse(incoming.evaluatedAt);
  const currentMs = Date.parse(current.evaluatedAt);
  if (!Number.isFinite(incomingMs) || !Number.isFinite(currentMs)) return true;
  return incomingMs >= currentMs;
}
