/// <reference lib="webworker" />
/// <reference lib="webworker.iterable" />

import { BackgroundSyncPlugin } from "workbox-background-sync";
import type { PrecacheEntry } from "workbox-precaching";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry>;
};

// Precache app shell assets
precacheAndRoute(self.__WB_MANIFEST);

// Create a background sync plugin for Google Sheets API requests
const bgSyncPlugin = new BackgroundSyncPlugin("sheets-api-queue", {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
  onSync: async ({ queue }) => {
    let entry = await queue.shiftRequest();
    while (entry) {
      try {
        await fetch(entry.request.clone());
      } catch (error) {
        console.error("Replay failed for request", entry.request, error);
        // Put the request back in the queue if it failed
        await queue.unshiftRequest(entry);
        throw error;
      }
      entry = await queue.shiftRequest();
    }
  },
});

// Register routes for Google Sheets API requests (POST, PUT, DELETE)
(["POST", "PUT", "DELETE"] as const).forEach((method) => {
  registerRoute(
    ({ url }) => url.origin === "https://sheets.googleapis.com",
    new NetworkOnly({
      plugins: [bgSyncPlugin],
    }),
    method,
  );
});

// Notify the app when background sync completes successfully
self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag === "sheets-api-queue") {
    event.waitUntil(
      (async () => {
        // Notify all clients that sync completed
        const clients = await self.clients.matchAll();
        clients.forEach((client: Client) => {
          client.postMessage({
            type: "BACKGROUND_SYNC_SUCCESS",
            tag: event.tag,
          });
        });
      })(),
    );
  }
});

// Allow the service worker to control the page immediately
self.addEventListener("install", (event: ExtendableEvent) => {
  // Skip waiting to activate immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      // Delete old caches
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map(async (cacheName) => {
          // Delete old workbox precache versions
          if (cacheName.startsWith('workbox-precache-v2-') ||
              cacheName.startsWith('workbox-precache-')) {
            console.log('Deleting old cache:', cacheName);
            await caches.delete(cacheName);
          }
        })
      );

      // Take control of all clients immediately
      await self.clients.claim();
    })()
  );
});
