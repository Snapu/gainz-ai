import { err, ok, type Result } from "neverthrow";
import { z } from "zod";

export const MIN_EQUIPMENT_NAME_LENGTH = 2;
export const MAX_EQUIPMENT_NAME_LENGTH = 50;
export const MAX_EQUIPMENT_ITEMS = 30;

export const EQUIPMENT_PRESETS = [
  { id: "bodyweight", label: "Bodyweight only" },
  { id: "resistance_bands", label: "Resistance bands" },
  { id: "suspension_trainer", label: "Suspension trainer (e.g. TRX)" },
  { id: "gymnastic_rings", label: "Gymnastic rings" },
  { id: "pull_up_bar", label: "Pull-up bar" },
  { id: "dip_bar", label: "Dip bar" },
  { id: "dumbbells", label: "Dumbbells" },
  { id: "kettlebells", label: "Kettlebells" },
  { id: "barbell_rack", label: "Barbell & rack" },
  { id: "bench", label: "Bench" },
  { id: "cable_machine", label: "Cable machine" },
  { id: "cardio_machine", label: "Cardio machines" },
  { id: "medicine_ball", label: "Medicine ball" },
] as const;

export type EquipmentOption = string;

export type AddEquipmentError =
  | "empty"
  | "too-short"
  | "too-long"
  | "invalid-characters"
  | "duplicate"
  | "max-reached";

const EQUIPMENT_DE_ALIASES: Record<(typeof EQUIPMENT_PRESETS)[number]["id"], readonly string[]> = {
  bodyweight: ["nur körpergewicht", "körpergewicht"],
  resistance_bands: ["widerstandsbänder"],
  suspension_trainer: [
    "schlingentrainer (z. b. trx)",
    "schlingentrainer (z.b. trx)",
    "schlingentrainer",
  ],
  gymnastic_rings: ["turnringe"],
  pull_up_bar: ["klimmzugstange"],
  dip_bar: ["dip-barren"],
  dumbbells: ["kurzhanteln"],
  kettlebells: ["kettlebells"],
  barbell_rack: ["langhantel & rack"],
  bench: ["hantelbank"],
  cable_machine: ["kabelzug"],
  cardio_machine: ["cardiogeräte"],
  medicine_ball: ["medizinball"],
};

const PRESET_ID_SET = new Set<string>(EQUIPMENT_PRESETS.map((preset) => preset.id));
const PRESET_ALIAS_TO_ID = new Map<string, string>(
  EQUIPMENT_PRESETS.flatMap((preset) => [
    [preset.id.toLowerCase(), preset.id],
    [preset.label.toLowerCase(), preset.id],
    ...EQUIPMENT_DE_ALIASES[preset.id].map((alias) => [alias.toLowerCase(), preset.id] as const),
  ]),
);

function hasForbiddenEquipmentChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (value[i] === "," || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function stripControlChars(value: string): string {
  let clean = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) {
      clean += value[i];
    }
  }
  return clean;
}

function resolveCanonicalEquipment(value: string): string {
  return PRESET_ALIAS_TO_ID.get(value.toLowerCase()) ?? value;
}

function isPresetEquipment(value: string): boolean {
  return PRESET_ID_SET.has(value);
}

export function getSelectedPresetEquipment(
  equipment: readonly string[] | undefined,
): EquipmentOption[] {
  return (normalizeEquipmentList(equipment) ?? []).filter(isPresetEquipment);
}

export function getCustomEquipment(equipment: readonly string[] | undefined): EquipmentOption[] {
  return (normalizeEquipmentList(equipment) ?? []).filter((item) => !isPresetEquipment(item));
}

export function normalizeEquipmentList(raw: unknown): EquipmentOption[] | undefined {
  let rawEntries: string[];
  if (typeof raw === "string") {
    rawEntries = raw.split(",");
  } else if (Array.isArray(raw)) {
    rawEntries = raw
      .filter((item): item is string => typeof item === "string")
      .flatMap((item) => item.split(","));
  } else {
    return undefined;
  }

  const seen = new Set<string>();
  const result: EquipmentOption[] = [];

  for (const entry of rawEntries) {
    const collapsed = stripControlChars(entry).replace(/\s+/g, " ").trim();
    if (collapsed.length < MIN_EQUIPMENT_NAME_LENGTH) continue;

    const clamped = collapsed.slice(0, MAX_EQUIPMENT_NAME_LENGTH).trim();
    if (clamped.length < MIN_EQUIPMENT_NAME_LENGTH) continue;

    const canonical = resolveCanonicalEquipment(clamped);
    const dedupKey = canonical.toLowerCase();
    if (seen.has(dedupKey)) continue;

    seen.add(dedupKey);
    result.push(canonical);
    if (result.length >= MAX_EQUIPMENT_ITEMS) break;
  }

  return result.length > 0 ? result : undefined;
}

export function addEquipmentItem(
  current: readonly string[] | undefined,
  rawInput: string,
): Result<EquipmentOption[], AddEquipmentError> {
  if (hasForbiddenEquipmentChars(rawInput)) {
    return err("invalid-characters");
  }

  const normalized = rawInput.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return err("empty");
  if (normalized.length < MIN_EQUIPMENT_NAME_LENGTH) return err("too-short");
  if (normalized.length > MAX_EQUIPMENT_NAME_LENGTH) return err("too-long");

  const canonical = resolveCanonicalEquipment(normalized);
  const existing = normalizeEquipmentList(current) ?? [];
  const isDuplicate = existing.some(
    (item) => resolveCanonicalEquipment(item).toLowerCase() === canonical.toLowerCase(),
  );
  if (isDuplicate) return err("duplicate");
  if (existing.length >= MAX_EQUIPMENT_ITEMS) return err("max-reached");

  return ok([...existing, canonical]);
}

export function removeEquipmentItem(
  current: readonly string[] | undefined,
  target: string,
): EquipmentOption[] | undefined {
  if (!current || current.length === 0) return undefined;
  const targetLower = target.toLowerCase();
  const next = current.filter((item) => item.toLowerCase() !== targetLower);
  return next.length > 0 ? next : undefined;
}

export function mergePresetAndCustomEquipment(
  nextPresets: readonly string[],
  current: readonly string[] | undefined,
): EquipmentOption[] | undefined {
  const existingPresetSet = new Set(getSelectedPresetEquipment(current));
  const custom = getCustomEquipment(current);
  const nextValidPresets = normalizeEquipmentList(nextPresets.filter(isPresetEquipment)) ?? [];
  const retained = nextValidPresets.filter((id) => existingPresetSet.has(id));
  const added = nextValidPresets.filter((id) => !existingPresetSet.has(id));
  const availablePresetSlots = Math.max(0, MAX_EQUIPMENT_ITEMS - custom.length);
  const cappedPresets = [...retained, ...added].slice(0, availablePresetSlots);
  return normalizeEquipmentList([...cappedPresets, ...custom]);
}

export const EquipmentAccessSchema = z.preprocess(
  (val) => normalizeEquipmentList(val),
  z
    .array(z.string().min(MIN_EQUIPMENT_NAME_LENGTH).max(MAX_EQUIPMENT_NAME_LENGTH))
    .max(MAX_EQUIPMENT_ITEMS)
    .optional(),
);
