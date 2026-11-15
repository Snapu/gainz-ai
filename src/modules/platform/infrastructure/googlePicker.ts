import * as Sentry from "@sentry/vue";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";

const GOOGLE_API_SCRIPT_URL = "https://apis.google.com/js/api.js";
const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const LOAD_TIMEOUT_MS = 10_000;

export type GooglePickerError = "picker-cancelled" | "picker-unavailable" | "picker-failed";

export interface PickSpreadsheetOptions {
  accessToken: string;
  clientId: string;
  signal?: AbortSignal;
}

interface PickerCallbackData {
  action: string;
  docs?: Array<{ id?: string }>;
}

interface PickerInstance {
  setVisible(visible: boolean): void;
}

interface PickerBuilderInstance {
  setAppId(appId: string): this;
  setDeveloperKey(key: string): this;
  setOAuthToken(token: string): this;
  setOrigin(origin: string): this;
  setTitle(title: string): this;
  addView(view: unknown): this;
  setCallback(callback: (data: PickerCallbackData) => void): this;
  build(): PickerInstance;
}

interface DocsViewInstance {
  setMimeTypes(mimeTypes: string): this;
  setOwnedByMe(ownedByMe: boolean): this;
}

interface GooglePickerNamespace {
  Action: { PICKED: string; CANCEL: string; ERROR?: string };
  ViewId: { SPREADSHEETS: string };
  DocsView: new (viewId: string) => DocsViewInstance;
  PickerBuilder: new () => PickerBuilderInstance;
}

interface GapiGlobal {
  load(
    apiName: string,
    config: {
      callback: () => void;
      onerror?: () => void;
      timeout?: number;
      ontimeout?: () => void;
    },
  ): void;
}

type GoogleWindow = Window & {
  gapi?: GapiGlobal;
  google?: { picker?: GooglePickerNamespace };
};

let inFlightGapiScript: Promise<boolean> | null = null;

async function ensureGapiLoaded(win: GoogleWindow): Promise<GapiGlobal | null> {
  if (win.gapi) return win.gapi;

  if (!inFlightGapiScript) {
    inFlightGapiScript = new Promise<boolean>((resolve) => {
      const script = document.createElement("script");
      script.src = GOOGLE_API_SCRIPT_URL;
      script.async = true;

      const finish = (loaded: boolean) => {
        clearTimeout(timer);
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onFail);
        if (!loaded) script.remove();
        resolve(loaded);
      };
      const onLoad = () => finish(true);
      const onFail = () => finish(false);
      const timer = setTimeout(onFail, LOAD_TIMEOUT_MS);

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onFail, { once: true });
      document.head.appendChild(script);
    }).finally(() => {
      inFlightGapiScript = null;
    });
  }

  const loaded = await inFlightGapiScript;
  return loaded ? (win.gapi ?? null) : null;
}

async function ensurePickerNamespace(): Promise<GooglePickerNamespace | null> {
  const win = window as GoogleWindow;
  if (win.google?.picker) return win.google.picker;

  const gapi = await ensureGapiLoaded(win);
  if (!gapi) return null;

  return new Promise<GooglePickerNamespace | null>((resolve) => {
    gapi.load("picker", {
      timeout: LOAD_TIMEOUT_MS,
      callback: () => resolve(win.google?.picker ?? null),
      onerror: () => resolve(null),
      ontimeout: () => resolve(null),
    });
  });
}

function parsePickerAction(
  data: PickerCallbackData,
  action: GooglePickerNamespace["Action"],
): Result<string, GooglePickerError> | null {
  if (data.action === action.PICKED) {
    const pickedId = data.docs?.[0]?.id?.trim();
    return pickedId ? ok(pickedId) : err("picker-failed");
  }
  if (data.action === action.CANCEL) {
    return err("picker-cancelled");
  }
  if (action.ERROR && data.action === action.ERROR) {
    return err("picker-failed");
  }
  return null;
}

function createPickerInstance(
  pickerNs: GooglePickerNamespace,
  options: PickSpreadsheetOptions,
  appId: string,
  apiKey: string,
  onSettle: (result: Result<string, GooglePickerError>) => void,
): PickerInstance {
  const view = new pickerNs.DocsView(pickerNs.ViewId.SPREADSHEETS)
    .setMimeTypes(SPREADSHEET_MIME_TYPE)
    .setOwnedByMe(true);

  return new pickerNs.PickerBuilder()
    .setAppId(appId)
    .setDeveloperKey(apiKey)
    .setOAuthToken(options.accessToken)
    .setOrigin(window.location.origin)
    .setTitle("Select your Gainz AI spreadsheet")
    .addView(view)
    .setCallback((data) => {
      const result = parsePickerAction(data, pickerNs.Action);
      if (result) onSettle(result);
    })
    .build();
}

function openPicker(
  options: PickSpreadsheetOptions,
  appId: string,
  apiKey: string,
): Promise<Result<string, GooglePickerError>> {
  if (options.signal?.aborted) {
    return Promise.resolve(err("picker-cancelled"));
  }

  return new Promise<Result<string, GooglePickerError>>((resolve) => {
    let settled = false;
    let picker: PickerInstance | null = null;

    const settle = (result: Result<string, GooglePickerError>, hideOnAbort = false) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      resolve(result);
      if (!hideOnAbort) return;
      try {
        picker?.setVisible(false);
      } catch {
        // Ignore Picker iframe teardown errors on abort
      }
    };

    const onAbort = () => settle(err("picker-cancelled"), true);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    void ensurePickerNamespace().then(
      (pickerNs) => {
        if (settled) return;
        if (!pickerNs) {
          settle(err("picker-unavailable"));
          return;
        }
        try {
          picker = createPickerInstance(pickerNs, options, appId, apiKey, settle);
          if (!settled) {
            picker.setVisible(true);
          }
        } catch {
          settle(err("picker-failed"));
        }
      },
      () => settle(err("picker-unavailable")),
    );
  });
}

/**
 * Opens Google Picker filtered to Google Spreadsheets (`drive.file` access) and resolves
 * the selected spreadsheet ID, or fails with a typed `GooglePickerError`.
 */
export function pickSpreadsheetId(
  options: PickSpreadsheetOptions,
): ResultAsync<string, GooglePickerError> {
  const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY?.trim() || undefined;
  const appId = /^(\d+)-/.exec(options.clientId.trim())?.[1] ?? null;

  if (!apiKey || !appId) {
    Sentry.captureMessage("Google Picker is missing required configuration", {
      level: "warning",
      tags: { scope: "google-picker" },
      extra: { hasApiKey: Boolean(apiKey), hasAppId: Boolean(appId) },
    });
    return errAsync("picker-unavailable");
  }

  return new ResultAsync(openPicker(options, appId, apiKey)).orTee((reason) => {
    if (reason !== "picker-cancelled") {
      Sentry.captureMessage("Google Picker failed", {
        level: "error",
        tags: { scope: "google-picker", reason },
      });
    }
  });
}
