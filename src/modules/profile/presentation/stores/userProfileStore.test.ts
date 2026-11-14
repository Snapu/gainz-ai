import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok } from "neverthrow";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { type UserProfile, useUserProfileStore } from "@/modules/profile/presentation";

const { handleAuthErrorMock } = vi.hoisted(() => ({
  handleAuthErrorMock: vi.fn(),
}));

const reactiveDoc = ref<GoogleSpreadsheet | null>(null);
const mockIsLoggedIn = ref(true);

vi.mock("@/modules/auth/presentation/composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: vi.fn(() => ({
    handleAuthError: handleAuthErrorMock,
  })),
}));

vi.mock("@/modules/auth/presentation/stores/authStore", () => ({
  useAuthStore: () => ({
    get isLoggedIn() {
      return mockIsLoggedIn.value;
    },
    init: vi.fn().mockResolvedValue(undefined),
  }),
}));

const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

vi.mock("@/modules/profile/application", () => ({
  loadUserProfile: vi.fn(),
  migrateFromLocalStorage: vi.fn(),
  saveUserProfile: vi.fn(),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetRepositoryFactory: vi.fn(),
}));

import { useSpreadsheetRepositoryFactory } from "@/modules/platform/presentation";
import {
  loadUserProfile,
  migrateFromLocalStorage,
  saveUserProfile,
} from "@/modules/profile/application";

describe("useUserProfileStore", () => {
  let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;
  let mockDoc: GoogleSpreadsheet;
  let pinia: Pinia;

  beforeEach(() => {
    mockLocalStorage = createMockLocalStorage();
    vi.stubGlobal("localStorage", mockLocalStorage);
    pinia = createPinia();
    setActivePinia(pinia);
    mockDoc = {} as GoogleSpreadsheet;
    reactiveDoc.value = mockDoc;
    mockIsLoggedIn.value = true;
    vi.mocked(useSpreadsheetRepositoryFactory).mockReturnValue({
      spreadsheetStore: {
        get doc() {
          return reactiveDoc.value;
        },
      },
      getDoc: () => reactiveDoc.value,
      createRepository: vi.fn(() => (reactiveDoc.value ? {} : null)),
    } as unknown as ReturnType<typeof useSpreadsheetRepositoryFactory>);
    vi.clearAllMocks();
  });

  afterEach(() => {
    (pinia as unknown as { _e?: { stop?: () => void } })._e?.stop?.();
  });

  it("does not save the profile blob to localStorage", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok(null));

    const store = useUserProfileStore();
    store.updateProfile({ age: 25, heightCm: 180, fitnessLevel: "intermediate" });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockLocalStorage.getItem("userProfile")).toBeNull();
  });

  it("does not mark hasCompletedSetup during background debounced save", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok(null));
    vi.mocked(saveUserProfile).mockResolvedValue(ok(undefined));

    const store = useUserProfileStore();
    store.updateProfile({ age: 25 });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(saveUserProfile).toHaveBeenCalled();
    expect(store.hasCompletedSetup).toBe(false);
  });

  it("auto-detects setup completion from loaded profile data", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    const profileData: UserProfile = { age: 28, heightCm: 172, fitnessGoal: ["build_muscle"] };
    vi.mocked(loadUserProfile).mockResolvedValue(ok(profileData));

    const store = useUserProfileStore();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.hasCompletedSetup).toBe(true);
  });

  it("keeps setup incomplete for empty profiles", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok({}));

    const store = useUserProfileStore();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.hasCompletedSetup).toBe(false);
  });

  it("retries load once after auth recovery on auth-failed", async () => {
    const recoveredProfile: UserProfile = { age: 30, weightKg: 82 };
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile)
      .mockResolvedValueOnce(err("auth-failed"))
      .mockResolvedValueOnce(ok(recoveredProfile));
    handleAuthErrorMock.mockResolvedValueOnce(true);

    const store = useUserProfileStore();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(handleAuthErrorMock).toHaveBeenCalledWith("user-profile-load");
    expect(loadUserProfile).toHaveBeenCalledTimes(2);
    expect(store.userProfile.age).toBe(30);
    expect(store.userProfile.weightKg).toBe(82);
  });

  it("retries migrateFromLocalStorage once after auth recovery on auth-failed", async () => {
    vi.mocked(migrateFromLocalStorage)
      .mockResolvedValueOnce(err("auth-failed"))
      .mockResolvedValueOnce(ok("migrated"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok({ age: 32 }));
    handleAuthErrorMock.mockResolvedValueOnce(true);

    const store = useUserProfileStore();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(handleAuthErrorMock).toHaveBeenCalledWith("user-profile-migration");
    expect(migrateFromLocalStorage).toHaveBeenCalledTimes(2);
    expect(store.userProfile.age).toBe(32);
  });

  it("does not trigger a redundant save immediately after initial load or on logout", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok({ age: 29, weightKg: 75 }));
    vi.mocked(saveUserProfile).mockResolvedValue(ok(undefined));

    const store = useUserProfileStore();
    await vi.waitFor(() => expect(store.userProfile.age).toBe(29));
    await new Promise((resolve) => setTimeout(resolve, 1650));

    expect(saveUserProfile).not.toHaveBeenCalled();

    reactiveDoc.value = null;
    await nextTick();
    expect(store.userProfile).toEqual({});
    expect(saveUserProfile).not.toHaveBeenCalled();
  });

  it("resets hasCompletedSetup on logout while preserving skipped setup when staying logged in", async () => {
    mockLocalStorage.setItem("hasCompletedSetup", "true");
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok(null));

    const store = useUserProfileStore();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.hasCompletedSetup).toBe(true);

    mockIsLoggedIn.value = false;
    reactiveDoc.value = null;
    expect(store.hasCompletedSetup).toBe(false);
    expect(mockLocalStorage.getItem("hasCompletedSetup")).toBe("false");
  });

  it("clears stale hasCompletedSetup on boot when unauthenticated without a doc", async () => {
    mockLocalStorage.setItem("hasCompletedSetup", "true");
    mockIsLoggedIn.value = false;
    reactiveDoc.value = null;

    const store = useUserProfileStore();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.hasCompletedSetup).toBe(false);
  });
});
