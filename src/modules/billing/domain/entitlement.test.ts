import { describe, expect, it } from "vitest";
import {
  canUseClassify,
  canUseCoach,
  type Entitlement,
  getRemainingFreeCoachCount,
  isFreeAllowance,
  isInPastDueGrace,
  isNewerOrEqualSnapshot,
} from "./entitlement";

function makeEntitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    source: "free_allowance",
    canUseCoach: true,
    canUseClassify: true,
    evaluatedAt: "2026-11-26T12:00:00.000Z",
    freeAllowance: {
      coachUsed: 5,
      coachLimit: 30,
      classifyUsed: 10,
      classifyLimit: 40,
    },
    subscription: null,
    inviteGrant: null,
    hasCustomerPortal: false,
    ...overrides,
  };
}

describe("Entitlement domain predicates", () => {
  it("allows optimistic cold-login pass-through when snapshot is null", () => {
    expect(canUseCoach(null)).toBe(true);
    expect(canUseClassify(null)).toBe(true);
    expect(isFreeAllowance(null)).toBe(false);
    expect(getRemainingFreeCoachCount(null)).toBe(30);
    expect(isInPastDueGrace(null)).toBe(false);
  });

  it("evaluates coach and classify capabilities independently", () => {
    const classifyExhausted = makeEntitlement({
      source: "free_allowance",
      canUseCoach: true,
      canUseClassify: false,
      freeAllowance: {
        coachUsed: 12,
        coachLimit: 30,
        classifyUsed: 40,
        classifyLimit: 40,
      },
    });
    expect(canUseCoach(classifyExhausted)).toBe(true);
    expect(canUseClassify(classifyExhausted)).toBe(false);
    expect(isFreeAllowance(classifyExhausted)).toBe(true);
    expect(getRemainingFreeCoachCount(classifyExhausted)).toBe(18);

    const coachExhausted = makeEntitlement({
      source: "none",
      canUseCoach: false,
      canUseClassify: false,
      freeAllowance: {
        coachUsed: 30,
        coachLimit: 30,
        classifyUsed: 40,
        classifyLimit: 40,
      },
    });
    expect(canUseCoach(coachExhausted)).toBe(false);
    expect(canUseClassify(coachExhausted)).toBe(false);
    expect(getRemainingFreeCoachCount(coachExhausted)).toBe(0);
  });

  it("ignores stale snapshots with older evaluatedAt timestamps", () => {
    const current = makeEntitlement({ evaluatedAt: "2026-11-26T12:05:00.000Z" });
    const older = makeEntitlement({ evaluatedAt: "2026-11-26T12:00:00.000Z" });
    const equal = makeEntitlement({ evaluatedAt: "2026-11-26T12:05:00.000Z" });
    const newer = makeEntitlement({ evaluatedAt: "2026-11-26T12:06:00.000Z" });

    expect(isNewerOrEqualSnapshot(older, null)).toBe(true);
    expect(isNewerOrEqualSnapshot(older, current)).toBe(false);
    expect(isNewerOrEqualSnapshot(equal, current)).toBe(true);
    expect(isNewerOrEqualSnapshot(newer, current)).toBe(true);
  });

  it("detects active past_due grace windows accurately", () => {
    const graceActive = makeEntitlement({
      source: "subscription",
      subscription: {
        status: "past_due",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-12-01T00:00:00.000Z",
        graceEndsAt: "2026-11-29T12:00:00.000Z",
      },
    });
    expect(isInPastDueGrace(graceActive, Date.parse("2026-11-27T00:00:00.000Z"))).toBe(true);
    expect(isInPastDueGrace(graceActive, Date.parse("2026-11-30T00:00:00.000Z"))).toBe(false);
  });
});
