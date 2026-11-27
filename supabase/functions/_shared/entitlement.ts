export type EntitlementSource = "subscription" | "invite_grant" | "free_allowance" | "none";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface EntitlementRow {
  entitlement_source: EntitlementSource;
  can_use_coach: boolean;
  can_use_classify: boolean;
  evaluated_at: string;
  free_coach_used: number;
  free_coach_limit: number;
  free_classify_used: number;
  free_classify_limit: number;
  subscription_status?: SubscriptionStatus | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
  grace_ends_at?: string | null;
  invite_expires_at?: string | null;
  has_customer_portal?: boolean | null;
}

export interface EntitlementPayload {
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

export function formatEntitlementPayload(row: EntitlementRow): EntitlementPayload {
  const subscription = row.subscription_status
    ? {
        status: row.subscription_status,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        currentPeriodEnd: row.current_period_end ?? null,
        graceEndsAt: row.grace_ends_at ?? null,
      }
    : null;

  const inviteGrant =
    row.entitlement_source === "invite_grant" || row.invite_expires_at != null
      ? {
          expiresAt: row.invite_expires_at ?? null,
        }
      : null;

  return {
    source: row.entitlement_source,
    canUseCoach: row.can_use_coach,
    canUseClassify: row.can_use_classify,
    evaluatedAt: row.evaluated_at,
    freeAllowance: {
      coachUsed: row.free_coach_used,
      coachLimit: row.free_coach_limit,
      classifyUsed: row.free_classify_used,
      classifyLimit: row.free_classify_limit,
    },
    subscription,
    inviteGrant,
    hasCustomerPortal: Boolean(row.has_customer_portal),
  };
}
