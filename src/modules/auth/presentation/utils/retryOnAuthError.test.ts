import { err, okAsync, type Result } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleAuthErrorMock } = vi.hoisted(() => ({
  handleAuthErrorMock: vi.fn(),
}));

vi.mock("../composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: () => ({
    handleAuthError: handleAuthErrorMock,
  }),
}));

import { retryOnAuthError } from "./retryOnAuthError";

describe("retryOnAuthError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("maps synchronous or async unexpected throws to typed fallbackError instead of leaking Error objects", async () => {
    const syncThrowResult = await retryOnAuthError(
      "test-sync-throw",
      () => {
        throw new Error("boom");
      },
      { fallbackError: "load-failed" as const },
    );

    expect(syncThrowResult).toEqual(err("load-failed"));
    expect(handleAuthErrorMock).not.toHaveBeenCalled();

    const rejectedResult = await retryOnAuthError(
      "test-reject",
      () => Promise.reject(new Error("network crash")),
      { fallbackError: "save-failed" as const },
    );

    expect(rejectedResult).toEqual(err("save-failed"));
  });

  it("aborts auth recovery retry when cancelled before recovery settles", async () => {
    let cancelled = false;
    handleAuthErrorMock.mockImplementationOnce(async () => {
      cancelled = true;
      return true;
    });
    const execute = vi.fn(
      (): Promise<Result<string, "auth-failed" | "load-failed">> =>
        Promise.resolve(err("auth-failed")),
    );

    const result = await retryOnAuthError("test-cancel", execute, {
      fallbackError: "load-failed",
      isCancelled: () => cancelled,
    });

    expect(result).toEqual(err("auth-failed"));
    expect(execute).toHaveBeenCalledOnce();
  });

  it("retries once after auth recovery succeeds", async () => {
    handleAuthErrorMock.mockResolvedValueOnce(true);
    const execute = vi
      .fn()
      .mockReturnValueOnce(Promise.resolve(err("auth-failed" as const)))
      .mockReturnValueOnce(okAsync("recovered-data"));

    const result = await retryOnAuthError("test-retry", execute, {
      fallbackError: "load-failed" as const,
    });

    expect(result.isOk()).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
