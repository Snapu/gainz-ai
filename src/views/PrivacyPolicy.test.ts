import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick, reactive } from "vue";
import { hasValidLegalConsent, LEGAL_CONSENT_STORAGE_KEY } from "@/lib/legalConsent";
import {
  syncLegalConsent,
  useLegalConsent,
} from "@/shared/presentation/composables/useLegalConsent";

const pushMock = vi.fn(() => Promise.resolve());
const backMock = vi.fn();
const logoutMock = vi.fn();
const toastMock = vi.fn();
const historyState = reactive<{ back: string | null }>({ back: null });
const authState = reactive({
  isLoggedIn: false,
  logout: logoutMock,
});

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
    options: {
      history: {
        state: historyState,
      },
    },
  }),
}));

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => authState,
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import PrivacyPolicy from "./PrivacyPolicy.vue";

const RouterLinkStub = defineComponent({
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
  },
  template: "<a :href=\"typeof to === 'string' ? to : ''\"><slot /></a>",
});

function mountPrivacyPolicy() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp(PrivacyPolicy);
  app.component("RouterLink", RouterLinkStub);
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

function findWithdrawButton(host: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Withdraw Consent"),
  );
}

describe("PrivacyPolicy.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    syncLegalConsent();
    authState.isLoggedIn = false;
    historyState.back = null;
  });

  it("shows consent date and allows withdrawal when consent is active", async () => {
    authState.isLoggedIn = true;
    useLegalConsent().acceptLegalConsent("2026-11-22T18:30:00.000Z");

    const mounted = mountPrivacyPolicy();
    try {
      await nextTick();
      expect(mounted.host.textContent).toContain("Consent granted on");
      expect(mounted.host.textContent).toContain("28 days");
      expect(mounted.host.textContent).not.toContain("7 days");

      const withdrawBtn = findWithdrawButton(mounted.host);
      expect(withdrawBtn).toBeDefined();

      withdrawBtn?.click();
      await vi.waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/");
      });

      expect(hasValidLegalConsent()).toBe(false);
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(toastMock).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  });

  it("hides active consent date for outdated consent while still allowing withdrawal", async () => {
    localStorage.setItem(
      LEGAL_CONSENT_STORAGE_KEY,
      JSON.stringify({ version: "2025-01-01", acceptedAt: "2025-01-01T10:00:00.000Z" }),
    );
    syncLegalConsent();

    const mounted = mountPrivacyPolicy();
    try {
      await nextTick();
      expect(mounted.host.textContent).not.toContain("Consent granted on");
      const withdrawBtn = findWithdrawButton(mounted.host);
      expect(withdrawBtn).toBeDefined();

      withdrawBtn?.click();
      await vi.waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/");
      });
      expect(localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY)).toBeNull();
    } finally {
      mounted.unmount();
    }
  });

  it("falls back to / when navigating back without browser history and uses router.back when history exists", async () => {
    const mounted = mountPrivacyPolicy();
    try {
      const backBtn = mounted.host.querySelector<HTMLButtonElement>('button[aria-label="Go Back"]');
      expect(backBtn).not.toBeNull();

      backBtn?.click();
      await nextTick();
      expect(pushMock).toHaveBeenCalledWith("/");
      expect(backMock).not.toHaveBeenCalled();

      historyState.back = "/terms";
      backBtn?.click();
      await nextTick();
      expect(backMock).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  });
});
