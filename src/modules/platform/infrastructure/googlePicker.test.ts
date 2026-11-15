import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickSpreadsheetId } from "./googlePicker";

function installGooglePickerGlobal() {
  let registeredCallback:
    | ((data: { action: string; docs?: Array<{ id?: string }> }) => void)
    | null = null;

  const state = {
    setAppId: vi.fn<(appId: string) => void>(),
    setDeveloperKey: vi.fn<(key: string) => void>(),
    setOAuthToken: vi.fn<(token: string) => void>(),
    setOrigin: vi.fn<(origin: string) => void>(),
    setTitle: vi.fn<(title: string) => void>(),
    addView: vi.fn<(view: unknown) => void>(),
    setMimeTypes: vi.fn<(mimeTypes: string) => void>(),
    setOwnedByMe: vi.fn<(ownedByMe: boolean) => void>(),
    setVisible: vi.fn<(visible: boolean) => void>(),
    triggerCallback: (data: { action: string; docs?: Array<{ id?: string }> }) => {
      registeredCallback?.(data);
    },
  };

  class MockDocsView {
    constructor(public viewId: string) {}
    setMimeTypes(mimeTypes: string) {
      state.setMimeTypes(mimeTypes);
      return this;
    }
    setOwnedByMe(ownedByMe: boolean) {
      state.setOwnedByMe(ownedByMe);
      return this;
    }
  }

  class MockPickerBuilder {
    setAppId(appId: string) {
      state.setAppId(appId);
      return this;
    }
    setDeveloperKey(key: string) {
      state.setDeveloperKey(key);
      return this;
    }
    setOAuthToken(token: string) {
      state.setOAuthToken(token);
      return this;
    }
    setOrigin(origin: string) {
      state.setOrigin(origin);
      return this;
    }
    setTitle(title: string) {
      state.setTitle(title);
      return this;
    }
    addView(view: unknown) {
      state.addView(view);
      return this;
    }
    setCallback(cb: (data: { action: string; docs?: Array<{ id?: string }> }) => void) {
      registeredCallback = cb;
      return this;
    }
    build() {
      return {
        setVisible: state.setVisible,
      };
    }
  }

  vi.stubGlobal("gapi", {
    load: vi.fn((_name: string, config: (() => void) | { callback: () => void }) => {
      if (typeof config === "function") {
        config();
      } else {
        config.callback();
      }
    }),
  });

  vi.stubGlobal("google", {
    picker: {
      Action: {
        LOADED: "loaded",
        PICKED: "picked",
        CANCEL: "cancel",
        ERROR: "error",
      },
      ViewId: {
        SPREADSHEETS: "spreadsheets",
      },
      DocsView: MockDocsView,
      PickerBuilder: MockPickerBuilder,
    },
  });

  return state;
}

