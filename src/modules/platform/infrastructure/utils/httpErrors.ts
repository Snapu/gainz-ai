export function getHttpErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return null;
  const status = (response as Record<string, unknown>).status;
  return typeof status === "number" ? status : null;
}

/**
 * Checks whether an unknown caught error represents an HTTP 401/403 auth failure.
 * Used to detect auth-expired responses from the google-spreadsheet library.
 */
export function isAuthError(error: unknown): boolean {
  const status = getHttpErrorStatus(error);
  return status === 401 || status === 403;
}

export function isAuthExpiredError(error: unknown): boolean {
  return getHttpErrorStatus(error) === 401;
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 401 || status === 408 || status === 429 || (status >= 500 && status < 600);
}

export function isNonRetryableClientStatus(status: number): boolean {
  return status >= 400 && status < 500 && !isRetryableHttpStatus(status);
}

export function isNonRetryableClientError(error: unknown): boolean {
  const status = getHttpErrorStatus(error);
  return status !== null && isNonRetryableClientStatus(status);
}
