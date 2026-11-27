import type { ResultAsync } from "neverthrow";
import type { BillingError, Entitlement } from "../domain";
import type {
  BillingGateway,
  CheckoutRedirectResult,
  PortalRedirectResult,
} from "./billingGateway";

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

export function startSubscriptionCheckout(
  gateway: BillingGateway,
  accessToken: string,
): ResultAsync<CheckoutRedirectResult, BillingError> {
  return gateway.createCheckoutSession(accessToken);
}

export function openCustomerPortal(
  gateway: BillingGateway,
  accessToken: string,
): ResultAsync<PortalRedirectResult, BillingError> {
  return gateway.createPortalSession(accessToken);
}
