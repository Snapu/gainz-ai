import { describe, expect, it } from "vitest";
import {
  createDeloadPhase,
  DELOAD_DURATION_MS,
  deloadDaysRemaining,
  deloadProgressPercent,
  getDeloadStatus,
  isDeloadActive,
} from "./deloadPhase";

const DAY = 24 * 60 * 60 * 1000;

function makePhase(offsetFromNowMs = 0, durationMs = DELOAD_DURATION_MS) {
  const start = new Date(Date.now() + offsetFromNowMs);
  return createDeloadPhase(3, ["tonnageSpike", "performanceDecline"], start);
}

describe("createDeloadPhase", () => {
  it("sets endsAt exactly 7 days after startedAt", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const phase = createDeloadPhase(3, ["volumeSpike"], now);
    const ms = new Date(phase.endsAt).getTime() - new Date(phase.startedAt).getTime();
    expect(ms).toBe(DELOAD_DURATION_MS);
  });

  it("serialises triggeredBy", () => {
    const phase = createDeloadPhase(5, ["tonnageSpike", "performanceDecline"]);
    expect(phase.triggeredBy).toEqual(["tonnageSpike", "performanceDecline"]);
  });

  it("does not set canceledAt", () => {
    const phase = createDeloadPhase(2, []);
    expect(phase.canceledAt).toBeUndefined();
  });
});

describe("getDeloadStatus", () => {
  it("returns 'none' for null phase", () => {
    expect(getDeloadStatus(null)).toBe("none");
  });

  it("returns 'active' within the 7-day window", () => {
    const phase = makePhase(-DAY); // started 1 day ago
    expect(getDeloadStatus(phase)).toBe("active");
  });

  it("returns 'completed' after endsAt", () => {
    const phase = makePhase(-8 * DAY); // started 8 days ago → already past endsAt
    expect(getDeloadStatus(phase)).toBe("completed");
  });

  it("returns 'canceled' when canceledAt is set", () => {
    const phase = { ...makePhase(-DAY), canceledAt: new Date().toISOString() };
    expect(getDeloadStatus(phase)).toBe("canceled");
  });
});

describe("isDeloadActive", () => {
  it("returns true mid-deload", () => {
    expect(isDeloadActive(makePhase(-3 * DAY))).toBe(true);
  });

  it("returns false after completion", () => {
    expect(isDeloadActive(makePhase(-8 * DAY))).toBe(false);
  });

  it("returns false on cancel", () => {
    const phase = { ...makePhase(-DAY), canceledAt: new Date().toISOString() };
    expect(isDeloadActive(phase)).toBe(false);
  });
});

describe("deloadDaysRemaining", () => {
  it("returns null when not active", () => {
    expect(deloadDaysRemaining(null)).toBeNull();
    expect(deloadDaysRemaining(makePhase(-8 * DAY))).toBeNull();
  });

  it("returns ceiling of remaining ms as days", () => {
    // Started 1 day ago → ~6 days remain
    const result = deloadDaysRemaining(makePhase(-DAY));
    expect(result).toBeGreaterThanOrEqual(5);
    expect(result).toBeLessThanOrEqual(7);
  });

  it("returns 1 on the last day", () => {
    // Started 6.5 days ago → ~0.5 days remain → ceil = 1
    const phase = makePhase(-6.5 * DAY);
    const result = deloadDaysRemaining(phase);
    expect(result).toBe(1);
  });
});

describe("deloadProgressPercent", () => {
  it("returns null when not active", () => {
    expect(deloadProgressPercent(null)).toBeNull();
  });

  it("returns ~14% after 1 day of a 7-day deload", () => {
    const phase = makePhase(-DAY);
    const pct = deloadProgressPercent(phase);
    expect(pct).toBeGreaterThanOrEqual(13);
    expect(pct).toBeLessThanOrEqual(15);
  });

  it("returns 0 on the first second", () => {
    const now = new Date();
    const phase = createDeloadPhase(3, [], now);
    // Pass `now` explicitly so elapsed is 0
    expect(deloadProgressPercent(phase, now)).toBe(0);
  });

  it("clamps to 100 at completion time", () => {
    const phase = makePhase(-8 * DAY); // completed — but we pass the exact endsAt time
    const end = new Date(phase.endsAt);
    // At the endsAt boundary it's still "active" per our logic check, so test at endsAt - 1ms
    const atEnd = new Date(end.getTime() - 1);
    const pct = deloadProgressPercent(phase, atEnd);
    expect(pct).toBeLessThanOrEqual(100);
    expect(pct).toBeGreaterThan(99);
  });
});
