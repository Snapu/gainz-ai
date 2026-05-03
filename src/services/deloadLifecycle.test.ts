import { describe, expect, it } from "vitest";
import {
  applyDeloadLifecycleTransition,
  consumePostStopConservativeSession,
  getDeloadTimeRemainingMs,
  getMesocycleWeekFromLifecycle,
  type DeloadLifecycle,
} from "./deloadLifecycle";

describe("applyDeloadLifecycleTransition", () => {
  it("auto-starts deload immediately on recommendation trigger", () => {
    const now = new Date("2026-05-02T10:00:00.000Z");
    const lifecycle = applyDeloadLifecycleTransition(
      undefined,
      {
        shouldDeload: true,
        reason: "Volume has increased for 4 consecutive weeks",
        snapshot: { weeklyTotalSets: [10, 12, 14, 18], weeklyTonnage: [3000, 3400, 3900, 5200] },
      },
      { now },
    );

    expect(lifecycle.status).toBe("active");
    expect(lifecycle.startedAtIso).toBe("2026-05-02T10:00:00.000Z");
    expect(lifecycle.endsAtIso).toBe("2026-05-09T10:00:00.000Z");
    expect(lifecycle.triggerReason).toContain("4 consecutive weeks");
    expect(lifecycle.triggerSnapshot?.weeklyTotalSets).toEqual([10, 12, 14, 18]);
  });

  it("does not duplicate-start while already active", () => {
    const active: DeloadLifecycle = {
      status: "active",
      startedAtIso: "2026-05-02T10:00:00.000Z",
      endsAtIso: "2026-05-09T10:00:00.000Z",
      recommendationIssuedAtIso: "2026-05-02T10:00:00.000Z",
      currentBlockStartedAtIso: "2026-04-05T10:00:00.000Z",
    };

    const lifecycle = applyDeloadLifecycleTransition(
      active,
      { shouldDeload: true },
      {
        now: new Date("2026-05-05T10:00:00.000Z"),
      },
    );

    expect(lifecycle.startedAtIso).toBe("2026-05-02T10:00:00.000Z");
    expect(lifecycle.endsAtIso).toBe("2026-05-09T10:00:00.000Z");
  });

  it("auto-ends exactly at boundary and starts new block from end timestamp", () => {
    const active: DeloadLifecycle = {
      status: "active",
      startedAtIso: "2026-05-02T10:00:00.000Z",
      endsAtIso: "2026-05-09T10:00:00.000Z",
      currentBlockStartedAtIso: "2026-04-05T10:00:00.000Z",
    };

    const lifecycle = applyDeloadLifecycleTransition(
      active,
      { shouldDeload: false },
      {
        now: new Date("2026-05-09T10:00:00.000Z"),
      },
    );

    expect(lifecycle.status).toBe("inactive");
    expect(lifecycle.lastEndedAtIso).toBe("2026-05-09T10:00:00.000Z");
    expect(lifecycle.currentBlockStartedAtIso).toBe("2026-05-09T10:00:00.000Z");
  });

  it("manual stop ends deload immediately and resets mesocycle anchor", () => {
    const active: DeloadLifecycle = {
      status: "active",
      startedAtIso: "2026-05-02T10:00:00.000Z",
      endsAtIso: "2026-05-09T10:00:00.000Z",
      currentBlockStartedAtIso: "2026-04-05T10:00:00.000Z",
    };

    const now = new Date("2026-05-04T10:00:00.000Z");
    const lifecycle = applyDeloadLifecycleTransition(
      active,
      { shouldDeload: false },
      {
        now,
        manualStop: true,
        conservativeSessionsAfterManualStop: 2,
      },
    );

    expect(lifecycle.status).toBe("inactive");
    expect(lifecycle.lastEndedAtIso).toBe("2026-05-04T10:00:00.000Z");
    expect(lifecycle.currentBlockStartedAtIso).toBe("2026-05-04T10:00:00.000Z");
    expect(lifecycle.postStopConservativeSessionsRemaining).toBe(2);
  });

  it("applies end-boundary precedence then re-starts if trigger still true", () => {
    const active: DeloadLifecycle = {
      status: "active",
      startedAtIso: "2026-05-02T10:00:00.000Z",
      endsAtIso: "2026-05-09T10:00:00.000Z",
      currentBlockStartedAtIso: "2026-04-05T10:00:00.000Z",
    };

    const lifecycle = applyDeloadLifecycleTransition(
      active,
      { shouldDeload: true, reason: "Still overreached" },
      {
        now: new Date("2026-05-09T10:00:00.000Z"),
      },
    );

    expect(lifecycle.status).toBe("active");
    expect(lifecycle.startedAtIso).toBe("2026-05-09T10:00:00.000Z");
    expect(lifecycle.endsAtIso).toBe("2026-05-16T10:00:00.000Z");
  });
  it("does not re-start deload immediately after manual stop during cooldown", () => {
    const active: DeloadLifecycle = {
      status: "active",
      startedAtIso: "2026-05-02T10:00:00.000Z",
      endsAtIso: "2026-05-09T10:00:00.000Z",
      currentBlockStartedAtIso: "2026-04-05T10:00:00.000Z",
    };

    const stopped = applyDeloadLifecycleTransition(
      active,
      { shouldDeload: false },
      { now: new Date("2026-05-04T10:00:00.000Z"), manualStop: true },
    );

    const restartedAttempt = applyDeloadLifecycleTransition(
      stopped,
      { shouldDeload: true, reason: "still high fatigue" },
      { now: new Date("2026-05-04T10:30:00.000Z") },
    );

    expect(restartedAttempt.status).toBe("inactive");
    expect(restartedAttempt.startedAtIso).toBe("2026-05-02T10:00:00.000Z");
  });

  it("allows re-start after cooldown window elapses", () => {
    const inactive: DeloadLifecycle = {
      status: "inactive",
      lastEndedAtIso: "2026-05-04T10:00:00.000Z",
      currentBlockStartedAtIso: "2026-05-04T10:00:00.000Z",
    };

    const restarted = applyDeloadLifecycleTransition(
      inactive,
      { shouldDeload: true, reason: "new trigger" },
      { now: new Date("2026-05-05T00:30:00.000Z") },
    );

    expect(restarted.status).toBe("active");
    expect(restarted.startedAtIso).toBe("2026-05-05T00:30:00.000Z");
  });

});

