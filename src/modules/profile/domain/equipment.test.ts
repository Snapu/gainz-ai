import { describe, expect, it } from "vitest";
import {
  addEquipmentItem,
  EQUIPMENT_PRESETS,
  EquipmentAccessSchema,
  getCustomEquipment,
  getSelectedPresetEquipment,
  MAX_EQUIPMENT_ITEMS,
  MAX_EQUIPMENT_NAME_LENGTH,
  mergePresetAndCustomEquipment,
  normalizeEquipmentList,
  removeEquipmentItem,
} from "./equipment";

describe("equipment domain", () => {
  describe("EQUIPMENT_PRESETS", () => {
    it("exposes the 13 baseline presets in expected display order", () => {
      expect(EQUIPMENT_PRESETS).toHaveLength(13);
      expect(EQUIPMENT_PRESETS[0]).toEqual({ id: "bodyweight", label: "Bodyweight only" });
      expect(EQUIPMENT_PRESETS[12]).toEqual({ id: "medicine_ball", label: "Medicine ball" });
    });
  });

  describe("addEquipmentItem", () => {
    it("adds a trimmed and space-collapsed custom equipment entry", () => {
      const result = addEquipmentItem(["dumbbells"], "  Smith   Machine  ");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(["dumbbells", "Smith Machine"]);
      }
    });

    it("resolves preset label or id aliases to canonical preset id", () => {
      const byLabel = addEquipmentItem(undefined, "Dumbbells");
      expect(byLabel.isOk()).toBe(true);
      if (byLabel.isOk()) {
        expect(byLabel.value).toEqual(["dumbbells"]);
      }

      const byLabelCase = addEquipmentItem(undefined, "barbell & rack");
      expect(byLabelCase.isOk()).toBe(true);
      if (byLabelCase.isOk()) {
        expect(byLabelCase.value).toEqual(["barbell_rack"]);
      }

      const byIdCase = addEquipmentItem(undefined, "CABLE_MACHINE");
      expect(byIdCase.isOk()).toBe(true);
      if (byIdCase.isOk()) {
        expect(byIdCase.value).toEqual(["cable_machine"]);
      }
    });

    it("returns semantic errors for invalid inputs", () => {
      expect(addEquipmentItem(undefined, "   ")._unsafeUnwrapErr()).toBe("empty");
      expect(addEquipmentItem(undefined, "a")._unsafeUnwrapErr()).toBe("too-short");
      expect(
        addEquipmentItem(undefined, "x".repeat(MAX_EQUIPMENT_NAME_LENGTH + 1))._unsafeUnwrapErr(),
      ).toBe("too-long");
      expect(addEquipmentItem(undefined, "Rack, Bench")._unsafeUnwrapErr()).toBe(
        "invalid-characters",
      );
      expect(addEquipmentItem(undefined, "Smith\nMachine")._unsafeUnwrapErr()).toBe(
        "invalid-characters",
      );
      expect(addEquipmentItem(undefined, "Smith\tMachine")._unsafeUnwrapErr()).toBe(
        "invalid-characters",
      );
    });

    it("rejects case-insensitive duplicates and preset label duplicates", () => {
      expect(addEquipmentItem(["Smith Machine"], "smith machine")._unsafeUnwrapErr()).toBe(
        "duplicate",
      );
      expect(addEquipmentItem(["dumbbells"], "Dumbbells")._unsafeUnwrapErr()).toBe("duplicate");
      expect(addEquipmentItem(["dumbbells"], "Kurzhanteln")._unsafeUnwrapErr()).toBe("duplicate");
    });

    it("resolves German preset labels to canonical preset IDs", () => {
      expect(addEquipmentItem(undefined, "Kurzhanteln")._unsafeUnwrap()).toEqual(["dumbbells"]);
      expect(addEquipmentItem(["dumbbells"], "Hantelbank")._unsafeUnwrap()).toEqual([
        "dumbbells",
        "bench",
      ]);
    });

    it("rejects additions once MAX_EQUIPMENT_ITEMS is reached", () => {
      const fullList = Array.from({ length: MAX_EQUIPMENT_ITEMS }, (_, i) => `Machine ${i + 1}`);
      expect(addEquipmentItem(fullList, "New Machine")._unsafeUnwrapErr()).toBe("max-reached");
    });

    it("normalizes unnormalized current items before checking capacity and returning", () => {
      const unnormalizedCurrent = [
        "  Dumbbells  ",
        "dumbbells",
        "a",
        "",
        ...Array.from({ length: 28 }, (_, i) => `Machine ${i + 1}`),
      ];
      const result = addEquipmentItem(unnormalizedCurrent, "Leg Press");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(30);
        expect(result.value[0]).toBe("dumbbells");
        expect(result.value.at(-1)).toBe("Leg Press");
      }
    });
  });

  describe("removeEquipmentItem", () => {
    it("removes matching entry case-insensitively and preserves remaining items", () => {
      expect(removeEquipmentItem(["dumbbells", "Smith Machine"], "smith machine")).toEqual([
        "dumbbells",
      ]);
    });

    it("returns undefined when removing the last remaining entry or from empty list", () => {
      expect(removeEquipmentItem(["Smith Machine"], "Smith Machine")).toBeUndefined();
      expect(removeEquipmentItem(undefined, "Smith Machine")).toBeUndefined();
    });
  });

  describe("normalizeEquipmentList & EquipmentAccessSchema", () => {
    it("parses mixed preset and custom CSV while deduplicating and filtering invalid items", () => {
      const parsed = EquipmentAccessSchema.safeParse(
        "dumbbells, Smith Machine , a , smith machine , Barbell & rack, Beinpresse (45°)",
      );
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toEqual([
          "dumbbells",
          "Smith Machine",
          "barbell_rack",
          "Beinpresse (45°)",
        ]);
      }
    });

    it("returns undefined for empty string, null, undefined, or array of empty entries", () => {
      expect(normalizeEquipmentList("")).toBeUndefined();
      expect(normalizeEquipmentList(null)).toBeUndefined();
      expect(normalizeEquipmentList(undefined)).toBeUndefined();
      expect(normalizeEquipmentList(["", "x"])).toBeUndefined();
      expect(EquipmentAccessSchema.parse("")).toBeUndefined();
    });

    it("strips control chars, clamps overlong names, and caps to MAX_EQUIPMENT_ITEMS", () => {
      const dirty = [
        "Hack\nSquat",
        "y".repeat(MAX_EQUIPMENT_NAME_LENGTH + 15),
        ...Array.from({ length: 35 }, (_, i) => `Item ${i + 1}`),
      ];
      const normalized = normalizeEquipmentList(dirty);
      expect(normalized).toHaveLength(MAX_EQUIPMENT_ITEMS);
      expect(normalized?.[0]).toBe("HackSquat");
      expect(normalized?.[1]).toHaveLength(MAX_EQUIPMENT_NAME_LENGTH);
    });
  });

  describe("preset/custom partitioning & mergePresetAndCustomEquipment", () => {
    it("separates presets and custom equipment accurately", () => {
      const mixed = ["dumbbells", "Smith Machine", "bench", "Leg Press"];
      expect(getSelectedPresetEquipment(mixed)).toEqual(["dumbbells", "bench"]);
      expect(getCustomEquipment(mixed)).toEqual(["Smith Machine", "Leg Press"]);
    });

    it("preserves custom items when presets are toggled and returns undefined when both become empty", () => {
      const current = ["dumbbells", "Smith Machine"];
      expect(mergePresetAndCustomEquipment(["barbell_rack"], current)).toEqual([
        "barbell_rack",
        "Smith Machine",
      ]);
      expect(mergePresetAndCustomEquipment([], current)).toEqual(["Smith Machine"]);
      expect(mergePresetAndCustomEquipment([], ["dumbbells"])).toBeUndefined();
    });

    it("does not truncate custom items or existing presets when adding a preset at MAX_EQUIPMENT_ITEMS", () => {
      const existingPresets = ["bodyweight", "dumbbells", "kettlebells", "bench", "pull_up_bar"];
      const customItems = Array.from({ length: 25 }, (_, i) => `Custom ${i + 1}`);
      const current = [...existingPresets, ...customItems];

      // Attempting to add "cable_machine" while at 30 items must drop the new preset, not Custom 25
      const afterAttemptedAdd = mergePresetAndCustomEquipment(
        [...existingPresets, "cable_machine"],
        current,
      );
      expect(afterAttemptedAdd).toHaveLength(MAX_EQUIPMENT_ITEMS);
      expect(afterAttemptedAdd).toContain("Custom 25");
      expect(afterAttemptedAdd).not.toContain("cable_machine");

      // Deselecting an existing preset while at 30 items still works and preserves all custom items
      const afterDeselect = mergePresetAndCustomEquipment(
        existingPresets.filter((id) => id !== "bench"),
        current,
      );
      expect(afterDeselect).toHaveLength(29);
      expect(afterDeselect).not.toContain("bench");
      expect(afterDeselect).toContain("Custom 25");
    });
  });
});
