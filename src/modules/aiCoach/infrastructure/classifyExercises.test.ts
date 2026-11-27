import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureMessageMock, captureExceptionMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@sentry/vue", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: captureMessageMock,
  captureException: captureExceptionMock,
}));

import { classifyExercises } from "./classifyExercises";

describe("classifyExercises", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty classifications without calling the backend for empty input", async () => {
    const result = await classifyExercises([], "test-access-token");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ classifications: [] });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the ai-coach Edge Function and parses the response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        text: JSON.stringify({
          classifications: [
            {
              exerciseName: "Bench Press",
              primaryMuscle: "Chest",
              confidence: 0.99,
            },
          ],
        }),
      }),
    });

    const result = await classifyExercises(["Bench Press"], "test-access-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/functions/v1/ai-coach");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-access-token");
    expect(JSON.parse(init.body as string)).toMatchObject({
      action: "classify",
      exerciseNames: ["Bench Press"],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.classifications[0]?.primaryMuscle).toBe("Chest");
    }
  });

  it("maps HTTP 429 from the Edge Function to rate-limit-exceeded and hydrates entitlement if present", async () => {
    const entitlement = {
      source: "free_allowance" as const,
      canUseCoach: true,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:00:00.000Z",
      freeAllowance: { coachUsed: 2, coachLimit: 30, classifyUsed: 20, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate-limit-exceeded", entitlement }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onEntitlementUpdate = vi.fn();

    const result = await classifyExercises(
      ["Bench Press"],
      "test-access-token",
      onEntitlementUpdate,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("rate-limit-exceeded");
    }
    expect(onEntitlementUpdate).toHaveBeenCalledWith(entitlement);
  });

  it("maps HTTP 402 to payment-required without Sentry noise and invokes onEntitlementUpdate", async () => {
    const entitlement = {
      source: "free_allowance" as const,
      canUseCoach: true,
      canUseClassify: false,
      evaluatedAt: "2026-11-26T12:00:00.000Z",
      freeAllowance: { coachUsed: 5, coachLimit: 30, classifyUsed: 40, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "payment-required", entitlement }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onEntitlementUpdate = vi.fn();

    const result = await classifyExercises(
      ["Bench Press"],
      "test-access-token",
      onEntitlementUpdate,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("payment-required");
    }
    expect(onEntitlementUpdate).toHaveBeenCalledWith(entitlement);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("forwards piggybacked entitlement from 200 classify response", async () => {
    const entitlement = {
      source: "free_allowance" as const,
      canUseCoach: true,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:00:00.000Z",
      freeAllowance: { coachUsed: 1, coachLimit: 30, classifyUsed: 1, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        text: JSON.stringify({
          classifications: [
            { exerciseName: "Bench Press", primaryMuscle: "Chest", confidence: 0.99 },
          ],
        }),
        entitlement,
      }),
    });
    const onEntitlementUpdate = vi.fn();

    const result = await classifyExercises(
      ["Bench Press"],
      "test-access-token",
      onEntitlementUpdate,
    );
    expect(result.isOk()).toBe(true);
    expect(onEntitlementUpdate).toHaveBeenCalledWith(entitlement);
  });

  it("returns coaching-request-failed and captures exception for malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ text: "not-json" }),
    });

    const result = await classifyExercises(["Bench Press"], "test-access-token");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("coaching-request-failed");
    }
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it("returns unauthorized without calling the backend when accessToken is undefined", async () => {
    const result = await classifyExercises(["Bench Press"], undefined);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("unauthorized");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