describe("pickSpreadsheetId", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    vi.unstubAllGlobals();
    vi.stubEnv("VITE_GOOGLE_PICKER_API_KEY", "AIza-test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns picker-unavailable when API key is missing or blank", async () => {
    vi.stubEnv("VITE_GOOGLE_PICKER_API_KEY", "   ");

    const result = await pickSpreadsheetId({
      accessToken: "token-123",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-unavailable");
  });

  it("returns picker-unavailable when clientId has no leading project number", async () => {
    const result = await pickSpreadsheetId({
      accessToken: "token-123",
      clientId: "invalid-client-id",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-unavailable");
  });

  it("loads Google API script once, configures drive.file picker, and returns chosen spreadsheet ID", async () => {
    let pickerState: ReturnType<typeof installGooglePickerGlobal> | null = null;

    const promise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com",
    });

    const script = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );
    expect(script).not.toBeNull();
    expect(script?.getAttribute("integrity")).toBeNull();

    pickerState = installGooglePickerGlobal();
    script?.dispatchEvent(new Event("load"));

    await vi.waitFor(() => {
      expect(pickerState?.setVisible).toHaveBeenCalledWith(true);
    });

    expect(pickerState.setAppId).toHaveBeenCalledWith("804592774481");
    expect(pickerState.setDeveloperKey).toHaveBeenCalledWith("AIza-test-key");
    expect(pickerState.setOAuthToken).toHaveBeenCalledWith("oauth-access-token");
    expect(pickerState.setMimeTypes).toHaveBeenCalledWith(
      "application/vnd.google-apps.spreadsheet",
    );
    expect(pickerState.setOwnedByMe).toHaveBeenCalledWith(true);

    // Non-terminal LOADED event should be ignored before user picks a file
    pickerState.triggerCallback({ action: "loaded" });
    pickerState.triggerCallback({
      action: "picked",
      docs: [{ id: "sheet-id-42" }],
    });

    const result = await promise;
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("sheet-id-42");
  });

  it("returns picker-cancelled when the user dismisses the picker", async () => {
    const pickerState = installGooglePickerGlobal();

    const promise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });

    await vi.waitFor(() => {
      expect(pickerState.setVisible).toHaveBeenCalledWith(true);
    });

    pickerState.triggerCallback({ action: "cancel" });

    const result = await promise;
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-cancelled");
  });

  it("returns picker-unavailable and cleans up failed script tag on script error", async () => {
    const promise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });

    const script = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );
    script?.dispatchEvent(new Event("error"));

    const result = await promise;
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-unavailable");
    expect(
      document.head.querySelector('script[src="https://apis.google.com/js/api.js"]'),
    ).toBeNull();
  });

  it("returns picker-failed when picker emits error or picked doc lacks an id", async () => {
    const pickerState = installGooglePickerGlobal();

    const firstAttempt = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });
    await vi.waitFor(() => expect(pickerState.setVisible).toHaveBeenCalledTimes(1));
    pickerState.triggerCallback({ action: "error" });
    expect((await firstAttempt)._unsafeUnwrapErr()).toBe("picker-failed");

    const secondAttempt = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });
    await vi.waitFor(() => expect(pickerState.setVisible).toHaveBeenCalledTimes(2));
    pickerState.triggerCallback({ action: "picked", docs: [] });
    expect((await secondAttempt)._unsafeUnwrapErr()).toBe("picker-failed");
  });

  it("reads VITE_GOOGLE_PICKER_API_KEY and passes it to PickerBuilder", async () => {
    vi.stubEnv("VITE_GOOGLE_PICKER_API_KEY", "env-picker-key");
    const pickerState = installGooglePickerGlobal();

    const promise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });

    await vi.waitFor(() => expect(pickerState.setVisible).toHaveBeenCalledWith(true));
    expect(pickerState.setDeveloperKey).toHaveBeenCalledWith("env-picker-key");
    pickerState.triggerCallback({ action: "cancel" });
    await promise;
  });

  it("returns picker-unavailable when gapi.load triggers onerror or ontimeout", async () => {
    vi.stubGlobal("gapi", {
      load: vi.fn((_name: string, config: { onerror?: () => void }) => {
        config.onerror?.();
      }),
    });

    const onErrorResult = await pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });
    expect(onErrorResult._unsafeUnwrapErr()).toBe("picker-unavailable");

    vi.stubGlobal("gapi", {
      load: vi.fn((_name: string, config: { ontimeout?: () => void }) => {
        config.ontimeout?.();
      }),
    });

    const onTimeoutResult = await pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });
    expect(onTimeoutResult._unsafeUnwrapErr()).toBe("picker-unavailable");
  });

  it("returns picker-unavailable when Google API script loading times out", async () => {
    vi.useFakeTimers();

    const promise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });

    expect(
      document.head.querySelector('script[src="https://apis.google.com/js/api.js"]'),
    ).not.toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-unavailable");
    expect(
      document.head.querySelector('script[src="https://apis.google.com/js/api.js"]'),
    ).toBeNull();
  });

  it("returns picker-failed when PickerBuilder throws synchronously", async () => {
    installGooglePickerGlobal();
    vi.stubGlobal("google", {
      picker: {
        Action: { PICKED: "picked", CANCEL: "cancel", ERROR: "error" },
        ViewId: { SPREADSHEETS: "spreadsheets" },
        DocsView: class {
          setMimeTypes() {
            return this;
          }
          setOwnedByMe() {
            return this;
          }
        },
        PickerBuilder: class {
          constructor() {
            throw new Error("Picker iframe init failed");
          }
        },
      },
    });

    const result = await pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-failed");
  });

  it("returns picker-cancelled immediately without loading script when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
      signal: controller.signal,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-cancelled");
    expect(
      document.head.querySelector('script[src="https://apis.google.com/js/api.js"]'),
    ).toBeNull();
  });

  it("hides dialog and returns picker-cancelled when AbortSignal aborts", async () => {
    const pickerState = installGooglePickerGlobal();
    const controller = new AbortController();

    const promise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(pickerState.setVisible).toHaveBeenCalledWith(true));
    controller.abort();

    const result = await promise;
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-cancelled");
    expect(pickerState.setVisible).toHaveBeenCalledWith(false);
  });

  it("still settles with picker-cancelled when hiding the picker on abort throws", async () => {
    const pickerState = installGooglePickerGlobal();
    pickerState.setVisible.mockImplementation((visible) => {
      if (!visible) throw new Error("Picker iframe detached");
    });
    const controller = new AbortController();

    const promise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(pickerState.setVisible).toHaveBeenCalledWith(true));
    controller.abort();

    const result = await promise;
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-cancelled");
  });

  it("aborts immediately without waiting for timeout when signal aborts while loading gapi or picker namespace", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();

    const gapiPendingPromise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
      signal: controller.signal,
    });

    const script = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );
    expect(script).not.toBeNull();

    controller.abort();
    const abortedDuringScriptLoad = await gapiPendingPromise;
    expect(abortedDuringScriptLoad.isErr()).toBe(true);
    expect(abortedDuringScriptLoad._unsafeUnwrapErr()).toBe("picker-cancelled");

    // Late script load after abort must not open Picker
    const latePickerState = installGooglePickerGlobal();
    script?.dispatchEvent(new Event("load"));
    await vi.runAllTimersAsync();
    expect(latePickerState.setVisible).not.toHaveBeenCalled();

    // Now test abort while gapi.load("picker") is hanging
    vi.stubGlobal("google", undefined);
    let capturedLoadCallback: (() => void) | undefined;
    vi.stubGlobal("gapi", {
      load: vi.fn((_name: string, config: { callback: () => void }) => {
        capturedLoadCallback = config.callback;
      }),
    });

    const controller2 = new AbortController();
    const nsPendingPromise = pickSpreadsheetId({
      accessToken: "oauth-access-token",
      clientId: "804592774481-client.apps.googleusercontent.com",
      signal: controller2.signal,
    });

    await vi.waitFor(() => expect(capturedLoadCallback).toBeDefined());
    controller2.abort();

    const abortedDuringNsLoad = await nsPendingPromise;
    expect(abortedDuringNsLoad.isErr()).toBe(true);
    expect(abortedDuringNsLoad._unsafeUnwrapErr()).toBe("picker-cancelled");

    const pickerAfterAbort = installGooglePickerGlobal();
    capturedLoadCallback?.();
    await Promise.resolve();
    expect(pickerAfterAbort.setVisible).not.toHaveBeenCalled();
  });
});
