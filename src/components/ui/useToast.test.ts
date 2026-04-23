import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "./useToast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear toasts before each test
    const { toasts } = useToast();
    toasts.value = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not auto-dismiss persistent toasts", () => {
    const { toast, toasts } = useToast();

    toast({ title: "Test", persistent: true });

    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(10000); // 10 seconds
    expect(toasts.value).toHaveLength(1); // Still there
  });

  it("should auto-dismiss non-persistent toasts", () => {
    const { toast, toasts } = useToast();

    toast({ title: "Test", duration: 3000 });

    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(toasts.value).toHaveLength(0);
  });

  it("should update countdown every second", () => {
    const { toast, toasts } = useToast();

    toast({
      title: "Test",
      countdown: {
        seconds: 3,
        onComplete: vi.fn(),
      },
    });

    expect(toasts.value[0]?.countdown?.seconds).toBe(3);

    vi.advanceTimersByTime(1000);
    expect(toasts.value[0]?.countdown?.seconds).toBe(2);

    vi.advanceTimersByTime(1000);
    expect(toasts.value[0]?.countdown?.seconds).toBe(1);
  });

  it("should call onComplete when countdown reaches 0", () => {
    const onComplete = vi.fn();
    const { toast, toasts } = useToast();

    toast({
      title: "Test",
      countdown: {
        seconds: 2,
        onComplete,
      },
    });

    vi.advanceTimersByTime(2000);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(toasts.value).toHaveLength(0); // Toast dismissed
  });
});
