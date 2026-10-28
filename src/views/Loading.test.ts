import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, reactive } from "vue";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const authState = reactive({ isLoggedIn: true });
const spreadsheetState = reactive({ doc: { id: "doc-1" } as unknown });
const profileState = reactive({ isLoading: false, setupCompleted: true });

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

import Loading from "./Loading.vue";

describe("Loading.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isLoggedIn = true;
    spreadsheetState.doc = { id: "doc-1" };
    profileState.isLoading = false;
    profileState.setupCompleted = true;
  });

  it("immediately navigates away if loading state is already settled on mount", async () => {
    const container = document.createElement("div");
    const app = createApp(Loading);
    app.mount(container);
    await nextTick();

    expect(pushMock.mock.calls.length + replaceMock.mock.calls.length).toBeGreaterThan(0);
    app.unmount();
  });
});
