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
