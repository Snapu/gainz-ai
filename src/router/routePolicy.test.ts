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
    expect(resolveRouteTarget("/app/home", undefined, state)).toBe("/");
    expect(resolveRouteTarget("/", undefined, state)).toBe(true);
  });

  it("redirects to loading when sheet is unavailable or profile is loading", () => {
    expect(resolveRouteTarget("/app/home", undefined, { ...readyState, hasDoc: false })).toBe(
      "/loading",
    );
    expect(resolveRouteTarget("/app/home", undefined, { ...readyState, isLoading: true })).toBe(
      "/loading",
    );
    expect(resolveRouteTarget("/loading", undefined, { ...readyState, hasDoc: false })).toBe(true);
  });

  it("redirects incomplete setup users into wizard", () => {
    const state = { ...readyState, setupCompleted: false };
    expect(resolveRouteTarget("/app/home", undefined, state)).toBe("/wizard/fitness-goal");
    expect(resolveRouteTarget("/wizard/fitness-goal", undefined, state)).toBe(true);
  });

  it("redirects auth/setup-complete users away from auth flow pages", () => {
    expect(resolveRouteTarget("/", undefined, readyState)).toBe("/app/home");
    expect(resolveRouteTarget("/loading", undefined, readyState)).toBe("/app/home");
    expect(resolveRouteTarget("/wizard/fitness-goal", undefined, readyState)).toBe("/app/home");
  });

  it("allows wizard edit mode after setup completion", () => {
    expect(resolveRouteTarget("/wizard/fitness-goal", { mode: "edit" }, readyState)).toBe(true);
  });

  it("allows normal application routes when state is ready", () => {
    expect(resolveRouteTarget("/app/home", undefined, readyState)).toBe(true);
    expect(resolveRouteTarget("/app/insights", undefined, readyState)).toBe(true);
  });
});
