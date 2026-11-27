import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capturePendingCheckoutReturnFromUrl,
  clearPendingCheckoutPoll,
  clearPendingCheckoutReturn,
  clearPendingCheckoutRoute,
  hasPendingCheckoutReturn,
  hasPendingCheckoutRoute,
} from "./pendingCheckoutStorage";

describe("pendingCheckoutStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("captures ?checkout=success from initial search before router redirects and scrubs query cleanly", () => {
    window.history.replaceState(null, "", "/?checkout=success&foo=bar#/loading");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    expect(capturePendingCheckoutReturnFromUrl()).toBe(true);
    expect(hasPendingCheckoutReturn()).toBe(true);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?foo=bar");
    expect(window.location.hash).toBe("#/loading");
  });

  it("captures ?CHECKOUT=success from hash query case-insensitively and supports clear", () => {
    window.history.replaceState(null, "", "/#/app/home?CHECKOUT=SUCCESS");

    expect(capturePendingCheckoutReturnFromUrl()).toBe(true);
    expect(hasPendingCheckoutReturn()).toBe(true);
    expect(window.location.hash).toBe("#/app/home");

    clearPendingCheckoutReturn();
    expect(hasPendingCheckoutReturn()).toBe(false);
  });

  it("scrubs ?checkout=cancelled without setting pending checkout success state", () => {
    window.history.replaceState(null, "", "/?checkout=cancelled#/app/coach");

    expect(capturePendingCheckoutReturnFromUrl()).toBe(false);
    expect(hasPendingCheckoutReturn()).toBe(false);
    expect(hasPendingCheckoutRoute()).toBe(false);
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#/app/coach");
  });

  it("decouples poll and one-shot route lifecycles while clearing both on sign-out reset", () => {
    window.history.replaceState(null, "", "/?checkout=success#/loading");
    expect(capturePendingCheckoutReturnFromUrl()).toBe(true);
    expect(hasPendingCheckoutReturn()).toBe(true);
    expect(hasPendingCheckoutRoute()).toBe(true);

    // Settling the poll during /loading keeps the pending /app/coach route intact
    clearPendingCheckoutPoll();
    expect(hasPendingCheckoutReturn()).toBe(false);
    expect(hasPendingCheckoutRoute()).toBe(true);

    clearPendingCheckoutRoute();
    expect(hasPendingCheckoutRoute()).toBe(false);

    // clearPendingCheckoutReturn wipes both flags at once (sign-out / delete account)
    window.history.replaceState(null, "", "/?checkout=success");
    capturePendingCheckoutReturnFromUrl();
    clearPendingCheckoutReturn();
    expect(hasPendingCheckoutReturn()).toBe(false);
    expect(hasPendingCheckoutRoute()).toBe(false);
  });
});
