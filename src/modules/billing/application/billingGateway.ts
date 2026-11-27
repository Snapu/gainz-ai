import type { ResultAsync } from "neverthrow";
import type { BillingError, Entitlement } from "../domain";

export interface BillingGateway {
  fetchStatus(accessToken: string): ResultAsync<Entitlement, BillingError>;
  redeemInvite(accessToken: string, code: string): ResultAsync<Entitlement, BillingError>;
}
