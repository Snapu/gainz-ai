import { useAsyncState, useDebounceFn, useDocumentVisibility, useOnline } from "@vueuse/core";

import { errAsync, okAsync, type Result, ResultAsync } from "neverthrow";
import { ref, watch } from "vue";

type UseOfflineSyncedStoreParams<T, FetchE, AddE, RemoveE, UpdateE = never> = {
  getId: (item: T) => string;
  fetchRemote: () => ResultAsync<T[], FetchE>;
  addRemote: (item: T) => ResultAsync<void, AddE>;
  removeRemote: (item: T) => ResultAsync<void, RemoveE>;
  updateRemote?: (item: T) => ResultAsync<void, UpdateE>;
};

function unwrapAwaitedResult<T, E>(
  resultLike: ResultAsync<T, E>,
  mapThrownError: (error: unknown) => E,
): ResultAsync<T, E> {
  return ResultAsync.fromPromise((async () => await resultLike)(), mapThrownError).andThen(
    (result) =>
      result.match(
        (value) => okAsync(value),
        (error) => errAsync(error),
      ),
  );
}

/**
 * Simplified offline store that relies on Workbox BackgroundSync for request queuing.
 * Workbox handles retry logic, persistence, and deduplication at the service worker level.
 */
export function useOfflineSyncedStore<T, FetchE, AddE, RemoveE, UpdateE = never>({
  getId,
  fetchRemote,
  addRemote,
  removeRemote,
  updateRemote,
}: UseOfflineSyncedStoreParams<T, FetchE, AddE, RemoveE, UpdateE>) {
  const isOnline = useOnline();
  const isRefreshing = ref(false);

  const { state: items, isLoading } = useAsyncState(async () => {
    const result = await fetchRemote();
    if (result.isErr()) return [];
    return result.value;
  }, []);

  const visibility = useDocumentVisibility();

  const debouncedRefresh = useDebounceFn(async () => {
    if (isOnline.value) {
      console.log("App visible. Syncing with remote to prevent stale data...");
      void refresh();
    }
  }, 1000);

  watch(visibility, (current) => {
    if (current === "visible") {
      debouncedRefresh();
    }
  });

  function refresh(): ResultAsync<T[], FetchE | "refresh-in-progress"> {
    if (isRefreshing.value) return errAsync("refresh-in-progress");
    isRefreshing.value = true;

    return unwrapAwaitedResult(fetchRemote(), (error) => error as FetchE | "refresh-in-progress")
      .andTee((remoteItems) => {
        items.value = remoteItems;
      })
      .andTee(() => {
        isRefreshing.value = false;
      })
      .orTee(() => {
        isRefreshing.value = false;
      });
  }

  function add(item: T): ResultAsync<void, AddE> {
    items.value = [...items.value, item];

    return unwrapAwaitedResult(addRemote(item), (error) => error as AddE).orElse((error) => {
      const itemId = getId(item);
      items.value = items.value.filter((i) => getId(i) !== itemId);
      return errAsync(error);
    });
  }

  function remove(item: T): ResultAsync<void, RemoveE> {
    const originalItems = [...items.value];
    const itemId = getId(item);
    items.value = items.value.filter((i) => getId(i) !== itemId);

    return unwrapAwaitedResult(removeRemote(item), (error) => error as RemoveE).orElse((error) => {
      items.value = originalItems;
      return errAsync(error);
    });
  }

  function update(item: T): ResultAsync<void, UpdateE | "no-update-handler"> {
    if (!updateRemote) {
      console.warn("updateRemote handler not provided");
      return errAsync("no-update-handler");
    }

    const itemId = getId(item);
    const index = items.value.findIndex((i) => getId(i) === itemId);
    if (index !== -1) {
      const newItems = [...items.value];
      newItems[index] = item;
      items.value = newItems;
    }

    return unwrapAwaitedResult(
      updateRemote(item),
      (error) => error as UpdateE | "no-update-handler",
    );
  }

  return { items, isLoading, isOnline, isRefreshing, add, remove, update, refresh };
}
