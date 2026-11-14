import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import type {
  AuthCodePopupResponse,
  AuthError,
  AuthTokenRequestError,
  OAuthTokenResponse,
} from "@/modules/auth/domain";

export const CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";

export const SCOPES = ["openid", "https://www.googleapis.com/auth/drive.file"];

const REQUIRED_AUTH_SCOPES = ["openid", "https://www.googleapis.com/auth/drive.file"];

export interface GoogleAccessTokenService {
  requestAuthCode(
    clientId: string,
    scopes: string[],
  ): ResultAsync<AuthCodePopupResponse, AuthTokenRequestError>;
  exchangeAuthorizationCode(code: string): ResultAsync<OAuthTokenResponse, AuthTokenRequestError>;
  refreshAccessToken(refreshToken: string): ResultAsync<OAuthTokenResponse, AuthTokenRequestError>;
}

function hasRequiredScopes(scopeString?: string): boolean {
  if (!scopeString) return false;
  const granted = new Set(scopeString.split(/\s+/).filter(Boolean));
  return REQUIRED_AUTH_SCOPES.every((scope) => granted.has(scope));
}

export function requestAccessToken(
  requester: GoogleAccessTokenService,
): ResultAsync<OAuthTokenResponse, AuthError> {
  return requester
    .requestAuthCode(CLIENT_ID, SCOPES)
    .orTee((originalError) => {
      console.warn("Auth code request cancelled or failed", originalError);
    })
    .mapErr((): AuthError => "token-request-failed")
    .andThen((codeResponse): ResultAsync<OAuthTokenResponse, AuthError> => {
      if (codeResponse.scope !== undefined && !hasRequiredScopes(codeResponse.scope)) {
        return errAsync("missing-scopes");
      }

      return requester
        .exchangeAuthorizationCode(codeResponse.code)
        .orTee((exchangeError) => {
          console.error("Token exchange failed", exchangeError);
          Sentry.captureException(exchangeError);
        })
        .mapErr((): AuthError => "token-exchange-failed")
        .andThen((tokenResponse): ResultAsync<OAuthTokenResponse, AuthError> => {
          const grantedScope = tokenResponse.scope ?? codeResponse.scope;
          if (!hasRequiredScopes(grantedScope)) {
            return errAsync("missing-scopes");
          }
          return okAsync(tokenResponse);
        });
    });
}

export function refreshAccessToken(
  requester: GoogleAccessTokenService,
  refreshToken: string,
): ResultAsync<OAuthTokenResponse, AuthTokenRequestError> {
  return requester.refreshAccessToken(refreshToken).orTee((refreshError) => {
    console.error("Token refresh failed", refreshError);
    Sentry.captureException(refreshError);
  });
}
