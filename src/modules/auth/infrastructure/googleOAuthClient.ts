import { ResultAsync } from "neverthrow";
import { type CallbackTypes, googleSdkLoaded } from "vue3-google-login";
import type { GoogleAccessTokenService } from "@/modules/auth/application";
import type { AuthTokenRequestError } from "@/modules/auth/domain";

function requestGoogleAccessTokenInfra(
  clientId: string,
  scopes: string[],
): ResultAsync<CallbackTypes.TokenPopupResponse, AuthTokenRequestError> {
  return ResultAsync.fromPromise(
    new Promise<CallbackTypes.TokenPopupResponse>((resolve, reject) => {
      googleSdkLoaded((google) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: scopes.join(" "),
          callback: resolve,
          error_callback: reject,
        });
        client.requestAccessToken();
      });
    }),
    () => "token-request-failed" as const,
  );
}

export function createGoogleAccessTokenService(): GoogleAccessTokenService {
  return {
    requestAccessToken: requestGoogleAccessTokenInfra,
  };
}
