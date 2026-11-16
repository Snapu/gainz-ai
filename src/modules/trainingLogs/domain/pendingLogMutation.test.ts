import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "./exerciseLog";
import {
  applyPendingMutations,
  dequeuePendingMutation,
  enqueuePendingMutation,
  type PendingLogMutation,
} from "./pendingLogMutation";

const LOG_ID_1 = "11111111-1111-4111-8111-111111111111";
const LOG_ID_2 = "22222222-2222-4222-8222-222222222222";
const LOG_ID_3 = "33333333-3333-4333-8333-333333333333";

const makeLog = (id: string, weight = 80, reps = 8): ExerciseLog => ({
  id,
  exerciseName: "Bench Press",
  weight,
  reps,
  loggedAt: new Date("2026-11-16T10:00:00Z"),
});

describe("pendingLogMutation", () => {
  it("coalesces add -> update into a single edited add and add -> delete into empty", () => {
    const initialLog = makeLog(LOG_ID_1, 80, 8);
    const updatedLog = makeLog(LOG_ID_1, 85, 6);

    let queue: PendingLogMutation[] = [];
    queue = enqueuePendingMutation(queue, { type: "add", log: initialLog });
    queue = enqueuePendingMutation(queue, { type: "update", log: updatedLog });

    expect(queue).toEqual([{ type: "add", log: updatedLog }]);

    queue = enqueuePendingMutation(queue, { type: "delete", log: updatedLog });
    expect(queue).toEqual([]);
  });

  it("coalesces update -> update and update -> delete on existing synced logs", () => {
    const v1 = makeLog(LOG_ID_1, 100, 5);
    const v2 = makeLog(LOG_ID_1, 105, 5);

    let queue: PendingLogMutation[] = [];
    queue = enqueuePendingMutation(queue, { type: "update", log: v1 });
    queue = enqueuePendingMutation(queue, { type: "update", log: v2 });
    expect(queue).toEqual([{ type: "update", log: v2 }]);

    queue = enqueuePendingMutation(queue, { type: "delete", log: v2 });
    expect(queue).toEqual([{ type: "delete", log: v2 }]);

    queue = dequeuePendingMutation(queue, LOG_ID_1);
    expect(queue).toEqual([]);
  });

  it("applies pending adds, updates, and deletes on top of remote logs without duplicates", () => {
    const remote1 = makeLog(LOG_ID_1, 100, 5);
    const remote2 = makeLog(LOG_ID_2, 60, 10);
    const pendingAdd = makeLog(LOG_ID_3, 80, 8);
    const editedRemote1 = makeLog(LOG_ID_1, 105, 5);

    const queue: PendingLogMutation[] = [
      { type: "update", log: editedRemote1 },
      { type: "delete", log: remote2 },
      { type: "add", log: pendingAdd },
    ];

    const merged = applyPendingMutations([remote1, remote2, pendingAdd], queue);

    expect(merged).toEqual([editedRemote1, pendingAdd]);
  });
});
