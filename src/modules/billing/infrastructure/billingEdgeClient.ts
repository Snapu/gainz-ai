import { ResultAsync } from "neverthrow";
import { z } from "zod";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/modules/platform/infrastructure";
import type { BillingGateway, CheckoutRedirectResult, PortalRedirectResult } from "../application";
import type { BillingError, Entitlement } from "../domain";
import { billingStatusResponseSchema } from "./entitlementSchema";

const BILLING_REQUEST_TIMEOUT_MS = 10_000;

const billingErrorBodySchema = z.object({
  error: z.string().optional(),
});

const KNOWN_INVITE_ERRORS = new Set<BillingError>([
  "invite-invalid",
  "invite-exhausted",
  "invite-expired",
  "invite-already-redeemed",
  "rate-limit-exceeded",
]);

export function isTrustedStripeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return host === "stripe.com" || host.endsWith(".stripe.com");
  } catch {
    return false;
  }
}

export function navigateToTrustedBillingUrl(rawUrl: string): boolean {
  if (!isTrustedStripeUrl(rawUrl)) return false;
  if (typeof window === "undefined") return false;
  window.location.assign(rawUrl);
  return true;
}

const checkoutResponseSchema: z.ZodType<CheckoutRedirectResult> = z.object({
  checkoutUrl: z.string().refine(isTrustedStripeUrl, "Untrusted Stripe checkout URL"),
  redirectedToPortal: z.boolean(),
});

const portalResponseSchema: z.ZodType<PortalRedirectResult> = z.object({
  portalUrl: z.string().refine(isTrustedStripeUrl, "Untrusted Stripe portal URL"),
});

class BillingHttpError extends Error {
  readonly status: number;
  readonly code?: BillingError;

  constructor(status: number, code?: BillingError) {
    super(`Billing Edge Function returned ${status}`);
    this.name = "BillingHttpError";
    this.status = status;
    this.code = code;
  }
}

async function parseErrorCode(response: Response): Promise<BillingError | undefined> {
  try {
    const parsed = billingErrorBodySchema.safeParse(await response.json());
    const rawCode = parsed.success ? parsed.data.error : undefined;
    if (rawCode && KNOWN_INVITE_ERRORS.has(rawCode as BillingError)) {
      return rawCode as BillingError;
    }
  } catch {
    // Non-JSON error body
  }
  return undefined;
}

async function callBillingEdge<T>(
  accessToken: string,
  payloadBody: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BILLING_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/billing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payloadBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const code = await parseErrorCode(response);
      throw new BillingHttpError(response.status, code);
    }

    return schema.parse(await response.json());
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapBillingEdgeError(error: unknown): BillingError {
  if (error instanceof BillingHttpError) {
    if (error.status === 401) return "unauthorized";
    if (error.code) return error.code;
    if (error.status === 429) return "rate-limit-exceeded";
  }
  return "billing-unavailable";
}

export function createBillingGateway(): BillingGateway {
  return {
    fetchStatus(accessToken: string): ResultAsync<Entitlement, BillingError> {
      return ResultAsync.fromPromise(
        callBillingEdge(accessToken, { action: "status" }, billingStatusResponseSchema).then(
          (res) => res.entitlement,
        ),
        mapBillingEdgeError,
      );
    },
    redeemInvite(accessToken: string, code: string): ResultAsync<Entitlement, BillingError> {
      return ResultAsync.fromPromise(
        callBillingEdge(
          accessToken,
          { action: "redeem-invite", code },
          billingStatusResponseSchema,
        ).then((res) => res.entitlement),
        mapBillingEdgeError,
      );
    },
    createCheckoutSession(accessToken: string): ResultAsync<CheckoutRedirectResult, BillingError> {
      return ResultAsync.fromPromise(
        callBillingEdge(accessToken, { action: "checkout" }, checkoutResponseSchema),
        mapBillingEdgeError,
      );
    },
    createPortalSession(accessToken: string): ResultAsync<PortalRedirectResult, BillingError> {
      return ResultAsync.fromPromise(
        callBillingEdge(accessToken, { action: "portal" }, portalResponseSchema),
        mapBillingEdgeError,
      );
    },
  };
}
