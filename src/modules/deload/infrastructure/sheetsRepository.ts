import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import type { DeloadPhaseRepository } from "@/modules/deload/application";
import { isAuthError } from "@/modules/shared/infrastructure/utils/isAuthError";
import { isFatigueTriggerId } from "@/modules/trainingInsights/domain";
import type { DeloadPhase, FatigueTriggerId } from "../domain/types";

const SHEET_NAME = "DeloadPhase";
const HEADERS = ["startedAt", "endsAt", "fatigueRiskScore", "triggeredBy", "canceledAt"] as const;

type LoadError = "load-failed" | "auth-failed";
type SaveError = "save-failed" | "auth-failed";

function getSheet(doc: GoogleSpreadsheet) {
  return doc.sheetsByTitle[SHEET_NAME];
}

async function ensureSheet(doc: GoogleSpreadsheet) {
  return getSheet(doc) ?? (await doc.addSheet({ title: SHEET_NAME, headerValues: [...HEADERS] }));
}

interface HeaderManagedSheet {
  loadHeaderRow: () => Promise<void>;
  setHeaderRow: (headers: string[]) => Promise<void>;
  headerValues?: string[];
}

async function ensureHeaders(sheet: HeaderManagedSheet): Promise<void> {
  await sheet.loadHeaderRow();
  const current: string[] = Array.isArray(sheet.headerValues) ? sheet.headerValues : [];
  const missing = HEADERS.filter((h) => !current.includes(h));
  if (missing.length === 0) return;
  await sheet.setHeaderRow([...current, ...missing]);
  await sheet.loadHeaderRow();
}

function deserialize(raw: Record<string, string>): DeloadPhase | null {
  const { startedAt, endsAt, fatigueRiskScore, triggeredBy, canceledAt } = raw;
  if (!startedAt || !endsAt) return null;

  const score = parseFloat(fatigueRiskScore ?? "0");
  const triggers = (triggeredBy ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is FatigueTriggerId => isFatigueTriggerId(t));

  return {
    startedAt,
    endsAt,
    fatigueRiskScore: Number.isNaN(score) ? 0 : score,
    triggeredBy: triggers,
    canceledAt: canceledAt || undefined,
  };
}

function serialize(phase: DeloadPhase | null): Record<string, string> {
  if (!phase) {
    return { startedAt: "", endsAt: "", fatigueRiskScore: "", triggeredBy: "", canceledAt: "" };
  }
  return {
    startedAt: phase.startedAt,
    endsAt: phase.endsAt,
    fatigueRiskScore: String(phase.fatigueRiskScore),
    triggeredBy: phase.triggeredBy.join(","),
    canceledAt: phase.canceledAt ?? "",
  };
}

export async function loadDeloadPhaseInfra(
  doc: GoogleSpreadsheet,
): Promise<Result<DeloadPhase | null, LoadError>> {
  try {
    const sheet = getSheet(doc) ?? (await ensureSheet(doc));
    await ensureHeaders(sheet);
    const rows = await sheet.getRows();
    if (rows.length === 0) return ok(null);
    const phase = deserialize(rows[0]!.toObject());
    return ok(phase);
  } catch (error) {
    if (isAuthError(error)) return err("auth-failed");
    Sentry.captureException(error, { tags: { scope: "deload-phase-sheet", feature: "load" } });
    return err("load-failed");
  }
}

export async function saveDeloadPhaseInfra(
  phase: DeloadPhase | null,
  doc: GoogleSpreadsheet,
): Promise<Result<void, SaveError>> {
  try {
    const sheet = await ensureSheet(doc);
    await ensureHeaders(sheet);
    const rows = await sheet.getRows();
    const data = serialize(phase);
    if (rows.length > 0) {
      rows[0]!.assign(data);
      await rows[0]!.save();
    } else {
      await sheet.addRow(data);
    }
    return ok(undefined);
  } catch (error) {
    if (isAuthError(error)) return err("auth-failed");
    Sentry.captureException(error, { tags: { scope: "deload-phase-sheet", feature: "save" } });
    return err("save-failed");
  }
}

export function createDeloadPhaseRepository(doc: GoogleSpreadsheet): DeloadPhaseRepository {
  return {
    load: () => loadDeloadPhaseInfra(doc),
    save: (phase) => saveDeloadPhaseInfra(phase, doc),
  };
}
