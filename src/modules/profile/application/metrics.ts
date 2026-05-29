import type { ResultAsync } from "neverthrow";
import type { PhysiologicalMetricsMap } from "../domain/metrics";

export type MetricsLoadError = "load-failed" | "parse-data-failed" | "auth-failed";
export type MetricsSaveError = "save-failed" | "auth-failed";

export interface MetricsRepository {
  load: () => ResultAsync<PhysiologicalMetricsMap, MetricsLoadError>;
  save: (metrics: PhysiologicalMetricsMap) => ResultAsync<void, MetricsSaveError>;
}

export function loadMetrics(repository: MetricsRepository) {
  return repository.load();
}

export function saveMetrics(metrics: PhysiologicalMetricsMap, repository: MetricsRepository) {
  return repository.save(metrics);
}
