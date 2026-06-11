import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { ResultAsync } from "neverthrow";
import { isAuthError } from "@/modules/platform/infrastructure";
import type {
  MetricsLoadError,
  MetricsRepository,
  MetricsSaveError,
} from "@/modules/profile/application";
import type { PhysiologicalMetric, PhysiologicalMetricsMap } from "@/modules/profile/domain";
import { isMuscleGroup } from "@/modules/sharedKernel/domain";

const SHEET_NAME = "Physiological Metrics";
const METRICS_HEADERS = ["muscleGroup", "personalMAV", "personalMRV", "lastUpdated"] as const;

const getSheet = (doc: GoogleSpreadsheet) => doc.sheetsByTitle[SHEET_NAME];
const addSheet = (doc: GoogleSpreadsheet) =>
  doc.addSheet({
    title: SHEET_NAME,
    headerValues: [...METRICS_HEADERS],
  });

interface HeaderManagedSheet {
  loadHeaderRow: () => Promise<void>;
  setHeaderRow: (headers: string[]) => Promise<void>;
  headerValues?: string[];
}

async function ensureMetricsHeaders(sheet: HeaderManagedSheet): Promise<void> {
  await sheet.loadHeaderRow();
  const currentHeaders: string[] = Array.isArray(sheet.headerValues) ? sheet.headerValues : [];
  const missingHeaders = METRICS_HEADERS.filter((h) => !currentHeaders.includes(h));
  if (missingHeaders.length === 0) return;
  await sheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
  await sheet.loadHeaderRow();
}

function parseRow(
  row: Record<string, string | number | boolean | undefined>,
): PhysiologicalMetric | null {
  const muscleGroup = String(row.muscleGroup);
  if (!isMuscleGroup(muscleGroup)) return null;

  return {
    muscleGroup,
    personalMAV: row.personalMAV ? Number(row.personalMAV) : undefined,
    personalMRV: row.personalMRV ? Number(row.personalMRV) : undefined,
    lastUpdated: String(row.lastUpdated || ""),
  };
}

function serializeRow(metric: PhysiologicalMetric): Record<string, string> {
  return {
    muscleGroup: metric.muscleGroup,
    personalMAV: metric.personalMAV?.toString() ?? "",
    personalMRV: metric.personalMRV?.toString() ?? "",
    lastUpdated: metric.lastUpdated,
  };
}

export function loadMetricsInfra(
  doc: GoogleSpreadsheet,
): ResultAsync<PhysiologicalMetricsMap, MetricsLoadError> {
  const mapLoadError = (error: unknown): MetricsLoadError => {
    if (isAuthError(error)) {
      console.error("Auth failed during loadMetrics. Error:", error);
      return "auth-failed";
    }
    console.error("Failed to load physiological metrics. Error:", error);
    Sentry.captureException(error, {
      tags: { scope: "metrics-service", feature: "load" },
    });
    return "load-failed";
  };

  return ResultAsync.fromThrowable(async () => {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    await ensureMetricsHeaders(sheet);
    const rows = await sheet.getRows();

    const metricsMap: PhysiologicalMetricsMap = {} as PhysiologicalMetricsMap;
    for (const row of rows) {
      const parsed = parseRow(row.toObject());
      if (parsed) {
        metricsMap[parsed.muscleGroup] = parsed;
      }
    }
    return metricsMap;
  }, mapLoadError)();
}

export function saveMetricsInfra(
  metrics: PhysiologicalMetricsMap,
  doc: GoogleSpreadsheet,
): ResultAsync<void, MetricsSaveError> {
  const mapSaveError = (error: unknown): MetricsSaveError => {
    if (isAuthError(error)) {
      console.error("Auth failed during saveMetrics. Error:", error);
      return "auth-failed";
    }
    console.error("Failed to save physiological metrics. Error:", error);
    Sentry.captureException(error, {
      tags: { scope: "metrics-service", feature: "save" },
    });
    return "save-failed";
  };

  return ResultAsync.fromThrowable(async () => {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    await ensureMetricsHeaders(sheet);
    const rows = await sheet.getRows();

    const rowByMuscle = new Map(rows.map((row) => [String(row.get("muscleGroup")), row]));

    for (const metric of Object.values(metrics)) {
      const serialized = serializeRow(metric);
      const existingRow = rowByMuscle.get(metric.muscleGroup);

      if (existingRow) {
        existingRow.assign(serialized);
        await existingRow.save();
      } else {
        await sheet.addRow(serialized);
      }
    }
  }, mapSaveError)();
}

export function createMetricsRepository(doc: GoogleSpreadsheet): MetricsRepository {
  return {
    load: () => loadMetricsInfra(doc),
    save: (metrics) => saveMetricsInfra(metrics, doc),
  };
}
