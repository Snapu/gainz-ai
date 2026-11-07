import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, ref } from "vue";
import AppLayout from "./AppLayout.vue";

vi.mock("@/modules/trainingLogs/presentation", () => ({
  LogExerciseSheet: defineComponent({
    name: "LogExerciseSheet",
    props: ["open", "logToEdit", "prefillData", "restSeconds"],
    template: "<div data-testid='log-sheet' />",
  }),
}));

vi.mock("./BottomTabBar.vue", () => ({
  default: defineComponent({
    name: "BottomTabBar",
    template: "<nav data-testid='bottom-tab-bar'>BottomTabBar</nav>",
  }),
}));

vi.mock("./GlobalHeaderActions.vue", () => ({
  default: defineComponent({
    name: "GlobalHeaderActions",
    template: "<div data-testid='header-actions'>HeaderActions</div>",
  }),
}));

vi.mock("../composables/useKeyboard", () => ({
  useKeyboard: () => ({
    isKeyboardVisible: ref(false),
  }),
}));

vi.mock("../composables/useLogSheet", () => ({
  useLogSheet: () => ({
    isOpen: ref(false),
    logToEdit: ref(null),
    prefillData: ref(null),
    restSeconds: ref(null),
  }),
}));

function mountAppLayout() {
  const container = document.createElement("div");
  const Host = defineComponent({
    setup() {
      return () => h(AppLayout);
    },
  });
  const app = createApp(Host);
  app.component("router-view", {
    template: "<div data-testid='router-view-slot'>Tab Content</div>",
  });
  app.mount(container);
  return { container, unmount: () => app.unmount() };
}

describe("AppLayout", () => {
  it("renders the static AppHeader with brand logo and global actions", () => {
    const { container, unmount } = mountAppLayout();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("GainzAI");

    const headerActions = container.querySelector("[data-testid='header-actions']");
    expect(headerActions).not.toBeNull();

    unmount();
  });

  it("renders router-view container and bottom tab bar", () => {
    const { container, unmount } = mountAppLayout();

    const bottomNav = container.querySelector("[data-testid='bottom-tab-bar']");
    expect(bottomNav).not.toBeNull();

    const routerView = container.querySelector("[data-testid='router-view-slot']");
    expect(routerView).not.toBeNull();

    unmount();
  });

  it("applies pt-safe on top shell for notch/status-bar spacing", () => {
    const { container, unmount } = mountAppLayout();

    const topShell = container.firstElementChild;
    expect(topShell?.className).toContain("pt-safe");

    unmount();
  });
});
