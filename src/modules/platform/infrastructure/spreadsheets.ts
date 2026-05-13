import * as Sentry from "@sentry/vue";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { isAuthError } from "@/modules/platform/infrastructure/utils/isAuthError";

export const SPREADSHEET_NAME = "Gainz AI App Database";

type GetSpreadsheetIdError = "get-spreadsheet-id-failed" | "parse-data-failed" | "auth-failed";
type SpreadsheetLoadError = "load-spreadsheet-failed" | "auth-failed";
type SpreadsheetCreateError = "create-spreadsheet-failed" | "auth-failed";

function createSpreadsheetQuery(name: string): string {
  return `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and 'me' in owners`;
}

function mapGetSpreadsheetIdError(error: unknown): "get-spreadsheet-id-failed" {
  console.debug("Failed to get spreadsheet ID. Error:", error);
  Sentry.captureException(error, {
    tags: { scope: "spreadsheets-service", feature: "get-id" },
  });
  return "get-spreadsheet-id-failed";
}

function mapSpreadsheetJsonParseError(error: unknown): "parse-data-failed" {
  console.debug("Failed to parse spreadsheet ID response. Error:", error);
  Sentry.captureException(error, {
    tags: { scope: "spreadsheets-service", feature: "get-id-parse" },
  });
  return "parse-data-failed";
}

function mapLoadSpreadsheetError(id: string, error: unknown): SpreadsheetLoadError {
  console.error(`Failed to load spreadsheet with id ${id}. Error:`, error);
  if (isAuthError(error)) {
    return "auth-failed";
  }
  Sentry.captureException(error, {
    tags: { scope: "spreadsheets-service", feature: "load" },
    extra: { spreadsheetId: id },
  });
  return "load-spreadsheet-failed";
}

function mapCreateSpreadsheetError(name: string, error: unknown): SpreadsheetCreateError {
  console.warn(`Failed to create new spreadsheet with name ${name}. Error:`, error);
  if (isAuthError(error)) {
    return "auth-failed";
  }
  Sentry.captureException(error, {
    tags: { scope: "spreadsheets-service", feature: "create" },
    extra: { spreadsheetName: name },
  });
  return "create-spreadsheet-failed";
}

export function getSpreadsheetId(
  name: string,
  accessToken: string,
): ResultAsync<string | null, GetSpreadsheetIdError> {
  const query = createSpreadsheetQuery(name);

  return ResultAsync.fromPromise(
    fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    ),
    mapGetSpreadsheetIdError,
  ).andThen((response) => {
    if (!response.ok) {
      console.debug("Failed to get spreadsheet ID. Response:", response);
      if (response.status === 401 || response.status === 403) {
        return errAsync<string | null, GetSpreadsheetIdError>("auth-failed");
      }
      Sentry.captureMessage("Failed to get spreadsheet ID", {
        level: "warning",
        tags: { scope: "spreadsheets-service", feature: "get-id" },
        extra: { status: response.status },
      });
      return errAsync<string | null, GetSpreadsheetIdError>("get-spreadsheet-id-failed");
    }

    return ResultAsync.fromPromise(response.json(), mapSpreadsheetJsonParseError).andThen(
      (data: { files?: Array<{ id: string }> }) => {
        if (!data.files?.length) return okAsync(null);
        if (data.files.length > 1) {
          console.warn(
            `Found multiple (${data.files.length}) spreadsheets with name ${name}. Picking latest modified.`,
          );
        }
        return okAsync(data.files[0]?.id ?? null);
      },
    );
  });
}

export function loadSpreadsheet(
  id: string,
  accessToken: string,
): ResultAsync<GoogleSpreadsheet, SpreadsheetLoadError> {
  return ResultAsync.fromThrowable(
    async () => {
      const doc = new GoogleSpreadsheet(id, { token: accessToken });
      await doc.loadInfo();
      if (doc.locale !== "en_US") {
        await doc.updateProperties({ locale: "en_US" });
      }
      return doc;
    },
    (error) => mapLoadSpreadsheetError(id, error),
  )();
}

export function createSpreadsheet(
  name: string,
  accessToken: string,
): ResultAsync<GoogleSpreadsheet, SpreadsheetCreateError> {
  return ResultAsync.fromThrowable(
    async () => {
      const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(
        { token: accessToken },
        { title: name },
      );
      await doc.updateProperties({ locale: "en_US" });
      return doc;
    },
    (error) => mapCreateSpreadsheetError(name, error),
  )();
}
