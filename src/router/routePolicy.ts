const PUBLIC_ROUTES = ["/privacy", "/impressum", "/terms"] as const;

function normalizeRoutePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function isPublicRoute(path: string): boolean {
  return (PUBLIC_ROUTES as readonly string[]).includes(normalizeRoutePath(path));
}

export interface NavigationState {
  isLoggedIn: boolean;
  hasConsent: boolean;
  hasDoc: boolean;
  isLoading: boolean;
  setupCompleted: boolean;
}

function isExcludedAuthenticatedRoute(
  normalizedPath: string,
  query: Record<string, unknown> | undefined,
): boolean {
  if (normalizedPath === "/" || normalizedPath === "/loading" || normalizedPath === "/consent") {
    return true;
  }
  return normalizedPath.startsWith("/wizard") && query?.mode !== "edit";
}

export function resolveRouteTarget(
  toPath: string,
  query: Record<string, unknown> | undefined,
  state: NavigationState,
): true | string {
  const normalizedPath = normalizeRoutePath(toPath);
  if (isPublicRoute(normalizedPath)) return true;

  if (!state.isLoggedIn) {
    return normalizedPath === "/" ? true : "/";
  }

  if (!state.hasConsent) {
    return normalizedPath === "/consent" ? true : "/consent";
  }

  if (!state.hasDoc || state.isLoading) {
    return normalizedPath === "/loading" ? true : "/loading";
  }

  if (!state.setupCompleted) {
    return normalizedPath.startsWith("/wizard") ? true : "/wizard/goal";
  }

  return isExcludedAuthenticatedRoute(normalizedPath, query) ? "/app/home" : true;
}
