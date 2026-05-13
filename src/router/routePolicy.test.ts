import { describe, expect, it } from "vitest";
import { type NavigationState, resolveRouteTarget } from "./routePolicy";

const readyState: NavigationState = {
  isLoggedIn: true,
  hasDoc: true,
  isLoading: false,
  setupCompleted: true,
};

describe("resolveRouteTarget", () => {
  it("allows public pages for all states", () => {
    expect(resolveRouteTarget("/privacy", undefined, { ...readyState, isLoggedIn: false })).toBe(
      true,
    );
    expect(resolveRouteTarget("/impressum", undefined, { ...readyState, hasDoc: false })).toBe(
      true,
    );
  });

  it("redirects unauthenticated users to login", () => {
    const state = { ...readyState, isLoggedIn: false };
    expect(resolveRouteTarget("/exercise-logs", undefined, state)).toBe("/");
    expect(resolveRouteTarget("/", undefined, state)).toBe(true);
  });

  it("redirects to loading when sheet is unavailable or profile is loading", () => {
    expect(resolveRouteTarget("/exercise-logs", undefined, { ...readyState, hasDoc: false })).toBe(
      "/loading",
    );
    expect(
      resolveRouteTarget("/exercise-logs", undefined, { ...readyState, isLoading: true }),
    ).toBe("/loading");
    expect(resolveRouteTarget("/loading", undefined, { ...readyState, hasDoc: false })).toBe(true);
  });

  it("redirects incomplete setup users into wizard", () => {
    const state = { ...readyState, setupCompleted: false };
    expect(resolveRouteTarget("/exercise-logs", undefined, state)).toBe("/wizard/fitness-goal");
    expect(resolveRouteTarget("/wizard/fitness-goal", undefined, state)).toBe(true);
  });

  it("redirects auth/setup-complete users away from auth flow pages", () => {
    expect(resolveRouteTarget("/", undefined, readyState)).toBe("/exercise-logs");
    expect(resolveRouteTarget("/loading", undefined, readyState)).toBe("/exercise-logs");
    expect(resolveRouteTarget("/wizard/fitness-goal", undefined, readyState)).toBe(
      "/exercise-logs",
    );
  });

  it("allows wizard edit mode after setup completion", () => {
    expect(resolveRouteTarget("/wizard/fitness-goal", { mode: "edit" }, readyState)).toBe(true);
  });

  it("allows normal application routes when state is ready", () => {
    expect(resolveRouteTarget("/exercise-logs", undefined, readyState)).toBe(true);
    expect(resolveRouteTarget("/training-insights", undefined, readyState)).toBe(true);
  });
});
