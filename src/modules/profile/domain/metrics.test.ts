import { describe, expect, it } from "vitest";
import {
  calculateMetricUpdates,
  type EmpiricalDiscoveryInput,
  type PhysiologicalMetric,
} from "./metrics";

describe("calculateMetricUpdates", () => {
  it("returns null if trend is stable or plateau", () => {
    const insight: EmpiricalDiscoveryInput = {
      sets: 15,
      landmark: "at_MAV",
      trendStatus: "stable",
    };
    expect(calculateMetricUpdates(insight)).toBeNull();

    const insight2: EmpiricalDiscoveryInput = {
      sets: 15,
      landmark: "at_MAV",
      trendStatus: "plateau",
    };
    expect(calculateMetricUpdates(insight2)).toBeNull();
  });

  describe("Personal MAV Discovery", () => {
    it("discovers personal MAV when improving at MAV", () => {
      const insight: EmpiricalDiscoveryInput = {
        sets: 18,
        landmark: "at_MAV",
        trendStatus: "improving",
      };
      const updates = calculateMetricUpdates(insight);
      expect(updates).toEqual({ personalMAV: 18 });
    });

    it("does not update personal MAV if current sets are lower than existing discovery", () => {
      const insight: EmpiricalDiscoveryInput = {
        sets: 15,
        landmark: "at_MAV",
        trendStatus: "improving",
      };
      const existing: PhysiologicalMetric = {
        muscleGroup: "Chest",
        personalMAV: 18,
        lastUpdated: "2024-01-01",
      };
      const updates = calculateMetricUpdates(insight, existing);
      expect(updates).toBeNull();
    });

    it("updates personal MAV if current sets are higher than existing discovery", () => {
      const insight: EmpiricalDiscoveryInput = {
        sets: 20,
        landmark: "at_MAV",
        trendStatus: "improving",
      };
      const existing: PhysiologicalMetric = {
        muscleGroup: "Chest",
        personalMAV: 18,
        lastUpdated: "2024-01-01",
      };
      const updates = calculateMetricUpdates(insight, existing);
      expect(updates).toEqual({ personalMAV: 20 });
    });

    it("does not discover personal MAV if not at_MAV (e.g. approaching_MRV)", () => {
      const insight: EmpiricalDiscoveryInput = {
        sets: 25,
        landmark: "approaching_MRV",
        trendStatus: "improving",
      };
      const updates = calculateMetricUpdates(insight);
      expect(updates).toBeNull();
    });
  });

  describe("Personal MRV Discovery", () => {
    it("discovers personal MRV when dropping while above_MRV", () => {
      const insight: EmpiricalDiscoveryInput = {
        sets: 25,
        landmark: "above_MRV",
        trendStatus: "dropping",
      };
      const updates = calculateMetricUpdates(insight);
      expect(updates).toEqual({ personalMRV: 25 });
    });

    it("does not discover personal MRV if dropping but not above_MRV", () => {
      const insight: EmpiricalDiscoveryInput = {
        sets: 12,
        landmark: "at_MAV",
        trendStatus: "dropping",
      };
      const updates = calculateMetricUpdates(insight);
      // It is normal to drop in strength for other reasons (fatigue, detraining) below MRV.
      expect(updates).toBeNull();
    });

    it("overwrites existing personal MRV with the new drop point", () => {
      const insight: EmpiricalDiscoveryInput = {
        sets: 22,
        landmark: "above_MRV",
        trendStatus: "dropping",
      };
      const existing: PhysiologicalMetric = {
        muscleGroup: "Chest",
        personalMRV: 26,
        lastUpdated: "2024-01-01",
      };
      // If they drop at 22, their MRV has lowered (maybe due to stress). We should capture it.
      const updates = calculateMetricUpdates(insight, existing);
      expect(updates).toEqual({ personalMRV: 22 });
    });
  });
});
