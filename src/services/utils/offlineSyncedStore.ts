import { useAsyncState, useLocalStorage, useOnline } from "@vueuse/core";

import type { Result } from "neverthrow";
import { computed, type Ref, ref, watch } from "vue";

type OperationType = "add" | "update" | "remove";

type PendingOperation<T> = {
  type: OperationType;
  item: T;
};

type UseOfflineSyncedStoreParams<T> = {
  key: string;
  getId: (item: T) => string;
  fetchRemote: () => Promise<Result<T[], unknown>>;
  addRemote: (item: T) => Promise<Result<void, unknown>>;
  removeRemote: (item: T) => Promise<Result<void, unknown>>;
  updateRemote?: (item: T) => Promise<Result<void, unknown>>;
};

export function useOfflineSyncedStore<T>({
  key,
  getId,
  fetchRemote,
  addRemote,
  removeRemote,
  updateRemote,
}: UseOfflineSyncedStoreParams<T>) {
  const localCache = ref<T[]>([]) as Ref<T[]>;
  const pending = useLocalStorage<PendingOperation<T>[]>(`pending:${key}`, []);
  const isOnline = useOnline();

  const remoteHandlers = {
    add: addRemote,
    update: updateRemote,
    remove: removeRemote,
  };

  function queueOperation(op: PendingOperation<T>) {
    pending.value.push(op);
  }

  async function syncPending() {
    if (!isOnline.value || pending.value.length === 0) return;

    const queue = [...pending.value];
    const leftovers: typeof queue = [];

    for (const op of queue) {
      const handler = remoteHandlers[op.type];
      if (!handler) {
        console.warn(`No handler for operation type: ${op.type}`);
        continue;
      }

      const result = await handler(op.item);
      // Keep failed operation in queue
      if (result.isErr()) {
        leftovers.push(op);
      } else if (result.isOk() && op.type === "add") {
        // Move successfully synced items from localCache to remoteItems
        const itemId = getId(op.item);
        localCache.value = localCache.value.filter((i) => getId(i) !== itemId);
        remoteItems.value.push(op.item);
      }
    }

    pending.value = leftovers;
  }

  const { state: remoteItems, isLoading } = useAsyncState(async () => {
    await syncPending();
    const result = await fetchRemote();
    if (result.isErr()) return [];
    return result.value;
  }, []);

  // Auto-retry pending operations when coming back online
  watch(isOnline, (online) => {
    if (online && pending.value.length > 0) {
      console.log("Connection restored. Syncing pending operations...");
      syncPending();
    }
  });

  const items = computed(() => [...remoteItems.value, ...localCache.value]);

  async function add(item: T) {
    // Add to local cache immediately for optimistic UI
    localCache.value.push(item);

    const result = await addRemote(item);
    if (result.isOk()) {
      // Move from localCache to remoteItems on success
      const itemId = getId(item);
      localCache.value = localCache.value.filter((i) => getId(i) !== itemId);
      remoteItems.value.push(item);
    } else {
      // Queue for later sync if failed
      queueOperation({ type: "add", item });
    }
  }

  async function remove(item: T) {
    const itemId = getId(item);

    // Remove from both caches immediately for optimistic UI
    remoteItems.value = remoteItems.value.filter((i) => getId(i) !== itemId);
    localCache.value = localCache.value.filter((i) => getId(i) !== itemId);

    const result = await removeRemote(item);
    if (result.isErr()) {
      // Queue for later sync if failed
      queueOperation({ type: "remove", item });
    }
  }

  async function update(item: T) {
    if (!updateRemote) {
      console.warn("updateRemote handler not provided");
      return;
    }

    const itemId = getId(item);

    // Update in remoteItems if it exists there
    const remoteIndex = remoteItems.value.findIndex((i) => getId(i) === itemId);
    if (remoteIndex !== -1) {
      remoteItems.value[remoteIndex] = item;
    }

    // Update in localCache if it exists there, otherwise add it
    const localIndex = localCache.value.findIndex((i) => getId(i) === itemId);
    if (localIndex === -1) {
      localCache.value.push(item);
    } else {
      localCache.value[localIndex] = item;
    }

    const result = await updateRemote(item);
    if (result.isOk()) {
      // Move from localCache to remoteItems on success if needed
      localCache.value = localCache.value.filter((i) => getId(i) !== itemId);
      if (remoteIndex === -1) {
        remoteItems.value.push(item);
      }
    } else {
      // Queue for later sync if failed
      queueOperation({ type: "update", item });
    }
  }

  return { items, isLoading, isOnline, add, remove, update, syncPending };
}
