import { describe, expect, it } from "vitest";
import { isPublicRoute, type NavigationState, resolveRouteTarget } from "./routePolicy";

const readyState: NavigationState = {
  isLoggedIn: true,
  hasConsent: true,
  hasDoc: true,
  isLoading: false,
  setupCompleted: true,
};

describe("isPublicRoute", () => {
  it("matches public legal routes with or without trailing slashes", () => {
    expect(isPublicRoute("/privacy")).toBe(true);
    expect(isPublicRoute("/privacy/")).toBe(true);
    expect(isPublicRoute("/impressum")).toBe(true);
    expect(isPublicRoute("/impressum/")).toBe(true);
    expect(isPublicRoute("/terms")).toBe(true);
    expect(isPublicRoute("/terms/")).toBe(true);
    expect(isPublicRoute("/")).toBe(false);
    expect(isPublicRoute("/consent")).toBe(false);
    expect(isPublicRoute("/app/home")).toBe(false);
  });
});

describe("resolveRouteTarget", () => {
  it("allows public pages for all states, including trailing slashes", () => {
    expect(resolveRouteTarget("/privacy", undefined, { ...readyState, isLoggedIn: false })).toBe(
      true,
    );
    expect(resolveRouteTarget("/impressum/", undefined, { ...readyState, hasDoc: false })).toBe(
      true,
    );
    expect(
      resolveRouteTarget("/terms/", undefined, {
        ...readyState,
        isLoggedIn: false,
        hasConsent: false,
      }),
    ).toBe(true);
    expect(resolveRouteTarget("/terms", undefined, { ...readyState, hasConsent: false })).toBe(
      true,
    );
  });

  it("redirects unauthenticated users to login", () => {
    const state = { ...readyState, isLoggedIn: false, hasConsent: false };
    expect(resolveRouteTarget("/app/home", undefined, state)).toBe("/");
    expect(resolveRouteTarget("/consent", undefined, state)).toBe("/");
    expect(resolveRouteTarget("/", undefined, state)).toBe(true);
  });

  it("redirects logged-in users without valid consent to /consent", () => {
    const state = { ...readyState, hasConsent: false };
    expect(resolveRouteTarget("/app/home", undefined, state)).toBe("/consent");
    expect(resolveRouteTarget("/loading", undefined, state)).toBe("/consent");
    expect(resolveRouteTarget("/", undefined, state)).toBe("/consent");
    expect(resolveRouteTarget("/consent", undefined, state)).toBe(true);
    expect(resolveRouteTarget("/consent/", undefined, state)).toBe(true);
  });

  it("redirects to loading when sheet is unavailable or profile is loading", () => {
    expect(resolveRouteTarget("/app/home", undefined, { ...readyState, hasDoc: false })).toBe(
      "/loading",
    );
    expect(resolveRouteTarget("/consent", undefined, { ...readyState, hasDoc: false })).toBe(
      "/loading",
    );
    expect(resolveRouteTarget("/app/home", undefined, { ...readyState, isLoading: true })).toBe(
      "/loading",
    );
    expect(resolveRouteTarget("/loading", undefined, { ...readyState, hasDoc: false })).toBe(true);
  });

  it("redirects incomplete setup users into wizard", () => {
    const state = { ...readyState, setupCompleted: false };
    expect(resolveRouteTarget("/app/home", undefined, state)).toBe("/wizard/goal");
    expect(resolveRouteTarget("/wizard/goal", undefined, state)).toBe(true);
  });

  it("redirects auth/setup-complete users away from auth flow pages", () => {
    expect(resolveRouteTarget("/", undefined, readyState)).toBe("/app/home");
    expect(resolveRouteTarget("/consent", undefined, readyState)).toBe("/app/home");
    expect(resolveRouteTarget("/loading", undefined, readyState)).toBe("/app/home");
    expect(resolveRouteTarget("/wizard/goal", undefined, readyState)).toBe("/app/home");
  });

  it("allows wizard edit mode after setup completion", () => {
    expect(resolveRouteTarget("/wizard/goal", { mode: "edit" }, readyState)).toBe(true);
  });

  it("allows normal application routes when state is ready", () => {
    expect(resolveRouteTarget("/app/home", undefined, readyState)).toBe(true);
    expect(resolveRouteTarget("/app/insights", undefined, readyState)).toBe(true);
  });

  it("routes post-load checkout returns away from auth/loading gates to /app/coach", () => {
    const checkoutReady: NavigationState = {
      ...readyState,
      hasPendingCheckoutReturn: true,
    };
    expect(resolveRouteTarget("/", undefined, checkoutReady)).toBe("/app/coach");
    expect(resolveRouteTarget("/loading", undefined, checkoutReady)).toBe("/app/coach");
    expect(resolveRouteTarget("/consent", undefined, checkoutReady)).toBe("/app/coach");
    expect(resolveRouteTarget("/app/coach", undefined, checkoutReady)).toBe(true);
  });
});
