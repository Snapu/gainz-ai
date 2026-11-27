import { extractBearerToken, verifyGoogleCaller } from "../_shared/auth.ts";
import { formatEntitlementPayload } from "../_shared/entitlement.ts";
import {
  corsPreflightResponse,
  DEFAULT_GOOGLE_CLIENT_ID,
  getEnv,
  jsonResponse,
  MAX_REQUEST_BODY_BYTES,
  readJsonBodyWithLimit,
} from "../_shared/http.ts";
import {
  checkInviteRedeemRateLimit,
  extractClientIp,
  type InviteRedeemErrorCode,
  redeemInviteCode,
} from "../_shared/invite.ts";
import { getEntitlementStatus } from "../_shared/quota.ts";
import {
  createCustomerPortalSession,
  createManagedCheckoutSession,
  normalizeAppPublicUrl,
} from "../_shared/stripe.ts";
import {
  type AbusePreventionPeppers,
  deriveSubjectDigests,
  loadAbusePreventionPeppers,
} from "../_shared/subjectDigest.ts";
import { getUserSubscriptionSummary } from "../_shared/subscriptions.ts";

export interface BillingServerConfig {
  clientId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  peppers: AbusePreventionPeppers;
}

export interface BillingHandlerDeps {
  getEnv?: (name: string) => string | undefined;
  verifyCaller?: typeof verifyGoogleCaller;
  getEntitlementStatus?: typeof getEntitlementStatus;
  checkInviteRateLimit?: typeof checkInviteRedeemRateLimit;
  redeemInviteCode?: typeof redeemInviteCode;
  getUserSubscriptionSummary?: typeof getUserSubscriptionSummary;
  createManagedCheckoutSession?: typeof createManagedCheckoutSession;
  createCustomerPortalSession?: typeof createCustomerPortalSession;
}

type BillingAction =
  | { action: "status" }
  | { action: "redeem-invite"; code: string }
  | { action: "checkout" }
  | { action: "portal" };

function loadBillingServerConfig(
  readEnv: (name: string) => string | undefined = getEnv,
): BillingServerConfig | null {
  const clientId = (readEnv("GOOGLE_CLIENT_ID") ?? "").trim() || DEFAULT_GOOGLE_CLIENT_ID;
  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const peppers = loadAbusePreventionPeppers(readEnv);
  if (!supabaseUrl || !serviceRoleKey || !peppers) {
    return null;
  }
  return { clientId, supabaseUrl, serviceRoleKey, peppers };
}

function parseBillingAction(value: unknown): BillingAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.action === "status") {
    return { action: "status" };
  }
  if (record.action === "redeem-invite" && typeof record.code === "string") {
    return { action: "redeem-invite", code: record.code };
  }
  if (record.action === "checkout") {
    return { action: "checkout" };
  }
  if (record.action === "portal") {
    return { action: "portal" };
  }
  return null;
}

const PORTAL_REDIRECT_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

async function handleCheckoutAction(
  userId: string,
  config: BillingServerConfig,
  readEnv: (name: string) => string | undefined,
  deps: BillingHandlerDeps,
): Promise<Response> {
  const stripeSecretKey = readEnv("STRIPE_SECRET_KEY")?.trim();
  const priceId = readEnv("STRIPE_MONTHLY_PRICE_ID")?.trim();
  const appPublicUrl = normalizeAppPublicUrl(readEnv("APP_PUBLIC_URL"));
  if (!stripeSecretKey || !priceId || !appPublicUrl) {
    return jsonResponse({ error: "billing-unavailable" }, 503);
  }

  const getSummary = deps.getUserSubscriptionSummary ?? getUserSubscriptionSummary;
  const subResult = await getSummary(config.supabaseUrl, config.serviceRoleKey, userId);
  if (!subResult.ok) {
    return jsonResponse({ error: "billing-unavailable" }, 500);
  }

  const existing = subResult.row;
  if (existing && PORTAL_REDIRECT_STATUSES.has(existing.status)) {
    const createPortal = deps.createCustomerPortalSession ?? createCustomerPortalSession;
    const portalRes = await createPortal(stripeSecretKey, {
      customerId: existing.provider_customer_id,
      returnUrl: `${appPublicUrl}/`,
    });
    if (!portalRes.ok) {
      return jsonResponse({ error: "billing-unavailable" }, 500);
    }
    return jsonResponse({ checkoutUrl: portalRes.url, redirectedToPortal: true }, 200);
  }

  const createCheckout = deps.createManagedCheckoutSession ?? createManagedCheckoutSession;
  const sessionRes = await createCheckout(stripeSecretKey, {
    priceId,
    userId,
    customerId: existing?.provider_customer_id ?? null,
    successUrl: `${appPublicUrl}/?checkout=success`,
    cancelUrl: `${appPublicUrl}/?checkout=cancelled`,
  });
  if (!sessionRes.ok) {
    return jsonResponse({ error: "billing-unavailable" }, 500);
  }

  return jsonResponse({ checkoutUrl: sessionRes.url, redirectedToPortal: false }, 200);
}

