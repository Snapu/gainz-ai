import { ResultAsync } from "neverthrow";
import { z } from "zod";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/modules/platform/infrastructure";
import type { BillingGateway } from "../application";
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

async function callBillingEdge(
  accessToken: string,
  payloadBody: Record<string, unknown>,
): Promise<Entitlement> {
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

    const parsed = billingStatusResponseSchema.parse(await response.json());
    return parsed.entitlement;
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
        callBillingEdge(accessToken, { action: "status" }),
        mapBillingEdgeError,
      );
    },
    redeemInvite(accessToken: string, code: string): ResultAsync<Entitlement, BillingError> {
      return ResultAsync.fromPromise(
        callBillingEdge(accessToken, { action: "redeem-invite", code }),
        mapBillingEdgeError,
      );
    },
  };
}
