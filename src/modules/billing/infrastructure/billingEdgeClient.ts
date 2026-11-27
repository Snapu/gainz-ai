import { ResultAsync } from "neverthrow";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/modules/platform/infrastructure";
import type { BillingGateway } from "../application";
import type { BillingError, Entitlement } from "../domain";
import { billingStatusResponseSchema } from "./entitlementSchema";

const BILLING_REQUEST_TIMEOUT_MS = 10_000;

class BillingHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Billing Edge Function returned ${status}`);
    this.name = "BillingHttpError";
    this.status = status;
  }
}

async function fetchStatusFromEdge(accessToken: string): Promise<Entitlement> {
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
      body: JSON.stringify({ action: "status" }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new BillingHttpError(response.status);
    }

    const parsed = billingStatusResponseSchema.parse(await response.json());
    return parsed.entitlement;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createBillingGateway(): BillingGateway {
  return {
    fetchStatus(accessToken: string): ResultAsync<Entitlement, BillingError> {
      return ResultAsync.fromPromise(fetchStatusFromEdge(accessToken), (error): BillingError => {
        if (error instanceof BillingHttpError && error.status === 401) {
          return "unauthorized";
        }
        return "billing-unavailable";
      });
    },
  };
}
