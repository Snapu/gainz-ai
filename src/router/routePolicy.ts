export interface NavigationState {
  isLoggedIn: boolean;
  hasDoc: boolean;
  isLoading: boolean;
  setupCompleted: boolean;
}

export function resolveRouteTarget(
  toPath: string,
  query: Record<string, unknown> | undefined,
  state: NavigationState,
): true | string {
  const isPublicPage = toPath === "/privacy" || toPath === "/impressum";
  if (isPublicPage) return true;

  if (!state.isLoggedIn) {
    return toPath === "/" ? true : "/";
  }

  if (!state.hasDoc || state.isLoading) {
    return toPath === "/loading" ? true : "/loading";
  }

  if (!state.setupCompleted) {
    return toPath.startsWith("/wizard") ? true : "/wizard/fitness-goal";
  }

  const isExcluded = toPath === "/" || toPath === "/loading";
  const isWizardWithoutEdit = toPath.startsWith("/wizard") && query?.mode !== "edit";

  if (isExcluded || isWizardWithoutEdit) {
    return "/exercise-logs";
  }

  return true;
}
