import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "./exerciseLogs";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  SESSION_INACTIVITY_MS,
  SESSION_MAX_WINDOW_MS,
} from "./workoutSession";

function createLog(exerciseName: string, loggedAt: Date): ExerciseLog {
  return { id: crypto.randomUUID(), exerciseName, loggedAt };
}

/** Returns a fixed "now" timestamp and a helper that creates logs relative to it. */
function buildClock(nowIso: string) {
  const now = new Date(nowIso).getTime();
  const minsAgo = (mins: number) => new Date(now - mins * 60_000);
  const minsLater = (mins: number) => new Date(now + mins * 60_000);
  return { now, minsAgo, minsLater };
}

describe("resolveCurrentSession", () => {
  it("returns null when there are no logs", () => {
    expect(resolveCurrentSession([], Date.now())).toBeNull();
  });

  it("returns null when all logs are older than the 8-hour window", () => {
    const { now, minsAgo } = buildClock("2026-05-08T10:00:00");
    const logs = [
      createLog("Squat", minsAgo(SESSION_MAX_WINDOW_MS / 60_000 + 1)),
      createLog("Bench Press", minsAgo(SESSION_MAX_WINDOW_MS / 60_000 + 60)),
    ];
    expect(resolveCurrentSession(logs, now)).toBeNull();
  });

  it("returns null when last log is older than the inactivity threshold (post-workout)", () => {
    const { now, minsAgo } = buildClock("2026-05-08T10:00:00");
    const logs = [createLog("Squat", minsAgo(SESSION_INACTIVITY_MS / 60_000 + 1))];
    expect(resolveCurrentSession(logs, now)).toBeNull();
  });

  it("returns a session when last log is exactly AT the inactivity threshold (inclusive — > not >=)", () => {
    const { now, minsAgo } = buildClock("2026-05-08T10:00:00");
    // Exactly 45 minutes = still active (the check is strictly > 45 min)
    const logs = [createLog("Squat", minsAgo(45))];
    const session = resolveCurrentSession(logs, now);
    expect(session).not.toBeNull();
    expect(session?.phase).toBe("mid-workout");
  });

  it("returns null when last log is 1ms past the inactivity threshold", () => {
    const { now } = buildClock("2026-05-08T10:00:00");
    // 45 minutes + 1 ms ago → null
    const logs = [createLog("Squat", new Date(now - SESSION_INACTIVITY_MS - 1))];
    expect(resolveCurrentSession(logs, now)).toBeNull();
  });

  it("returns a session when last log is within the inactivity window", () => {
    const { now, minsAgo } = buildClock("2026-05-08T10:00:00");
    const logs = [
      createLog("Squat", minsAgo(30)),
      createLog("Bench Press", minsAgo(20)),
      createLog("Deadlift", minsAgo(10)),
    ];
    const session = resolveCurrentSession(logs, now);
    expect(session).not.toBeNull();
    expect(session?.phase).toBe("mid-workout");
    expect(session?.logs).toHaveLength(3);
  });

  it("session.startTime is the earliest log in the window, not the latest", () => {
    const { now, minsAgo } = buildClock("2026-05-08T10:00:00");
    const first = minsAgo(60);
    const last = minsAgo(5);
    const logs = [
      createLog("Squat", last), // intentionally out-of-order
      createLog("Bench Press", first),
    ];
    const session = resolveCurrentSession(logs, now);
    expect(session?.startTime).toEqual(first);
  });

  it("session.logs are sorted ascending by loggedAt", () => {
    const { now, minsAgo } = buildClock("2026-05-08T10:00:00");
    const logs = [
      createLog("C", minsAgo(5)),
      createLog("A", minsAgo(30)),
      createLog("B", minsAgo(15)),
    ];
    const session = resolveCurrentSession(logs, now);
    const times = session?.logs.map((l) => l.loggedAt.getTime()) ?? [];
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  // ── Midnight-crossing scenarios ──────────────────────────────────────────

  it("handles midnight crossing: session started at 23:30, now is 00:20 — session is active", () => {
    // "now" is 00:20 on May 9
    const now = new Date("2026-05-09T00:20:00").getTime();
    const log1 = createLog("Squat", new Date("2026-05-08T23:30:00")); // 50 min ago
    const log2 = createLog("Bench Press", new Date("2026-05-08T23:50:00")); // 30 min ago
    const log3 = createLog("Row", new Date("2026-05-09T00:05:00")); // 15 min ago

    const session = resolveCurrentSession([log1, log2, log3], now);
    expect(session).not.toBeNull();
    expect(session?.phase).toBe("mid-workout");
    expect(session?.logs).toHaveLength(3);
  });

  it("handles midnight crossing: sessionDate uses the start date (yesterday), not today", () => {
    const now = new Date("2026-05-09T00:20:00").getTime();
    const logs = [
      createLog("Squat", new Date("2026-05-08T23:30:00")),
      createLog("Bench Press", new Date("2026-05-09T00:05:00")),
    ];
    const session = resolveCurrentSession(logs, now);
    // sessionDate should be May 8, not May 9
    const expectedDate = new Date("2026-05-08T23:30:00").toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    expect(session?.sessionDate).toBe(expectedDate);
  });

  it("handles midnight crossing: session ended before midnight — last log 70min ago → null", () => {
    const now = new Date("2026-05-09T00:40:00").getTime();
    const logs = [
      createLog("Squat", new Date("2026-05-08T23:30:00")), // 70 min ago
    ];
    expect(resolveCurrentSession(logs, now)).toBeNull();
  });

  it("excludes logs outside the 8-hour window even during an active session", () => {
    const { now, minsAgo } = buildClock("2026-05-08T10:00:00");
    const logs = [
      createLog("Warmup", minsAgo(SESSION_MAX_WINDOW_MS / 60_000 + 30)), // outside window
      createLog("Squat", minsAgo(60)),
      createLog("Bench Press", minsAgo(10)),
    ];
    const session = resolveCurrentSession(logs, now);
    expect(session).not.toBeNull();
    expect(session?.logs).toHaveLength(2); // only the 2 within the window
  });

  it("uses current time by default (no now param) without throwing", () => {
    expect(() => resolveCurrentSession([])).not.toThrow();
  });
});

describe("getSessionStartBoundary", () => {
  it("returns session.startTime when session is active", () => {
    const { now, minsAgo } = buildClock("2026-05-08T10:00:00");
    const logs = [createLog("Squat", minsAgo(20))];
    const session = resolveCurrentSession(logs, now);
    // logs[0] is defined — we just constructed the array with one element above.
    expect(getSessionStartBoundary(session, now)).toBe(logs[0]!.loggedAt.getTime());
  });

  it("returns start-of-current-day when no session", () => {
    const now = new Date("2026-05-08T10:30:00").getTime();
    const startOfDay = new Date("2026-05-08T00:00:00").setHours(0, 0, 0, 0);
    expect(getSessionStartBoundary(null, now)).toBe(startOfDay);
  });

  it("midnight crossing: boundary is the session start on the previous day", () => {
    const now = new Date("2026-05-09T00:20:00").getTime();
    const sessionStart = new Date("2026-05-08T23:30:00");
    const logs = [
      createLog("Squat", sessionStart),
      createLog("Bench Press", new Date("2026-05-09T00:05:00")),
    ];
    const session = resolveCurrentSession(logs, now);
    expect(getSessionStartBoundary(session, now)).toBe(sessionStart.getTime());
  });
});
