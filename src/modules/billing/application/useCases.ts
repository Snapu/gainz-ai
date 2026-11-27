import type { ResultAsync } from "neverthrow";
import type { BillingError, Entitlement } from "../domain";
import type { BillingGateway } from "./billingGateway";

export function fetchEntitlement(
  gateway: BillingGateway,
  accessToken: string,
): ResultAsync<Entitlement, BillingError> {
  return gateway.fetchStatus(accessToken);
}

export function redeemInviteCode(
  gateway: BillingGateway,
  accessToken: string,
  code: string,
): ResultAsync<Entitlement, BillingError> {
  return gateway.redeemInvite(accessToken, code);
}
