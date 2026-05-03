import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { DeloadLifecycle } from "./deloadLifecycle";
import { isAuthError } from "./utils/isAuthError";
import { parseData } from "./utils/parseData";

const DeloadStatusSchema = z.enum(["active", "inactive"]);

const DeloadTriggerSnapshotSchema = z
  .object({
    weeklyTotalSets: z.array(z.number()),
    weeklyTonnage: z.array(z.number()),
    triggeredBy: z.array(z.string()).optional(),
    decliningExercisesAtStart: z.number().optional(),
  })
  .optional();

export const DeloadLifecycleSchema = z
  .object({
    status: DeloadStatusSchema,
    startedAtIso: z.string().optional(),
    endsAtIso: z.string().optional(),
    recommendationIssuedAtIso: z.string().optional(),
    triggerReason: z.string().optional(),
    triggerSnapshot: DeloadTriggerSnapshotSchema,
    lastEndedAtIso: z.string().optional(),
    currentBlockStartedAtIso: z.string().optional(),
    postStopConservativeSessionsRemaining: z.number().optional(),
  })
  .optional();

const DeloadLifecycleRowSchema = z.object({
  data: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return undefined;
      }
    }
    return val;
  }, DeloadLifecycleSchema),
});

const LegacyDeloadLifecycleRowSchema = z.object({
  deloadLifecycle: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return undefined;
      }
    }
    return val;
  }, DeloadLifecycleSchema),
});

const SHEET_NAME = "DeloadLifecycle";
const USER_PROFILE_SHEET_NAME = "UserProfile";
const SHEET_HEADERS = ["data"] as const;

type SheetLike = {
  loadHeaderRow: () => Promise<void>;
  headerValues?: string[];
  setHeaderRow: (headers: string[]) => Promise<void>;
  getRows: () => Promise<any[]>;
  addRow: (row: Record<string, string>) => Promise<unknown>;
};

const getSheet = (doc: GoogleSpreadsheet) => doc.sheetsByTitle[SHEET_NAME];
const addSheet = (doc: GoogleSpreadsheet) =>
  doc.addSheet({
    title: SHEET_NAME,
    headerValues: [...SHEET_HEADERS],
  });

async function ensureHeaders(sheet: SheetLike): Promise<void> {
  await sheet.loadHeaderRow();
  const currentHeaders = Array.isArray(sheet.headerValues) ? sheet.headerValues : [];
  const missingHeaders = SHEET_HEADERS.filter((header) => !currentHeaders.includes(header));
  if (missingHeaders.length === 0) return;
  await sheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
  await sheet.loadHeaderRow();
}

async function loadFromDedicatedSheet(
  doc: GoogleSpreadsheet,
): Promise<Result<DeloadLifecycle | undefined, "load-failed" | "parse-data-failed" | "auth-failed">> {
  const sheet = getSheet(doc);
  if (!sheet) return ok(undefined);

  await ensureHeaders(sheet);
  const rows = await sheet.getRows();
  if (rows.length === 0) return ok(undefined);

  const result = await parseData(DeloadLifecycleRowSchema, rows[0]?.toObject());
  return result.isOk() ? ok(result.value.data) : err(result.error);
}

async function loadFromLegacyUserProfileSheet(
  doc: GoogleSpreadsheet,
): Promise<Result<DeloadLifecycle | undefined, "load-failed" | "parse-data-failed" | "auth-failed">> {
  const sheet = doc.sheetsByTitle[USER_PROFILE_SHEET_NAME];
  if (!sheet) return ok(undefined);

  const rows = await sheet.getRows();
  if (rows.length === 0) return ok(undefined);

  const result = await parseData(LegacyDeloadLifecycleRowSchema, rows[0]?.toObject());
  return result.isOk() ? ok(result.value.deloadLifecycle) : err(result.error);
}

export async function loadDeloadLifecycle(
  doc: GoogleSpreadsheet,
): Promise<Result<DeloadLifecycle | undefined, "load-failed" | "parse-data-failed" | "auth-failed">> {
  try {
    const dedicatedResult = await loadFromDedicatedSheet(doc);
    if (dedicatedResult.isErr()) return dedicatedResult;
    if (dedicatedResult.value) return dedicatedResult;
    return await loadFromLegacyUserProfileSheet(doc);
  } catch (error) {
    if (isAuthError(error)) {
      console.error("Auth failed during loadDeloadLifecycle. Error:", error);
      return err("auth-failed");
    }
    console.error("Failed to load deload lifecycle. Error:", error);
    Sentry.captureException(error, {
      tags: { scope: "deload-lifecycle-sheet", feature: "load" },
    });
    return err("load-failed");
  }
}

export async function saveDeloadLifecycle(
  lifecycle: DeloadLifecycle | undefined,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "save-failed" | "auth-failed">> {
  try {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    await ensureHeaders(sheet);
    const rows = await sheet.getRows();
    const serialized = { data: lifecycle ? JSON.stringify(lifecycle) : "" };

    if (rows.length > 0) {
      rows[0]?.assign(serialized);
      await rows[0]?.save();
    } else {
      await sheet.addRow(serialized);
    }

    return ok();
  } catch (error) {
    if (isAuthError(error)) {
      console.error("Auth failed during saveDeloadLifecycle. Error:", error);
      return err("auth-failed");
    }
    console.error("Failed to save deload lifecycle. Error:", error);
    Sentry.captureException(error, {
      tags: { scope: "deload-lifecycle-sheet", feature: "save" },
    });
    return err("save-failed");
  }
}
