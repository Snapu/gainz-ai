import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAiOrchestratorStore } from "@/modules/aiCoach/presentation";
import { useAuthStore } from "@/modules/auth/presentation";
import { useBillingStore } from "@/modules/billing/presentation";
import { usePlanTabViewModel } from "./usePlanTabViewModel";

const mockToast = vi.fn();

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({
    toast: mockToast,
    dismiss: vi.fn(),
  }),
}));

describe("usePlanTabViewModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
    useAuthStore().refreshToken = "test-refresh-token";
  });

  it("exposes starter counter during FreeAllowance and reacts cleanly to locked state", () => {
    const billingStore = useBillingStore();
    billingStore.applyEntitlement({
      source: "free_allowance",
      canUseCoach: true,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:00:00.000Z",
      freeAllowance: { coachUsed: 9, coachLimit: 30, classifyUsed: 5, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    });

    const vm = usePlanTabViewModel();
    expect(vm.showStarterBadge.value).toBe(true);
    expect(vm.starterRemainingCount.value).toBe(21);
    expect(vm.starterLimitCount.value).toBe(30);
    expect(vm.isCoachLocked.value).toBe(false);

    billingStore.applyEntitlement({
      source: "none",
      canUseCoach: false,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:05:00.000Z",
      freeAllowance: { coachUsed: 30, coachLimit: 30, classifyUsed: 5, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    });

    expect(vm.showStarterBadge.value).toBe(false);
    expect(vm.isCoachLocked.value).toBe(true);
  });

  it("guards regeneratePlan when already locked and suppresses destructive toast on payment-required", async () => {
    const billingStore = useBillingStore();
    const orchestrator = useAiOrchestratorStore();
    const generateSpy = vi
      .spyOn(orchestrator, "generateNewPlan")
      .mockReturnValueOnce(errAsync("payment-required"));

    const vm = usePlanTabViewModel();
    await vm.regeneratePlan();
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();

    // When cached locked, regeneratePlan returns early without hitting orchestrator
    billingStore.applyEntitlement({
      source: "none",
      canUseCoach: false,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:10:00.000Z",
      freeAllowance: { coachUsed: 30, coachLimit: 30, classifyUsed: 5, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    });
    generateSpy.mockReturnValue(okAsync(undefined));
    await vm.regeneratePlan();
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(vm.isRegenerating.value).toBe(false);
  });
});