async function handlePortalAction(
  userId: string,
  config: BillingServerConfig,
  readEnv: (name: string) => string | undefined,
  deps: BillingHandlerDeps,
): Promise<Response> {
  const stripeSecretKey = readEnv("STRIPE_SECRET_KEY")?.trim();
  const appPublicUrl = normalizeAppPublicUrl(readEnv("APP_PUBLIC_URL"));
  if (!stripeSecretKey || !appPublicUrl) {
    return jsonResponse({ error: "billing-unavailable" }, 503);
  }

  const getSummary = deps.getUserSubscriptionSummary ?? getUserSubscriptionSummary;
  const subResult = await getSummary(config.supabaseUrl, config.serviceRoleKey, userId);
  if (!subResult.ok) {
    return jsonResponse({ error: "billing-unavailable" }, 500);
  }

  const customerId = subResult.row?.provider_customer_id?.trim();
  if (!customerId) {
    return jsonResponse({ error: "no-customer-portal" }, 404);
  }

  const createPortal = deps.createCustomerPortalSession ?? createCustomerPortalSession;
  const portalRes = await createPortal(stripeSecretKey, {
    customerId,
    returnUrl: `${appPublicUrl}/`,
  });
  if (!portalRes.ok) {
    return jsonResponse({ error: "billing-unavailable" }, 500);
  }

  return jsonResponse({ portalUrl: portalRes.url }, 200);
}

const INVITE_ERROR_STATUS: Record<InviteRedeemErrorCode | "billing-unavailable", number> = {
  "invite-invalid": 400,
  "invite-exhausted": 409,
  "invite-already-redeemed": 409,
  "invite-expired": 410,
  "billing-unavailable": 500,
};

async function handleRedeemInviteAction(
  req: Request,
  userId: string,
  rawCode: string,
  config: BillingServerConfig,
  digests: { subjectDigest: string; previousSubjectDigest: string | null },
  deps: BillingHandlerDeps,
): Promise<Response> {
  const clientIp = extractClientIp(req);
  const ipDigest = clientIp
    ? (await deriveSubjectDigests(`ip:${clientIp}`, config.peppers)).subjectDigest
    : null;

  const checkRateLimit = deps.checkInviteRateLimit ?? checkInviteRedeemRateLimit;
  const rateLimitOutcome = await checkRateLimit(config.supabaseUrl, config.serviceRoleKey, {
    userKey: `u:${digests.subjectDigest}`,
    ipKey: ipDigest ? `ip:${ipDigest}` : null,
  });

  if (rateLimitOutcome === "rate-limited") {
    return jsonResponse({ error: "rate-limit-exceeded" }, 429);
  }
  if (rateLimitOutcome === "error") {
    return jsonResponse({ error: "billing-unavailable" }, 500);
  }

  const normalizedCode = rawCode.trim().toUpperCase();
  if (normalizedCode.length < 3 || normalizedCode.length > 64) {
    return jsonResponse({ error: "invite-invalid" }, 400);
  }

  const redeemFn = deps.redeemInviteCode ?? redeemInviteCode;
  const redeemResult = await redeemFn(config.supabaseUrl, config.serviceRoleKey, {
    userId,
    code: normalizedCode,
  });

  if (!redeemResult.ok) {
    return jsonResponse(
      { error: redeemResult.error },
      INVITE_ERROR_STATUS[redeemResult.error] ?? 500,
    );
  }

  const fetchStatus = deps.getEntitlementStatus ?? getEntitlementStatus;
  const entitlementRow = await fetchStatus(config.supabaseUrl, config.serviceRoleKey, {
    userId,
    subjectDigest: digests.subjectDigest,
    previousSubjectDigest: digests.previousSubjectDigest,
  });

  if (!entitlementRow) {
    return jsonResponse({ error: "billing-unavailable" }, 500);
  }

  return jsonResponse({ entitlement: formatEntitlementPayload(entitlementRow) }, 200);
}

export async function handleBillingRequest(
  req: Request,
  deps: BillingHandlerDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  const callerToken = extractBearerToken(req);
  if (!callerToken) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const readEnv = deps.getEnv ?? getEnv;
  const config = loadBillingServerConfig(readEnv);
  if (!config) {
    return jsonResponse({ error: "missing-server-config" }, 500);
  }

  const verifyCaller = deps.verifyCaller ?? verifyGoogleCaller;
  const caller = await verifyCaller(callerToken, config.clientId);
  if (!caller) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const bodyResult = await readJsonBodyWithLimit(req, MAX_REQUEST_BODY_BYTES);
  if (!bodyResult.ok) {
    return jsonResponse({ error: bodyResult.error }, bodyResult.status);
  }

  const parsedAction = parseBillingAction(bodyResult.data);
  if (!parsedAction) {
    return jsonResponse({ error: "invalid-request" }, 400);
  }

  if (parsedAction.action === "checkout") {
    return handleCheckoutAction(caller.userId, config, readEnv, deps);
  }
  if (parsedAction.action === "portal") {
    return handlePortalAction(caller.userId, config, readEnv, deps);
  }

  const digests = await deriveSubjectDigests(caller.userId, config.peppers);

  if (parsedAction.action === "redeem-invite") {
    return handleRedeemInviteAction(req, caller.userId, parsedAction.code, config, digests, deps);
  }

  const fetchStatus = deps.getEntitlementStatus ?? getEntitlementStatus;
  const entitlementRow = await fetchStatus(config.supabaseUrl, config.serviceRoleKey, {
    userId: caller.userId,
    subjectDigest: digests.subjectDigest,
    previousSubjectDigest: digests.previousSubjectDigest,
  });

  if (!entitlementRow) {
    return jsonResponse({ error: "billing-unavailable" }, 500);
  }

  return jsonResponse({ entitlement: formatEntitlementPayload(entitlementRow) }, 200);
}
