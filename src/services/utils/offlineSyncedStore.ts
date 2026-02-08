import { useAsyncState, useDebounceFn, useDocumentVisibility, useOnline } from "@vueuse/core";

import type { Result } from "neverthrow";
import { ref, watch } from "vue";

type UseOfflineSyncedStoreParams<T> = {
  getId: (item: T) => string;
  fetchRemote: () => Promise<Result<T[], unknown>>;
  addRemote: (item: T) => Promise<Result<void, unknown>>;
  removeRemote: (item: T) => Promise<Result<void, unknown>>;
  updateRemote?: (item: T) => Promise<Result<void, unknown>>;
};

/**
 * Simplified offline store that relies on Workbox BackgroundSync for request queuing.
 * Workbox handles retry logic, persistence, and deduplication at the service worker level.
 */
export function useOfflineSyncedStore<T>({
  getId,
  fetchRemote,
  addRemote,
  removeRemote,
  updateRemote,
}: UseOfflineSyncedStoreParams<T>) {
  const isOnline = useOnline();
  const isRefreshing = ref(false);

  const { state: items, isLoading } = useAsyncState(async () => {
    const result = await fetchRemote();
    if (result.isErr()) return [];
    return result.value;
  }, []);

  // Auto-sync when switching between PWA and browser (separate localStorage contexts)
  const visibility = useDocumentVisibility();

  // Debounce refresh to avoid hammering API on rapid visibility changes
  const debouncedRefresh = useDebounceFn(async () => {
    if (isOnline.value) {
      console.log("App visible. Syncing with remote to prevent stale data...");
      await refresh();
    }
  }, 1000);

  watch(visibility, (current) => {
    if (current === "visible") {
      debouncedRefresh();
    }
  });

  async function refresh() {
    if (isRefreshing.value) return; // Prevent concurrent refreshes
    isRefreshing.value = true;

    try {
      // Re-fetch remote data to get latest from other instances
      const result = await fetchRemote();
      if (result.isOk()) {
        items.value = result.value;
      }
    } finally {
      isRefreshing.value = false;
    }
  }

  async function add(item: T) {
    // Optimistically update UI - create new array to trigger reactivity
    items.value = [...items.value, item];

    // Call API - Workbox will queue if offline
    const result = await addRemote(item);
    if (result.isErr()) {
      // Revert on immediate error (e.g., validation failure)
      const itemId = getId(item);
      items.value = items.value.filter((i) => getId(i) !== itemId);
    }
  }

  async function remove(item: T) {
    // Optimistically update UI
    const originalItems = [...items.value];
    const itemId = getId(item);
    items.value = items.value.filter((i) => getId(i) !== itemId);

    // Call API - Workbox will queue if offline
    const result = await removeRemote(item);
    if (result.isErr()) {
      // Revert on immediate error
      items.value = originalItems;
    }
  }

  async function update(item: T) {
    if (!updateRemote) {
      console.warn("updateRemote handler not provided");
      return;
    }

    // Optimistically update UI
    const itemId = getId(item);
    const index = items.value.findIndex((i) => getId(i) === itemId);
    if (index !== -1) {
      const newItems = [...items.value];
      newItems[index] = item;
      items.value = newItems;
    }

    // Call API - Workbox will queue if offline
    const result = await updateRemote(item);
    if (result.isErr()) {
      // Could revert here, but typically updates are idempotent
      // and will be retried by Workbox
    }
  }

  return { items, isLoading, isOnline, isRefreshing, add, remove, update, refresh };
}
