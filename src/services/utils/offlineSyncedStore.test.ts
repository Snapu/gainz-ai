import { err, ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useOfflineSyncedStore } from "./offlineSyncedStore";

// Mock @vueuse/core
vi.mock("@vueuse/core", () => ({
  useAsyncState: vi.fn((fn, initialState) => {
    const state = ref(initialState);
    const isLoading = ref(true);

    fn().then((result: any) => {
      state.value = result;
      isLoading.value = false;
    });

    return { state, isLoading };
  }),
  useLocalStorage: vi.fn((key, initialValue) => ref(initialValue)),
  useOnline: vi.fn(() => ref(true)),
}));

type TestItem = {
  id: string;
  name: string;
  value: number;
};

describe("useOfflineSyncedStore", () => {
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
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => {
        expect(mockFetchRemote).toHaveBeenCalledTimes(1);
      });
    });

    it("should handle fetch errors gracefully", async () => {
      mockFetchRemote.mockResolvedValue(err("network-error"));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => {
        expect(store.items.value).toEqual([]);
      });
    });
  });

  describe("Add Operations", () => {
    it("should add item to localCache immediately and move to remoteItems on success", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));
      mockAddRemote.mockResolvedValue(ok(undefined));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      const newItem: TestItem = { id: "3", name: "Item 3", value: 30 };

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      await store.add(newItem);

      expect(mockAddRemote).toHaveBeenCalledWith(newItem);
      await vi.waitFor(() => {
        expect(store.items.value).toContainEqual(newItem);
      });
    });

    it("should queue failed add operations for later sync", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));
      mockAddRemote.mockResolvedValue(err("network-error"));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      const newItem: TestItem = { id: "4", name: "Item 4", value: 40 };

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      await store.add(newItem);

      expect(mockAddRemote).toHaveBeenCalledWith(newItem);
      // Item should still be in items (in localCache)
      expect(store.items.value).toContainEqual(newItem);
    });
  });

  describe("Remove Operations", () => {
    it("should remove item from both caches immediately", async () => {
      const existingItems: TestItem[] = [
        { id: "1", name: "Item 1", value: 10 },
        { id: "2", name: "Item 2", value: 20 },
      ];
      mockFetchRemote.mockResolvedValue(ok(existingItems));
      mockRemoveRemote.mockResolvedValue(ok(undefined));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const itemToRemove = existingItems[0]!;
      await store.remove(itemToRemove);

      expect(mockRemoveRemote).toHaveBeenCalledWith(itemToRemove);
      expect(store.items.value).not.toContainEqual(itemToRemove);
      expect(store.items.value.length).toBe(1);
    });

    it("should queue failed remove operations", async () => {
      const existingItems: TestItem[] = [{ id: "1", name: "Item 1", value: 10 }];
      mockFetchRemote.mockResolvedValue(ok(existingItems));
      mockRemoveRemote.mockResolvedValue(err("network-error"));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const itemToRemove = existingItems[0]!;
      await store.remove(itemToRemove);

      expect(mockRemoveRemote).toHaveBeenCalledWith(itemToRemove);
      // Item should be removed optimistically
      expect(store.items.value).not.toContainEqual(itemToRemove);
    });
  });

  describe("Update Operations", () => {
    it("should update item in remoteItems if it exists", async () => {
      const existingItems: TestItem[] = [{ id: "1", name: "Item 1", value: 10 }];
      mockFetchRemote.mockResolvedValue(ok(existingItems));
      mockUpdateRemote.mockResolvedValue(ok(undefined));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
        updateRemote: mockUpdateRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const updatedItem: TestItem = { id: "1", name: "Updated Item", value: 100 };
      await store.update(updatedItem);

      expect(mockUpdateRemote).toHaveBeenCalledWith(updatedItem);
      expect(store.items.value).toContainEqual(updatedItem);
      expect(store.items.value.find((i) => i.id === "1")?.name).toBe("Updated Item");
    });

    it("should handle missing updateRemote handler gracefully", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const item: TestItem = { id: "1", name: "Item 1", value: 10 };
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await store.update(item);

      expect(consoleWarnSpy).toHaveBeenCalledWith("updateRemote handler not provided");
      consoleWarnSpy.mockRestore();
    });

    it("should queue failed update operations", async () => {
      const existingItems: TestItem[] = [{ id: "1", name: "Item 1", value: 10 }];
      mockFetchRemote.mockResolvedValue(ok(existingItems));
      mockUpdateRemote.mockResolvedValue(err("network-error"));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
        updateRemote: mockUpdateRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const updatedItem: TestItem = { id: "1", name: "Updated", value: 100 };
      await store.update(updatedItem);

      expect(mockUpdateRemote).toHaveBeenCalledWith(updatedItem);
      // Item should be updated optimistically
      expect(store.items.value.find((i) => i.id === "1")?.name).toBe("Updated");
    });
  });

  describe("Operation Squashing", () => {
    it("should queue all operations without squashing", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));
      mockAddRemote.mockResolvedValue(err("network-error"));
      mockRemoveRemote.mockResolvedValue(err("network-error"));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const item: TestItem = { id: "1", name: "Item", value: 10 };

      await store.add(item);
      await store.remove(item);

      // Both operations queued, item removed optimistically
      expect(store.items.value).toEqual([]);
    });

    it("should handle multiple operations on same item", async () => {
      mockFetchRemote.mockResolvedValue(ok([{ id: "1", name: "Item", value: 10 }]));
      mockUpdateRemote.mockResolvedValue(err("network-error"));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
        updateRemote: mockUpdateRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const update1: TestItem = { id: "1", name: "Update 1", value: 20 };
      const update2: TestItem = { id: "1", name: "Update 2", value: 30 };

      await store.update(update1);
      await store.update(update2);

      // Last update should be reflected
      expect(store.items.value.find((i) => i.id === "1")?.value).toBe(30);
    });
  });

  describe("Items Computed Property", () => {
    it("should combine remoteItems and localCache", async () => {
      const remoteItems: TestItem[] = [
        { id: "1", name: "Remote 1", value: 10 },
        { id: "2", name: "Remote 2", value: 20 },
      ];
      mockFetchRemote.mockResolvedValue(ok(remoteItems));
      mockAddRemote.mockResolvedValue(err("network-error"));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const localItem: TestItem = { id: "3", name: "Local 1", value: 30 };
      await store.add(localItem);

      expect(store.items.value.length).toBe(3);
      expect(store.items.value).toContainEqual(remoteItems[0]);
      expect(store.items.value).toContainEqual(remoteItems[1]);
      expect(store.items.value).toContainEqual(localItem);
    });

    it("should not have duplicates after successful add", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));
      mockAddRemote.mockResolvedValue(ok(undefined));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      const item: TestItem = { id: "1", name: "Item", value: 10 };
      await store.add(item);

      await vi.waitFor(() => {
        const itemsWithSameId = store.items.value.filter((i) => i.id === "1");
        expect(itemsWithSameId.length).toBe(1);
      });
    });
  });

  describe("Loading State", () => {
    it("should indicate loading during initial fetch", async () => {
      let resolveFetch: (value: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      mockFetchRemote.mockReturnValue(fetchPromise);

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      expect(store.isLoading.value).toBe(true);

      resolveFetch!(ok([]));
      await vi.waitFor(() => {
        expect(store.isLoading.value).toBe(false);
      });
    });
  });

  describe("Online/Offline Detection", () => {
    it("should expose online status", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      expect(store.isOnline).toBeDefined();
      expect(store.isOnline.value).toBe(true);
    });

    it("should expose syncPending function for manual sync", async () => {
      mockFetchRemote.mockResolvedValue(ok([]));

      const store = useOfflineSyncedStore({
        key: "test",
        getId,
        fetchRemote: mockFetchRemote,
        addRemote: mockAddRemote,
        removeRemote: mockRemoveRemote,
      });

      await vi.waitFor(() => expect(mockFetchRemote).toHaveBeenCalled());

      expect(store.syncPending).toBeDefined();
      expect(typeof store.syncPending).toBe("function");
    });
  });
});
