/**
 * Checks whether an unknown caught error represents an HTTP 401/403 auth failure.
 * Used to detect auth-expired responses from the google-spreadsheet library.
 */
export function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const response = (error as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return false;
  const status = (response as Record<string, unknown>).status;
  return status === 401 || status === 403;
}
