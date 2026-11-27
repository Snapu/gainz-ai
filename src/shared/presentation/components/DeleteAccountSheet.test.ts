import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";

const isDeleting = ref(false);
const hasActiveSpreadsheetMock = vi.fn(() => true);
const hasActiveSubscriptionMock = vi.fn(() => false);
const ensureSubscriptionStatusLoadedMock = vi.fn();
const deleteAccountMock = vi.fn();

vi.mock("@/shared/presentation/composables/useAccountActions", () => ({
  useAccountActions: () => ({
    isDeleting,
    hasActiveSpreadsheet: hasActiveSpreadsheetMock,
    hasActiveSubscription: hasActiveSubscriptionMock,
    ensureSubscriptionStatusLoaded: ensureSubscriptionStatusLoadedMock,
    signOut: vi.fn(),
    deleteAccount: deleteAccountMock,
  }),
}));

vi.mock("@/shared/presentation/components/ui/UiBottomSheet.vue", () => ({
  default: defineComponent({
    props: {
      open: { type: Boolean, required: true },
      title: { type: String, default: "" },
      subtitle: { type: String, default: "" },
    },
    emits: ["update:open"],
    setup(props, { slots, emit }) {
      return () =>
        props.open
          ? h("div", { "data-testid": "bottom-sheet" }, [
              h("h2", props.title),
              h(
                "button",
                {
                  type: "button",
                  "data-testid": "sheet-dismiss",
                  onClick: () => emit("update:open", false),
                },
                "Close",
              ),
              slots.default?.(),
              slots.footer?.(),
            ])
          : null;
    },
  }),
}));

import DeleteAccountSheet from "./DeleteAccountSheet.vue";

function mountSheet(initialOpen = false) {
  const open = ref(initialOpen);
  const host = document.createElement("div");
  document.body.appendChild(host);

  const Wrapper = defineComponent({
    setup() {
      return () =>
        h(DeleteAccountSheet, {
          open: open.value,
          "onUpdate:open": (value: boolean) => {
            open.value = value;
          },
        });
    },
  });

  const app = createApp(Wrapper);
  app.mount(host);
  return {
    open,
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("DeleteAccountSheet.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDeleting.value = false;
    hasActiveSpreadsheetMock.mockReturnValue(true);
    deleteAccountMock.mockResolvedValue(true);
  });

  it("resets spreadsheet trash checkbox on open and forwards selected option on confirm", async () => {
    const mounted = mountSheet(false);
    try {
      expect(mounted.host.querySelector("[data-testid='bottom-sheet']")).toBeNull();
      expect(hasActiveSpreadsheetMock).not.toHaveBeenCalled();

      mounted.open.value = true;
      await nextTick();

      expect(hasActiveSpreadsheetMock).toHaveBeenCalledTimes(1);
      const checkbox = mounted.host.querySelector<HTMLInputElement>("#trash-linked-spreadsheet");
      expect(checkbox).not.toBeNull();
      expect(checkbox?.checked).toBe(false);

      // Check the option and confirm
      if (checkbox) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change"));
      }
      await nextTick();

      const confirmBtn = Array.from(mounted.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Permanently Delete Account & Data"),
      );
      expect(confirmBtn).toBeDefined();
      confirmBtn?.click();

      await vi.waitFor(() => {
        expect(deleteAccountMock).toHaveBeenCalledWith({ trashSpreadsheet: true });
        expect(mounted.open.value).toBe(false);
      });
      await nextTick();

      // Re-opening resets the checkbox back to false
      mounted.open.value = true;
      await nextTick();
      const reopenedCheckbox = mounted.host.querySelector<HTMLInputElement>(
        "#trash-linked-spreadsheet",
      );
      expect(reopenedCheckbox?.checked).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  it("shows Drive retention note instead of checkbox when no spreadsheet is linked", async () => {
    hasActiveSpreadsheetMock.mockReturnValue(false);
    const mounted = mountSheet(true);
    try {
      await nextTick();
      expect(mounted.host.querySelector("#trash-linked-spreadsheet")).toBeNull();
      expect(mounted.host.textContent).toContain("remains untouched unless you delete it yourself");
    } finally {
      mounted.unmount();
    }
  });

  it("blocks dismissing and keeps sheet open while deletion is in progress", async () => {
    let resolveDelete!: (ok: boolean) => void;
    deleteAccountMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          isDeleting.value = true;
          resolveDelete = (ok: boolean) => {
            isDeleting.value = false;
            resolve(ok);
          };
        }),
    );

    const mounted = mountSheet(true);
    try {
      await nextTick();

      const confirmBtn = Array.from(mounted.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Permanently Delete Account & Data"),
      );
      confirmBtn?.click();
      await nextTick();

      expect(confirmBtn?.disabled).toBe(true);
      expect(confirmBtn?.textContent).toContain("Deleting account & data...");

      const dismissBtn = mounted.host.querySelector<HTMLButtonElement>(
        "[data-testid='sheet-dismiss']",
      );
      dismissBtn?.click();
      await nextTick();
      expect(mounted.open.value).toBe(true);

      resolveDelete(false);
      await vi.waitFor(() => {
        expect(confirmBtn?.disabled).toBe(false);
      });
      expect(mounted.open.value).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("shows orange subscription cancellation notice only when subscriber has active subscription", async () => {
    hasActiveSubscriptionMock.mockReturnValue(false);
    const nonSubscriber = mountSheet(true);
    try {
      await nextTick();
      expect(document.body.querySelector("[data-testid='delete-subscription-notice']")).toBeNull();
    } finally {
      nonSubscriber.unmount();
    }

    hasActiveSubscriptionMock.mockReturnValue(true);
    const subscriber = mountSheet(true);
    try {
      await nextTick();
      const notice = document.body.querySelector("[data-testid='delete-subscription-notice']");
      expect(notice).not.toBeNull();
      expect(notice?.className).toContain("orange-500");
    } finally {
      hasActiveSubscriptionMock.mockReturnValue(false);
      subscriber.unmount();
    }
  });

  it("reactively renders subscription cancellation notice once async entitlement fetch finishes while open", async () => {
    const reactiveSubscribed = ref(false);
    hasActiveSubscriptionMock.mockImplementation(() => reactiveSubscribed.value);
    ensureSubscriptionStatusLoadedMock.mockClear();

    const mounted = mountSheet(true);
    try {
      await nextTick();
      expect(ensureSubscriptionStatusLoadedMock).toHaveBeenCalledOnce();
      expect(document.body.querySelector("[data-testid='delete-subscription-notice']")).toBeNull();

      reactiveSubscribed.value = true;
      await nextTick();
      const notice = document.body.querySelector("[data-testid='delete-subscription-notice']");
      expect(notice).not.toBeNull();
      expect(notice?.textContent).toContain("canceled immediately");
    } finally {
      hasActiveSubscriptionMock.mockReset();
      hasActiveSubscriptionMock.mockReturnValue(false);
      mounted.unmount();
    }
  });
});
