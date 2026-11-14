export type AuthTokenRequestError =
  | "token-request-failed"
  | "token-exchange-failed"
  | "token-refresh-failed"
  | "refresh-token-invalid";

export type AuthError = AuthTokenRequestError | "missing-scopes";

export interface AuthCodePopupResponse {
  code: string;
  scope?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}
