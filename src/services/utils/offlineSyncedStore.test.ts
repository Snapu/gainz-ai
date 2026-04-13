import { err, ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useOfflineSyncedStore } from "./offlineSyncedStore";

// Mock @vueuse/core
vi.mock("@vueuse/core", () => ({
  useAsyncState: vi.fn((fn, initialState) => {
    const state = ref(initialState);
    const isLoading = ref(true);

    // Execute async function and update state
    Promise.resolve(fn()).then((result: any) => {
      state.value = result;
      isLoading.value = false;
    });

    return { state, isLoading };
  }),
  useOnline: vi.fn(() => ref(true)),
  useDocumentVisibility: vi.fn(() => ref("visible")),
  useDebounceFn: vi.fn((fn) => fn), // Return function unwrapped for tests
}));

type TestItem = {
  id: string;
  name: string;
  value: number;
};

describe("useOfflineSyncedStore (Workbox-simplified)", () => {
  const mockFetchRemote = vi.fn();
  const mockAddRemote = vi.fn();
  const mockRemoveRemote = vi.fn();
  const mockUpdateRemote = vi.fn();
  const getId = (item: TestItem) => item.id;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should fetch remote items on initialization", async () => {
      const remoteItems: TestItem[] = [
        { id: "1", name: "Item 1", value: 10 },
        { id: "2", name: "Item 2", value: 20 },
      ];
      mockFetchRemote.mockResolvedValue(ok(remoteItems));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => {
        expect(mockFetchRemote).toHaveBeenCalledTimes(1);
      });

      expect(store.items.value).toEqual(remoteItems);
    });

    it("should handle fetch errors gracefully", async () => {
      mockFetchRemote.mockResolvedValue(err(new Error("Network error")));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => {
        expect(mockFetchRemote).toHaveBeenCalledTimes(1);
      });

      expect(store.items.value).toEqual([]);
    });

    it("should expose required properties", () => {
      mockFetchRemote.mockResolvedValue(ok([]));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      expect(store.items).toBeDefined();
      expect(store.isLoading).toBeDefined();
      expect(store.isOnline).toBeDefined();
      expect(store.isRefreshing).toBeDefined();
      expect(store.add).toBeDefined();
      expect(store.remove).toBeDefined();
      expect(store.update).toBeDefined();
      expect(store.refresh).toBeDefined();
    });
  });

  describe("Add operation", () => {
    it("should optimistically add item and call remote", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));
      mockAddRemote.mockResolvedValue(ok(undefined));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => store.isLoading.value === false);

      const newItem: TestItem = { id: "1", name: "New Item", value: 100 };
      await store.add(newItem);

      expect(store.items.value).toContainEqual(newItem);
      expect(mockAddRemote).toHaveBeenCalledWith(newItem);
    });

    it("should revert optimistic add on immediate error", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));
      mockAddRemote.mockResolvedValue(err(new Error("Validation error")));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => store.isLoading.value === false);

      const newItem: TestItem = { id: "1", name: "New Item", value: 100 };
      await store.add(newItem);

      // Item should be reverted since add failed
      expect(store.items.value).not.toContainEqual(newItem);
    });
  });

  describe("Remove operation", () => {
    it("should optimistically remove item and call remote", async () => {
      const existingItem: TestItem = { id: "1", name: "Existing", value: 50 };
      mockFetchRemote.mockResolvedValue(ok([existingItem]));
      mockRemoveRemote.mockResolvedValue(ok(undefined));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => store.isLoading.value === false);

      await store.remove(existingItem);

      expect(store.items.value).not.toContainEqual(existingItem);
      expect(mockRemoveRemote).toHaveBeenCalledWith(existingItem);
    });

    it("should revert optimistic remove on immediate error", async () => {
      const existingItem: TestItem = { id: "1", name: "Existing", value: 50 };
      mockFetchRemote.mockResolvedValue(ok([existingItem]));
      mockRemoveRemote.mockResolvedValue(err(new Error("Remove failed")));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => store.isLoading.value === false);

      await store.remove(existingItem);

      // Item should be restored since remove failed
      expect(store.items.value).toContainEqual(existingItem);
    });
  });

  describe("Update operation", () => {
    it("should optimistically update item and call remote", async () => {
      const existingItem: TestItem = { id: "1", name: "Old", value: 50 };
      mockFetchRemote.mockResolvedValue(ok([existingItem]));
      mockUpdateRemote.mockResolvedValue(ok(undefined));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
        updateRemote: mockUpdateRemote,
      });

      await vi.waitFor(() => store.isLoading.value === false);

      const updatedItem: TestItem = { id: "1", name: "Updated", value: 100 };
      await store.update(updatedItem);

      expect(store.items.value).toContainEqual(updatedItem);
      expect(mockUpdateRemote).toHaveBeenCalledWith(updatedItem);
    });

    it("should warn if updateRemote handler not provided", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFetchRemote.mockResolvedValue(ok([]));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
        // No updateRemote provided
      });

      await vi.waitFor(() => store.isLoading.value === false);

      const item: TestItem = { id: "1", name: "Item", value: 50 };
      await store.update(item);

      expect(consoleSpy).toHaveBeenCalledWith("updateRemote handler not provided");
      consoleSpy.mockRestore();
    });
  });

  describe("Refresh operation", () => {
    it("should re-fetch remote data on refresh", async () => {
      const initialItems: TestItem[] = [{ id: "1", name: "Initial", value: 10 }];
      const updatedItems: TestItem[] = [
        { id: "1", name: "Initial", value: 10 },
        { id: "2", name: "New from server", value: 20 },
      ];

      mockFetchRemote
        .mockResolvedValueOnce(ok(initialItems))
        .mockResolvedValueOnce(ok(updatedItems));

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => store.isLoading.value === false);

      expect(store.items.value).toEqual(initialItems);

      await store.refresh();

      expect(store.items.value).toEqual(updatedItems);
      expect(mockFetchRemote).toHaveBeenCalledTimes(2);
    });

    it("should prevent concurrent refreshes", async () => {
      mockFetchRemote.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(ok([])), 100);
          }),
      );

      const store = useOfflineSyncedStore({
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => store.isLoading.value === false);

      // Call refresh multiple times concurrently
      const refreshPromises = [store.refresh(), store.refresh(), store.refresh()];

      await Promise.all(refreshPromises);

      // Should only fetch once during concurrent calls (plus initial fetch)
      expect(mockFetchRemote).toHaveBeenCalledTimes(2);
    });
  });
});
