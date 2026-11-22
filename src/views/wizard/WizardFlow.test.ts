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

  describe("equipment step", () => {
    function setInputValue(container: HTMLElement, value: string): HTMLInputElement {
      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label="Custom equipment"]',
      );
      if (!input) throw new Error("Custom equipment input not found");
      input.value = value;
      input.dispatchEvent(new Event("input"));
      return input;
    }

    function submitCustomForm(container: HTMLElement): void {
      const button = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Add custom equipment"]',
      );
      if (!button) throw new Error("Add custom equipment button not found");
      button.click();
    }

    it("toggles presets while preserving existing custom items", async () => {
      route.params = { step: "equipment" };
      userProfileRef.value = { equipmentAccess: ["Smith Machine"] };
      const mounted = mountWizard();
      unmountWizard = mounted.unmount;
      await nextTick();

      findButtonByText(mounted.container, "Dumbbells").click();
      await nextTick();

      expect(userProfileRef.value.equipmentAccess).toEqual(["dumbbells", "Smith Machine"]);
      expect(mounted.container.textContent).toContain("Smith Machine");
    });

    it("adds custom equipment, clears input, and removes custom entry cleanly", async () => {
      route.params = { step: "equipment" };
      const mounted = mountWizard();
      unmountWizard = mounted.unmount;
      await nextTick();

      const input = setInputValue(mounted.container, "Smith Machine");
      await nextTick();
      submitCustomForm(mounted.container);
      await nextTick();

      expect(userProfileRef.value.equipmentAccess).toEqual(["Smith Machine"]);
      expect(input.value).toBe("");
      expect(mounted.container.textContent).toContain("Smith Machine");

      const removeBtn = mounted.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove Smith Machine"]',
      );
      expect(removeBtn).not.toBeNull();
      removeBtn?.click();
      await nextTick();

      expect(userProfileRef.value.equipmentAccess).toBeUndefined();
      expect(mounted.container.textContent).not.toContain("Smith Machine");
    });

    it("maps preset label input to canonical preset id and shows confirmation feedback", async () => {
      route.params = { step: "equipment" };
      const mounted = mountWizard();
      unmountWizard = mounted.unmount;
      await nextTick();

      const input = setInputValue(mounted.container, "Dumbbells");
      expect(input.placeholder).not.toContain(",");
      await nextTick();
      submitCustomForm(mounted.container);
      await nextTick();

      expect(userProfileRef.value.equipmentAccess).toEqual(["dumbbells"]);
      expect(mounted.container.querySelector('button[aria-label="Remove dumbbells"]')).toBeNull();
      expect(mounted.container.querySelector('[role="status"]')?.textContent?.trim()).toBe(
        "Selected preset: Dumbbells",
      );
    });

    it("shows inline error on invalid or duplicate custom equipment without mutating profile", async () => {
      route.params = { step: "equipment" };
      userProfileRef.value = { equipmentAccess: ["Smith Machine"] };
      const mounted = mountWizard();
      unmountWizard = mounted.unmount;
      await nextTick();

      setInputValue(mounted.container, "Rack, Bench");
      await nextTick();
      submitCustomForm(mounted.container);
      await nextTick();

      expect(mounted.container.textContent).toContain("Commas and line breaks are not allowed.");
      expect(userProfileRef.value.equipmentAccess).toEqual(["Smith Machine"]);

      setInputValue(mounted.container, "smith machine");
      await nextTick();
      submitCustomForm(mounted.container);
      await nextTick();

      expect(mounted.container.textContent).toContain("This equipment is already added.");
      expect(userProfileRef.value.equipmentAccess).toEqual(["Smith Machine"]);
    });

    it("disables unselected presets at 30 items while keeping selected presets toggleable", async () => {
      route.params = { step: "equipment" };
      const selectedPresets = ["bodyweight", "dumbbells", "kettlebells", "bench", "pull_up_bar"];
      const customItems = Array.from({ length: 25 }, (_, i) => `Custom ${i + 1}`);
      userProfileRef.value = { equipmentAccess: [...selectedPresets, ...customItems] };
      const mounted = mountWizard();
      unmountWizard = mounted.unmount;
      await nextTick();

      const unselectedBtn = findButtonByText(mounted.container, "Cable machine");
      const selectedBtn = findButtonByText(mounted.container, "Dumbbells");

      expect(unselectedBtn.disabled).toBe(true);
      expect(selectedBtn.disabled).toBe(false);

      unselectedBtn.click();
      await nextTick();
      expect(userProfileRef.value.equipmentAccess).toHaveLength(30);
      expect(userProfileRef.value.equipmentAccess).toContain("Custom 25");

      selectedBtn.click();
      await nextTick();
      expect(userProfileRef.value.equipmentAccess).toHaveLength(29);
      expect(userProfileRef.value.equipmentAccess).not.toContain("dumbbells");
      expect(unselectedBtn.disabled).toBe(false);
    });

    it("auto-commits valid pending custom input when leaving the equipment step", async () => {
      route.params = { step: "equipment" };
      const mounted = mountWizard();
      unmountWizard = mounted.unmount;
      await nextTick();

      setInputValue(mounted.container, "Leg press");
      await nextTick();

      findButtonByText(mounted.container, "Continue").click();
      await nextTick();

      expect(userProfileRef.value.equipmentAccess).toEqual(["Leg press"]);
    });
  });
});