describe("mesocycle and pause helpers", () => {
  it("returns week 0 while deload is active", () => {
    const lifecycle: DeloadLifecycle = {
      status: "active",
      startedAtIso: "2026-05-02T10:00:00.000Z",
      endsAtIso: "2026-05-09T10:00:00.000Z",
      currentBlockStartedAtIso: "2026-04-05T10:00:00.000Z",
    };
    expect(getMesocycleWeekFromLifecycle(lifecycle, new Date("2026-05-04T10:00:00.000Z"))).toBe(0);
  });

  it("counts explicit weeks from block start", () => {
    const lifecycle: DeloadLifecycle = {
      status: "inactive",
      currentBlockStartedAtIso: "2026-05-01T00:00:00.000Z",
    };

    expect(getMesocycleWeekFromLifecycle(lifecycle, new Date("2026-05-01T00:00:00.000Z"))).toBe(1);
    expect(getMesocycleWeekFromLifecycle(lifecycle, new Date("2026-05-08T00:00:00.000Z"))).toBe(2);
    expect(getMesocycleWeekFromLifecycle(lifecycle, new Date("2026-05-15T00:00:00.000Z"))).toBe(3);
  });

  it("returns remaining ms for active deload", () => {
    const lifecycle: DeloadLifecycle = {
      status: "active",
      startedAtIso: "2026-05-02T10:00:00.000Z",
      endsAtIso: "2026-05-09T10:00:00.000Z",
    };

    const remaining = getDeloadTimeRemainingMs(lifecycle, new Date("2026-05-05T10:00:00.000Z"));
    expect(remaining).toBe(4 * 86_400_000);
  });

  it("decrements conservative post-stop sessions", () => {
    const lifecycle: DeloadLifecycle = {
      status: "inactive",
      postStopConservativeSessionsRemaining: 2,
    };

    const next = consumePostStopConservativeSession(lifecycle);
    const final = consumePostStopConservativeSession(next);

    expect(next?.postStopConservativeSessionsRemaining).toBe(1);
    expect(final?.postStopConservativeSessionsRemaining).toBe(0);
  });
});
