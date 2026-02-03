import { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";

export const SPREADSHEET_NAME = "Gainz AI App Database";

export async function getSpreadsheetId(
  name: string,
  accessToken: string,
): Promise<Result<string | null, "get-spreadsheet-id-failed" | "parse-data-failed">> {
  const query = `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet'`;

  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      console.debug("Failed to get spreadsheet ID. Response:", response);
      return err("get-spreadsheet-id-failed");
    }
    const data = await response.json();

    if (!data.files?.length) return ok(null);
    if (data.files.length > 1) {
      console.warn(
        `Found multiple (${data.files.length}) spreadsheets with name ${name}. Picking latest modified.`,
      );
    }
    return ok(data.files[0].id);
  } catch (error) {
    console.debug("Failed to get spreadsheet ID. Error:", error);
    return err("get-spreadsheet-id-failed");
  }
}

export async function loadSpreadsheet(
  id: string,
  accessToken: string,
): Promise<Result<GoogleSpreadsheet, "load-spreadsheet-failed">> {
  try {
    const doc = new GoogleSpreadsheet(id, { token: accessToken });
    await doc.loadInfo();
    return ok(doc);
  } catch (error) {
    console.error(`Failed to load spreadsheet with id ${id}. Error:`, error);
    return err("load-spreadsheet-failed");
  }
}

export async function createSpreadsheet(
  name: string,
  accessToken: string,
): Promise<Result<GoogleSpreadsheet, "create-spreadsheet-failed">> {
  try {
    const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(
      { token: accessToken },
      { title: name },
    );
    return ok(doc);
  } catch (error) {
    console.warn(`Failed to create new spreadsheet with name ${name}. Error:`, error);
    return err("create-spreadsheet-failed");
  }
}
