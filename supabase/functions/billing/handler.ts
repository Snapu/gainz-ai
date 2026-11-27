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
  type AbusePreventionPeppers,
  deriveSubjectDigests,
  loadAbusePreventionPeppers,
} from "../_shared/subjectDigest.ts";

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
}

type BillingAction = { action: "status" } | { action: "redeem-invite"; code: string };

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
  return null;
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

  const config = loadBillingServerConfig(deps.getEnv ?? getEnv);
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
