import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capturePendingInviteFromUrl,
  clearPendingInviteCode,
  peekPendingInviteCode,
} from "./pendingInviteStorage";

describe("pendingInviteStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("captures ?invite=CODE from window.location.search, normalizes, and scrubs query parameter", () => {
    window.history.replaceState(null, "", "/?invite=beta-2026&view=coach#/login");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    const captured = capturePendingInviteFromUrl();

    expect(captured).toBe("BETA-2026");
    expect(peekPendingInviteCode()).toBe("BETA-2026");
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?view=coach");
    expect(window.location.hash).toBe("#/login");
  });

  it("captures ?invite=CODE from initial hash-router URL before auth/loading redirects strip params", () => {
    window.history.replaceState(null, "", "/#/app/coach?tab=chat&invite=%20vip_tester%20");

    const captured = capturePendingInviteFromUrl();

    expect(captured).toBe("VIP_TESTER");
    expect(peekPendingInviteCode()).toBe("VIP_TESTER");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#/app/coach?tab=chat");
  });

  it("scrubs URL cleanly when invite is the sole query param in search or hash and supports clear", () => {
    window.history.replaceState(null, "", "/#/?invite=alpha99");
    expect(capturePendingInviteFromUrl()).toBe("ALPHA99");
    expect(window.location.hash).toBe("#/");

    clearPendingInviteCode();
    expect(peekPendingInviteCode()).toBeNull();
  });

  it("ignores empty or non-string invite values and leaves clean URLs untouched", () => {
    window.history.replaceState(null, "", "/#/app/home?invite=%20%20");
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    expect(capturePendingInviteFromUrl()).toBe("   ".trim() || null);
    expect(peekPendingInviteCode()).toBeNull();
    // Empty ?invite= should still be scrubbed without leaving stray empty params
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/app/home");

    replaceSpy.mockClear();
    window.history.replaceState(null, "", "/#/app/home");
    replaceSpy.mockClear();
    expect(capturePendingInviteFromUrl()).toBeNull();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("matches ?invite= parameter names case-insensitively and scrubs all variants", () => {
    window.history.replaceState(null, "", "/?Invite=mixedCase#/app/coach?INVITE=second");

    expect(capturePendingInviteFromUrl()).toBe("MIXEDCASE");
    expect(peekPendingInviteCode()).toBe("MIXEDCASE");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#/app/coach");
  });

  it("extracts a valid code when repeated ?invite= params start with an empty value", () => {
    window.history.replaceState(null, "", "/?invite=&invite=BETA2026&view=coach");

    expect(capturePendingInviteFromUrl()).toBe("BETA2026");
    expect(peekPendingInviteCode()).toBe("BETA2026");
    expect(window.location.search).toBe("?view=coach");
  });
});
