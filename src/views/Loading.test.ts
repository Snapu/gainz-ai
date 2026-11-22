import { errAsync, okAsync } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, reactive, ref } from "vue";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const toastMock = vi.fn();
const logoutMock = vi.fn();
const createNewSpreadsheetMock = vi.fn(() => okAsync(undefined));
const linkExistingSpreadsheetMock = vi.fn(() => okAsync(undefined));
const isOnlineRef = ref(true);

const authState = reactive({ isLoggedIn: true, logout: logoutMock });
const spreadsheetState = reactive<{
  doc: { spreadsheetId: string } | null;
  isLoading: boolean;
  isPickerOpen: boolean;
  needsSpreadsheetChoice: boolean;
  createNewSpreadsheet: typeof createNewSpreadsheetMock;
  linkExistingSpreadsheet: typeof linkExistingSpreadsheetMock;
}>({
  doc: { spreadsheetId: "doc-1" },
  isLoading: false,
  isPickerOpen: false,
  needsSpreadsheetChoice: false,
  createNewSpreadsheet: createNewSpreadsheetMock,
  linkExistingSpreadsheet: linkExistingSpreadsheetMock,
});
const profileState = reactive({ isLoading: false, setupCompleted: true });

vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useOnline: () => isOnlineRef,
  };
});

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}));

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => authState,
}));

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetStore: () => spreadsheetState,
}));

vi.mock("@/modules/profile/presentation", () => ({
  useUserProfileStore: () => profileState,
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import Loading from "./Loading.vue";

function mountLoading() {
  const container = document.createElement("div");
  const app = createApp(Loading);
  app.mount(container);
  return { container, unmount: () => app.unmount() };
}

describe("Loading.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isOnlineRef.value = true;
    authState.isLoggedIn = true;
    spreadsheetState.doc = { spreadsheetId: "doc-1" };
    spreadsheetState.isLoading = false;
    spreadsheetState.isPickerOpen = false;
    spreadsheetState.needsSpreadsheetChoice = false;
    createNewSpreadsheetMock.mockImplementation(() => {
      spreadsheetState.doc = { spreadsheetId: "new-doc-1" };
      return okAsync(undefined);
    });
    linkExistingSpreadsheetMock.mockReturnValue(okAsync(undefined));
    profileState.isLoading = false;
    profileState.setupCompleted = true;
  });

  it("immediately navigates away if loading state is already settled on mount", async () => {
    const { unmount } = mountLoading();
    await nextTick();

    expect(pushMock.mock.calls.length + replaceMock.mock.calls.length).toBeGreaterThan(0);
    unmount();
  });

  it("shows telemetry loader instead of choice screen while checking for spreadsheets", async () => {
    spreadsheetState.doc = null;
    spreadsheetState.needsSpreadsheetChoice = false;
    spreadsheetState.isLoading = true;

    const { container, unmount } = mountLoading();
    await nextTick();

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Connect Existing Sheet");
    unmount();
  });

  it("renders choice actions when needsSpreadsheetChoice is true and triggers store actions", async () => {
    spreadsheetState.doc = null;
    spreadsheetState.needsSpreadsheetChoice = true;
    spreadsheetState.isLoading = false;

    const { container, unmount } = mountLoading();
    await nextTick();

    const buttons = Array.from(container.querySelectorAll("button"));
    const linkBtn = buttons.find((btn) => btn.textContent?.includes("Connect Existing Sheet"));
    const createBtn = buttons.find((btn) => btn.textContent?.includes("Start Fresh (Create New)"));
    const switchAccountBtn = buttons.find((btn) =>
      btn.textContent?.includes("Switch Google Account"),
    );
    const main = container.querySelector("main");

    expect(main?.className).toContain("overflow-y-auto");
    expect(main?.className).toContain("pt-safe");
    expect(container.textContent).toContain("saved privately in your Google Drive");
    expect(linkBtn).toBeDefined();
    expect(linkBtn?.getAttribute("aria-busy")).toBeNull();
    expect(createBtn).toBeDefined();
    expect(switchAccountBtn).toBeDefined();

    linkBtn?.click();
    await nextTick();
    expect(linkExistingSpreadsheetMock).toHaveBeenCalledTimes(1);

    // First tap asks for confirmation; second tap creates the new sheet
    createBtn?.click();
    await nextTick();
    expect(createNewSpreadsheetMock).not.toHaveBeenCalled();
    expect(createBtn?.textContent).toContain("Tap Again to Confirm New Sheet");

    createBtn?.click();
    await vi.waitFor(() => expect(createNewSpreadsheetMock).toHaveBeenCalledTimes(1));

    switchAccountBtn?.click();
    expect(logoutMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("shows opening state and disables sheet buttons while busy, ignores picker cancel, and surfaces failures via toast", async () => {
    spreadsheetState.doc = null;
    spreadsheetState.needsSpreadsheetChoice = true;
    spreadsheetState.isPickerOpen = true;
    linkExistingSpreadsheetMock
      .mockReturnValueOnce(errAsync("picker-cancelled") as never)
      .mockReturnValueOnce(errAsync("picker-unavailable") as never)
      .mockReturnValueOnce(errAsync("forbidden") as never)
      .mockReturnValueOnce(errAsync("load-spreadsheet-failed") as never)
      .mockReturnValueOnce(errAsync("auth-failed") as never);

    const { container, unmount } = mountLoading();
    await nextTick();

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBe(3);
    const linkBtnWhileBusy = buttons.find((btn) =>
      btn.textContent?.includes("Opening Google Drive..."),
    );
    const createBtnWhileBusy = buttons.find((btn) =>
      btn.textContent?.includes("Start Fresh (Create New)"),
    );
    const switchAccountBtnWhileBusy = buttons.find((btn) =>
      btn.textContent?.includes("Switch Google Account"),
    );
    expect(linkBtnWhileBusy?.disabled).toBe(true);
    expect(linkBtnWhileBusy?.getAttribute("aria-busy")).toBe("true");
    expect(createBtnWhileBusy?.disabled).toBe(true);
    expect(switchAccountBtnWhileBusy?.disabled).toBe(false);

    spreadsheetState.isPickerOpen = false;
    await nextTick();

    const linkBtn = buttons.find((btn) => btn.textContent?.includes("Connect Existing Sheet"));

    // Picker cancelled stays quiet
    linkBtn?.click();
    await Promise.resolve();
    expect(toastMock).not.toHaveBeenCalled();

    // Picker failure shows destructive toast
    linkBtn?.click();
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Google Picker Unavailable",
        }),
      );
    });

    // Forbidden file selection shows permission denied toast
    toastMock.mockClear();
    linkBtn?.click();
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Permission Denied",
        }),
      );
    });

    // Generic failures fall back to default destructive toast
    toastMock.mockClear();
    linkBtn?.click();
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Could Not Connect Sheet",
        }),
      );
    });

    // Offline auth failure shows connection copy; logged-out auth failure stays quiet
    toastMock.mockClear();
    isOnlineRef.value = false;
    linkBtn?.click();
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Connection Unavailable",
        }),
      );
    });

    toastMock.mockClear();
    authState.isLoggedIn = false;
    linkExistingSpreadsheetMock.mockReturnValueOnce(errAsync("auth-failed") as never);
    linkBtn?.click();
    await Promise.resolve();
    expect(toastMock).not.toHaveBeenCalled();

    unmount();
  });
});
