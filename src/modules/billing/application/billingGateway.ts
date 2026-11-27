import type { ResultAsync } from "neverthrow";
import type { BillingError, Entitlement } from "../domain";

export interface CheckoutRedirectResult {
  checkoutUrl: string;
  redirectedToPortal: boolean;
}

export interface PortalRedirectResult {
  portalUrl: string;
}

export interface BillingGateway {
  fetchStatus(accessToken: string): ResultAsync<Entitlement, BillingError>;
  redeemInvite(accessToken: string, code: string): ResultAsync<Entitlement, BillingError>;
  createCheckoutSession(accessToken: string): ResultAsync<CheckoutRedirectResult, BillingError>;
  createPortalSession(accessToken: string): ResultAsync<PortalRedirectResult, BillingError>;
}
