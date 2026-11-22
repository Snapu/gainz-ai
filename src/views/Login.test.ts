import { errAsync, okAsync } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick } from "vue";
import { hasValidLegalConsent } from "@/lib/legalConsent";
import { syncLegalConsent } from "@/shared/presentation/composables/useLegalConsent";

const pushMock = vi.fn();
const toastMock = vi.fn();
const loginMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => ({
    login: loginMock,
  }),
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import Login from "./Login.vue";

const RouterLinkStub = defineComponent({
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
  },
  template: "<a :href=\"typeof to === 'string' ? to : ''\"><slot /></a>",
});

function mountLogin() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp(Login);
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

function getSignInButton(host: HTMLElement): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Sign in with Google"),
  );
  if (!btn) throw new Error("Sign-in button not found");
  return btn;
}

describe("Login.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    syncLegalConsent();
    loginMock.mockImplementation(() => okAsync({ access_token: "token", expires_in: 3600 }));
  });

  it("renders links to privacy policy, terms of use, and impressum", () => {
    const mounted = mountLogin();
    try {
      const hrefs = Array.from(mounted.host.querySelectorAll("a")).map((a) =>
        a.getAttribute("href"),
      );
      expect(hrefs).toContain("/privacy");
      expect(hrefs).toContain("/terms");
      expect(hrefs).toContain("/impressum");
    } finally {
      mounted.unmount();
    }
  });

  it("disables Google sign-in until the consent checkbox is checked", async () => {
    const mounted = mountLogin();
    try {
      const checkbox = mounted.host.querySelector<HTMLInputElement>("#login-legal-consent");
      const signInBtn = getSignInButton(mounted.host);

      expect(checkbox).not.toBeNull();
      expect(checkbox?.checked).toBe(false);
      expect(signInBtn.disabled).toBe(true);

      signInBtn.click();
      await nextTick();
      expect(loginMock).not.toHaveBeenCalled();

      if (!checkbox) throw new Error("Checkbox missing");
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));
      await nextTick();

      expect(signInBtn.disabled).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  it("records legal consent and navigates to /loading after successful login", async () => {
    const mounted = mountLogin();
    try {
      const checkbox = mounted.host.querySelector<HTMLInputElement>("#login-legal-consent");
      if (!checkbox) throw new Error("Checkbox missing");
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));
      await nextTick();

      getSignInButton(mounted.host).click();

      await vi.waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/loading");
      });

      expect(loginMock).toHaveBeenCalledTimes(1);
      expect(hasValidLegalConsent()).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("does not persist legal consent when login fails", async () => {
    loginMock.mockReturnValue(errAsync("missing-scopes"));
    const mounted = mountLogin();
    try {
      const checkbox = mounted.host.querySelector<HTMLInputElement>("#login-legal-consent");
      if (!checkbox) throw new Error("Checkbox missing");
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));
      await nextTick();

      getSignInButton(mounted.host).click();

      await vi.waitFor(() => {
        expect(toastMock).toHaveBeenCalledTimes(1);
      });

      expect(hasValidLegalConsent()).toBe(false);
      expect(pushMock).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });
});
