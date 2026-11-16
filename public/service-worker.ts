/// <reference lib="webworker" />
/// <reference lib="webworker.iterable" />

import { Queue } from "workbox-background-sync";
import type { PrecacheEntry } from "workbox-precaching";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";
import {
  replaySyncQueue,
  shouldQueueSheetsWrite,
  updateQueueAuthHeaders,
} from "../src/modules/platform/infrastructure/serviceWorkerSync";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry>;
};

const QUEUE_NAME = "sheets-api-queue";

// Clean up old caches automatically
cleanupOutdatedCaches();

// Precache app shell assets
precacheAndRoute(self.__WB_MANIFEST);

async function notifyClients(message: Record<string, unknown>): Promise<void> {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage(message);
  }
}

const sheetsQueue = new Queue(QUEUE_NAME, {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
  onSync: ({ queue }) =>
    replaySyncQueue(queue, {
      onAuthRequired: () => notifyClients({ type: "BACKGROUND_SYNC_AUTH_REQUIRED" }),
      onSuccess: () => notifyClients({ type: "BACKGROUND_SYNC_SUCCESS", tag: QUEUE_NAME }),
    }),
});

// Register routes for non-Log Sheets writes (Profile, Metrics, Deload, etc.).
// Logs* writes are owned by exerciseLogsStore; volatile :batchUpdate calls are excluded.
(["POST", "PUT", "DELETE"] as const).forEach((method) => {
  registerRoute(
    ({ url }) => shouldQueueSheetsWrite(url),
    new NetworkOnly({
      plugins: [
        {
          fetchDidFail: async ({ request }) => {
            await sheetsQueue.pushRequest({ request });
          },
        },
      ],
    }),
    method,
  );
});

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string; accessToken?: unknown } | null;
  if (!data?.type) return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "AUTH_TOKEN_UPDATED" && typeof data.accessToken === "string") {
    event.waitUntil(updateQueueAuthHeaders(sheetsQueue, data.accessToken));
    return;
  }

  if (data.type === "CLEAR_SYNC_QUEUE") {
    event.waitUntil(
      (async () => {
        while (await sheetsQueue.shiftRequest()) {
          // Drain queued requests for logged-out session
        }
      })(),
    );
  }
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});
