import { createPinia, defineStore, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, reactive, ref } from "vue";
import type { UserProfile } from "@/modules/profile/presentation";

const route = reactive<{ params: { step?: string }; query: Record<string, string> }>({
  params: { step: "days" },
  query: {},
});
const pushMock = vi.fn();
const replaceMock = vi.fn();
const backMock = vi.fn();
const userProfileRef = ref<UserProfile>({});
const hasCompletedSetupRef = ref(false);

const useTestUserProfileStore = defineStore("userProfile", () => ({
  userProfile: userProfileRef,
  hasCompletedSetup: hasCompletedSetupRef,
}));

vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    back: backMock,
  }),
}));

vi.mock("@/modules/profile/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/profile/presentation")>();
  return {
    ...actual,
    useUserProfileStore: () => useTestUserProfileStore(),
  };
});

import WizardFlow from "./WizardFlow.vue";

function mountWizard() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp(WizardFlow);
  app.use(pinia);
  app.mount(container);
  return {
    container,
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (btn) => btn.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`Button with text "${text}" not found`);
  }
  return button;
}

describe("WizardFlow.vue", () => {
  let unmountWizard: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    route.params = { step: "days" };
    route.query = {};
    userProfileRef.value = {};
    hasCompletedSetupRef.value = false;
  });

  afterEach(() => {
    unmountWizard?.();
    unmountWizard = undefined;
  });

  it("toggles and deselects workoutDaysPerWeek without setting NaN", async () => {
    const mounted = mountWizard();
    unmountWizard = mounted.unmount;
    await nextTick();

    const fourDaysBtn = findButtonByText(mounted.container, "4");
    fourDaysBtn.click();
    await nextTick();
    expect(userProfileRef.value.workoutDaysPerWeek).toBe(4);

    fourDaysBtn.click();
    await nextTick();
    expect(userProfileRef.value.workoutDaysPerWeek).toBeUndefined();
  });

  it("toggles, switches, and deselects workoutDurationMinutes cleanly", async () => {
    route.params = { step: "duration" };
    const mounted = mountWizard();
    unmountWizard = mounted.unmount;
    await nextTick();

    const min45Btn = findButtonByText(mounted.container, "45 min");
    const min60Btn = findButtonByText(mounted.container, "60 min");

    min45Btn.click();
    await nextTick();
    expect(userProfileRef.value.workoutDurationMinutes).toBe(45);

    min60Btn.click();
    await nextTick();
    expect(userProfileRef.value.workoutDurationMinutes).toBe(60);

    min60Btn.click();
    await nextTick();
    expect(userProfileRef.value.workoutDurationMinutes).toBeUndefined();
  });

  it("renders AppHeader title and navigates back in edit mode", async () => {
    route.params = { step: "days" };
    route.query = { mode: "edit" };
    const mounted = mountWizard();
    unmountWizard = mounted.unmount;
    await nextTick();

    const header = mounted.container.querySelector("header");
    expect(header).not.toBeNull();
    const h1 = header?.querySelector("h1");
    expect(h1?.textContent).toBe("Workout Days");

    const backBtn = header?.querySelector<HTMLButtonElement>('button[aria-label="Go Back"]');
    expect(backBtn).not.toBeNull();
    backBtn?.click();
    await nextTick();
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
