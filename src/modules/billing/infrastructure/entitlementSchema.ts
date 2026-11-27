import { z } from "zod";
import type { Entitlement } from "../domain";

export const entitlementSchema: z.ZodType<Entitlement> = z.object({
  source: z.enum(["subscription", "invite_grant", "free_allowance", "none"]),
  canUseCoach: z.boolean(),
  canUseClassify: z.boolean(),
  evaluatedAt: z.string().min(1),
  freeAllowance: z.object({
    coachUsed: z.number().int().nonnegative(),
    coachLimit: z.number().int().positive(),
    classifyUsed: z.number().int().nonnegative(),
    classifyLimit: z.number().int().positive(),
  }),
  subscription: z
    .object({
      status: z.enum(["active", "trialing", "past_due", "canceled", "unpaid", "paused"]),
      cancelAtPeriodEnd: z.boolean(),
      currentPeriodEnd: z.string().nullable(),
      graceEndsAt: z.string().nullable(),
    })
    .nullable(),
  inviteGrant: z
    .object({
      expiresAt: z.string().nullable(),
    })
    .nullable(),
  hasCustomerPortal: z.boolean(),
});

export const billingStatusResponseSchema = z.object({
  entitlement: entitlementSchema,
});

export function parseEntitlement(value: unknown): Entitlement | null {
  const parsed = entitlementSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
