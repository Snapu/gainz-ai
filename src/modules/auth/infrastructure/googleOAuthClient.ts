import { ResultAsync } from "neverthrow";
import { type CallbackTypes, googleSdkLoaded } from "vue3-google-login";
import { z } from "zod";
import type { GoogleAccessTokenService } from "@/modules/auth/application";
import type {
  AuthCodePopupResponse,
  AuthTokenRequestError,
  OAuthTokenResponse,
} from "@/modules/auth/domain";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/modules/platform/infrastructure";

const oauthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const GIS_LOAD_TIMEOUT_MS = 15_000;

function requestGoogleAuthCodeInfra(
  clientId: string,
  scopes: string[],
): ResultAsync<AuthCodePopupResponse, AuthTokenRequestError> {
  return ResultAsync.fromPromise(
    new Promise<AuthCodePopupResponse>((resolve, reject) => {
      let settled = false;
      const sdkTimeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Google Identity Services SDK failed to load in time"));
        }
      }, GIS_LOAD_TIMEOUT_MS);

      googleSdkLoaded((google) => {
        if (settled) return;
        clearTimeout(sdkTimeoutId);
        const client = google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: scopes.join(" "),
          ux_mode: "popup",
          prompt: "consent",
          callback: (response: CallbackTypes.CodePopupResponse) => {
            if (settled) return;
            settled = true;
            if (response.code) {
              resolve({ code: response.code, scope: response.scope });
            } else {
              reject(new Error("Missing authorization code"));
            }
          },
          error_callback: (err: unknown) => {
            if (settled) return;
            settled = true;
            reject(err);
          },
        } as unknown as Parameters<typeof google.accounts.oauth2.initCodeClient>[0]);
        client.requestCode();
      });
    }),
    () => "token-request-failed" as const,
  );
}

class AuthEndpointHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Auth token endpoint failed with ${status}`);
    this.name = "AuthEndpointHttpError";
    this.status = status;
  }
}

const AUTH_ENDPOINT_TIMEOUT_MS = 10_000;

function callAuthTokenEndpoint(
  body: Record<string, unknown>,
  errorCode: AuthTokenRequestError,
): ResultAsync<OAuthTokenResponse, AuthTokenRequestError> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_ENDPOINT_TIMEOUT_MS);

  return ResultAsync.fromPromise(
    fetch(`${SUPABASE_URL}/functions/v1/auth-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new AuthEndpointHttpError(res.status);
        }
        const json: unknown = await res.json();
        return oauthTokenResponseSchema.parse(json);
      })
      .finally(() => {
        clearTimeout(timeoutId);
      }),
    (err): AuthTokenRequestError => {
      if (
        errorCode === "token-refresh-failed" &&
        err instanceof AuthEndpointHttpError &&
        (err.status === 400 || err.status === 401)
      ) {
        return "refresh-token-invalid";
      }
      return errorCode;
    },
  );
}

function exchangeAuthorizationCodeInfra(
  code: string,
): ResultAsync<OAuthTokenResponse, AuthTokenRequestError> {
  return callAuthTokenEndpoint(
    {
      grantType: "authorization_code",
      code,
    },
    "token-exchange-failed",
  );
}

function refreshAccessTokenInfra(
  refreshToken: string,
): ResultAsync<OAuthTokenResponse, AuthTokenRequestError> {
  return callAuthTokenEndpoint(
    {
      grantType: "refresh_token",
      refreshToken,
    },
    "token-refresh-failed",
  );
}

export function createGoogleAccessTokenService(): GoogleAccessTokenService {
  return {
    requestAuthCode: requestGoogleAuthCodeInfra,
    exchangeAuthorizationCode: exchangeAuthorizationCodeInfra,
    refreshAccessToken: refreshAccessTokenInfra,
  };
}
