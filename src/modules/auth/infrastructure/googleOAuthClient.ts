import { ResultAsync } from "neverthrow";
import { type CallbackTypes, googleSdkLoaded } from "vue3-google-login";
import type { GoogleAccessTokenRequester } from "@/modules/auth/application";

export function requestGoogleAccessTokenInfra(
  clientId: string,
  scopes: string[],
): ResultAsync<CallbackTypes.TokenPopupResponse, unknown> {
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
    (error) => error,
  );
}

export function createGoogleAccessTokenRequester(): GoogleAccessTokenRequester {
  return {
    requestAccessToken: requestGoogleAccessTokenInfra,
  };
}
