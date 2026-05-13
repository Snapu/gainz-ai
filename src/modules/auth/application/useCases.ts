import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import type { CallbackTypes } from "vue3-google-login";
import type { AuthError, AuthTokenRequestError } from "@/modules/auth/domain";

export const CLIENT_ID = "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";

export const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

export interface GoogleAccessTokenService {
  requestAccessToken(
    clientId: string,
    scopes: string[],
  ): ResultAsync<CallbackTypes.TokenPopupResponse, AuthTokenRequestError>;
}

export function requestAccessToken(
  requester: GoogleAccessTokenService,
): ResultAsync<CallbackTypes.TokenPopupResponse, AuthError> {
  return requester
    .requestAccessToken(CLIENT_ID, SCOPES)
    .orTee((originalError) => {
      console.error("Token request failed", originalError);
      Sentry.captureException(originalError);
    })
    .mapErr((): AuthError => "token-request-failed")
    .andThen(
      (response): ResultAsync<CallbackTypes.TokenPopupResponse, AuthError> =>
        SCOPES.every((scope) => response.scope?.includes(scope))
          ? okAsync(response)
          : errAsync("missing-scopes"),
    );
}
