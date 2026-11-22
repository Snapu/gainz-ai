import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick } from "vue";
import { hasValidLegalConsent } from "@/lib/legalConsent";
import { syncLegalConsent } from "@/shared/presentation/composables/useLegalConsent";

const pushMock = vi.fn();
const logoutMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => ({
    logout: logoutMock,
  }),
}));

import ConsentView from "./ConsentView.vue";

const RouterLinkStub = defineComponent({
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
  },
  template: "<a :href=\"typeof to === 'string' ? to : ''\"><slot /></a>",
});

function mountConsentView() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp(ConsentView);
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

function findButton(host: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  );
  if (!btn) throw new Error(`Button containing "${text}" not found`);
  return btn;
}

describe("ConsentView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    syncLegalConsent();
  });

  it("renders links to /terms and /privacy and keeps Accept disabled until checked", async () => {
    const mounted = mountConsentView();
    try {
      const hrefs = Array.from(mounted.host.querySelectorAll("a")).map((a) =>
        a.getAttribute("href"),
      );
      expect(hrefs).toContain("/terms");
      expect(hrefs).toContain("/privacy");

      const checkbox = mounted.host.querySelector<HTMLInputElement>("#gate-legal-consent");
      const acceptBtn = findButton(mounted.host, "Accept & Continue");

      expect(checkbox?.checked).toBe(false);
      expect(acceptBtn.disabled).toBe(true);

      acceptBtn.click();
      await nextTick();
      expect(hasValidLegalConsent()).toBe(false);
      expect(pushMock).not.toHaveBeenCalled();

      if (!checkbox) throw new Error("Checkbox missing");
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));
      await nextTick();

      expect(acceptBtn.disabled).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  it("uses safe-area scrollable flex container without top-clipping justify-center", () => {
    const mounted = mountConsentView();
    try {
      const main = mounted.host.querySelector("main");
      expect(main?.className).toContain("overflow-y-auto");
      expect(main?.className).toContain("pt-safe");
      expect(main?.className).toContain("pb-safe");
      expect(main?.className).not.toContain("justify-center");
    } finally {
      mounted.unmount();
    }
  });

  it("persists consent and navigates to /loading on accept", async () => {
    const mounted = mountConsentView();
    try {
      const checkbox = mounted.host.querySelector<HTMLInputElement>("#gate-legal-consent");
      if (!checkbox) throw new Error("Checkbox missing");
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));
      await nextTick();

      findButton(mounted.host, "Accept & Continue").click();
      await nextTick();

      expect(hasValidLegalConsent()).toBe(true);
      expect(pushMock).toHaveBeenCalledWith("/loading");
    } finally {
      mounted.unmount();
    }
  });

  it("revokes consent, signs out, and navigates to / on sign-out click", async () => {
    const mounted = mountConsentView();
    try {
      findButton(mounted.host, "Sign Out").click();
      await nextTick();

      expect(hasValidLegalConsent()).toBe(false);
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/");
    } finally {
      mounted.unmount();
    }
  });
});
