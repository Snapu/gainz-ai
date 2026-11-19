import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "npm:jose@5.10.0";
import { fetchWithTimeout } from "./http.ts";

const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_TOKENINFO_TIMEOUT_MS = 5000;
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface VerifyGoogleCallerOptions {
  jwks?: JWTVerifyGetKey;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId: string,
  jwks: JWTVerifyGetKey = GOOGLE_JWKS,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: expectedClientId,
    });

    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!sub) return null;

    return { userId: sub };
  } catch (err) {
    console.warn(
      "Google ID token verification failed:",
      err instanceof Error ? err.name : "verification-error",
    );
    return null;
  }
}

async function verifyGoogleAccessToken(
  accessToken: string,
  expectedClientId: string,
): Promise<{ userId: string } | null> {
  try {
    const res = await fetchWithTimeout(
      GOOGLE_TOKENINFO_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ access_token: accessToken }).toString(),
      },
      GOOGLE_TOKENINFO_TIMEOUT_MS,
    );
    if (!res.ok) return null;

    const info = (await res.json()) as Record<string, unknown>;
    const sub = typeof info.sub === "string" ? info.sub.trim() : "";
    const aud = typeof info.aud === "string" ? info.aud.trim() : "";
    const azp = typeof info.azp === "string" ? info.azp.trim() : "";

    if (!sub) return null;
    if (aud !== expectedClientId && azp !== expectedClientId) return null;

    return { userId: sub };
  } catch {
    return null;
  }
}

export async function verifyGoogleCaller(
  token: string,
  expectedClientId: string,
  options?: VerifyGoogleCallerOptions,
): Promise<{ userId: string } | null> {
  // Never fall back to OAuth access-token introspection for malformed or invalid 3-segment JWTs
  if (token.split(".").length === 3) {
    return verifyGoogleIdToken(token, expectedClientId, options?.jwks ?? GOOGLE_JWKS);
  }

  return verifyGoogleAccessToken(token, expectedClientId);
}
