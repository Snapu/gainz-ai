import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { setLocale } from "@/shared/presentation/i18n";
import TermsOfUse from "./TermsOfUse.vue";

const routerPushMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: routerPushMock,
  }),
  RouterLink: defineComponent({
    name: "RouterLinkStub",
    props: { to: { type: String, required: true } },
    setup(props, { slots }) {
      return () => h("a", { href: props.to }, slots.default?.());
    },
  }),
}));

function mountTermsOfUse() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp(TermsOfUse);
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("TermsOfUse", () => {
  beforeEach(() => {
    routerPushMock.mockClear();
    setLocale("en");
  });

  afterEach(() => {
    setLocale("en");
  });

  it("renders GainzAI Pro pricing, Stripe / Link Merchant of Record, FreeAllowance, and grace period in German and English", async () => {
    const mounted = mountTermsOfUse();
    try {
      setLocale("de");
      await nextTick();
      const deText = mounted.host.textContent ?? "";
      expect(deText).toContain("GainzAI Pro");
      expect(deText).toContain("7,99 € / Monat");
      expect(deText).toContain("Stripe / Link");
      expect(deText).toContain("LINK.COM*");
      expect(deText).toContain("past_due");
      expect(deText).toContain("30 KI-Coaching-Anfragen");
      expect(deText).toContain("40 Übungsklassifizierungen");
      expect(deText).toContain("20 Klassifizierungen pro UTC-Tag");
      expect(deText).toContain("mit sofortiger Wirkung gekündigt");
      expect(deText).not.toContain("unbegrenzte Starter-Budgets");

      setLocale("en");
      await nextTick();
      const enText = mounted.host.textContent ?? "";
      expect(enText).toContain("GainzAI Pro");
      expect(enText).toContain("€7.99 / month");
      expect(enText).toContain("Stripe / Link");
      expect(enText).toContain("LINK.COM*");
      expect(enText).toContain("past_due");
      expect(enText).toContain("30 AI coaching requests");
      expect(enText).toContain("40 background exercise classifications");
      expect(enText).toContain("20 classifications per UTC day");
      expect(enText).toContain("immediate effect");
    } finally {
      mounted.unmount();
    }
  });
});
