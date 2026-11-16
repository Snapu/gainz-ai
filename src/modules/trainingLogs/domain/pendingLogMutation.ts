import { z } from "zod";
import { type ExerciseLog, ExerciseLogSchema } from "./exerciseLog";

export const PendingLogMutationSchema = z.object({
  type: z.enum(["add", "update", "delete"]),
  log: ExerciseLogSchema,
});

export type PendingLogMutation = z.infer<typeof PendingLogMutationSchema>;

export function enqueuePendingMutation(
  queue: readonly PendingLogMutation[],
  next: PendingLogMutation,
): PendingLogMutation[] {
  const existingIndex = queue.findIndex((entry) => entry.log.id === next.log.id);
  if (existingIndex === -1) {
    return [...queue, next];
  }

  const existing = queue[existingIndex];
  const updatedQueue = [...queue];

  if (existing?.type === "add" && next.type === "update") {
    updatedQueue[existingIndex] = { type: "add", log: next.log };
    return updatedQueue;
  }

  if (existing?.type === "add" && next.type === "delete") {
    updatedQueue.splice(existingIndex, 1);
    return updatedQueue;
  }

  updatedQueue[existingIndex] = next;
  return updatedQueue;
}

export function dequeuePendingMutation(
  queue: readonly PendingLogMutation[],
  logId: string,
): PendingLogMutation[] {
  return queue.filter((entry) => entry.log.id !== logId);
}

export function applyPendingMutations(
  remoteLogs: readonly ExerciseLog[],
  queue: readonly PendingLogMutation[],
): ExerciseLog[] {
  const merged = [...remoteLogs];

  for (const mutation of queue) {
    const id = mutation.log.id;
    const idx = merged.findIndex((item) => item.id === id);

    if (mutation.type === "delete") {
      if (idx !== -1) {
        merged.splice(idx, 1);
      }
      continue;
    }

    if (idx === -1) {
      merged.push(mutation.log);
    } else {
      merged[idx] = mutation.log;
    }
  }

  return merged;
}
