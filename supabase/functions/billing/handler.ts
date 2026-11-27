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
}

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

function parseBillingAction(value: unknown): "status" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return record.action === "status" ? "status" : null;
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

  const action = parseBillingAction(bodyResult.data);
  if (!action) {
    return jsonResponse({ error: "invalid-request" }, 400);
  }

  const digests = await deriveSubjectDigests(caller.userId, config.peppers);
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
