<script setup lang="ts">
import { Plus, X } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  type AddEquipmentError,
  addEquipmentItem,
  EQUIPMENT_PRESETS,
  type EquipmentOption,
  getCustomEquipment,
  getSelectedPresetEquipment,
  MAX_EQUIPMENT_ITEMS,
  MAX_EQUIPMENT_NAME_LENGTH,
  MIN_EQUIPMENT_NAME_LENGTH,
  mergePresetAndCustomEquipment,
  removeEquipmentItem,
} from "@/modules/profile/domain";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiInput from "@/shared/presentation/components/ui/UiInput.vue";
import UiToggleGroup from "@/shared/presentation/components/ui/UiToggleGroup.vue";
import UiToggleGroupItem from "@/shared/presentation/components/ui/UiToggleGroupItem.vue";
import { t } from "@/shared/presentation/i18n";

function formatAddError(error: Exclude<AddEquipmentError, "empty">): string {
  switch (error) {
    case "too-short":
      return t("equipment.errors.too-short", { min: MIN_EQUIPMENT_NAME_LENGTH });
    case "too-long":
      return t("equipment.errors.too-long", { max: MAX_EQUIPMENT_NAME_LENGTH });
    case "invalid-characters":
      return t("equipment.errors.invalid-characters");
    case "duplicate":
      return t("equipment.errors.duplicate");
    case "max-reached":
      return t("equipment.errors.max-reached", { max: MAX_EQUIPMENT_ITEMS });
  }
}

const equipmentAccess = defineModel<EquipmentOption[] | undefined>();

const customInput = ref("");
const customErrorKey = ref<Exclude<AddEquipmentError, "empty"> | null>(null);
const matchedPresetId = ref<(typeof EQUIPMENT_PRESETS)[number]["id"] | null>(null);

const customError = computed(() =>
  customErrorKey.value ? formatAddError(customErrorKey.value) : "",
);
const presetMatchNotice = computed(() =>
  matchedPresetId.value
    ? t("equipment.presetSelected", { label: t(`equipment.presets.${matchedPresetId.value}`) })
    : "",
);

watch(customInput, (nextVal) => {
  if (customErrorKey.value) customErrorKey.value = null;
  if (nextVal.length > 0 && matchedPresetId.value) matchedPresetId.value = null;
});

const selectedPresets = computed<string[]>({
  get: () => getSelectedPresetEquipment(equipmentAccess.value),
  set: (next) => {
    const nextPresets = Array.isArray(next) ? next : [];
    equipmentAccess.value = mergePresetAndCustomEquipment(nextPresets, equipmentAccess.value);
  },
});

const customItems = computed(() => getCustomEquipment(equipmentAccess.value));
const isAtLimit = computed(
  () => selectedPresets.value.length + customItems.value.length >= MAX_EQUIPMENT_ITEMS,
);
const canSubmit = computed(() => !isAtLimit.value && customInput.value.trim().length > 0);

function handleAddCustom(): void {
  addEquipmentItem(equipmentAccess.value, customInput.value).match(
    (nextEquipment) => {
      const addedItem = nextEquipment.at(-1);
      const matchedPreset = EQUIPMENT_PRESETS.find((preset) => preset.id === addedItem);
      equipmentAccess.value = nextEquipment;
      customInput.value = "";
      customErrorKey.value = null;
      matchedPresetId.value = matchedPreset?.id ?? null;
    },
    (error) => {
      matchedPresetId.value = null;
      customErrorKey.value = error === "empty" ? null : error;
    },
  );
}

function handleRemoveCustom(item: string): void {
  equipmentAccess.value = removeEquipmentItem(equipmentAccess.value, item);
  customErrorKey.value = null;
  matchedPresetId.value = null;
}

onBeforeUnmount(() => {
  if (customInput.value.trim().length === 0) return;
  addEquipmentItem(equipmentAccess.value, customInput.value).andTee((nextEquipment) => {
    equipmentAccess.value = nextEquipment;
  });
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h3 class="text-sm font-bold text-foreground mb-3">{{ t("equipment.customHeading") }}</h3>

      <form class="flex items-start gap-2" @submit.prevent="handleAddCustom">
        <UiInput
          v-model="customInput"
          type="text"
          enterkeyhint="done"
          :maxlength="MAX_EQUIPMENT_NAME_LENGTH"
          :disabled="isAtLimit"
          :error="customError"
          :placeholder="t('equipment.placeholder')"
          :aria-label="t('equipment.customHeading')"
        />
        <UiButton
          type="submit"
          :variant="canSubmit ? 'tonal' : 'secondary'"
          class="h-14 shrink-0 px-4"
          :disabled="!canSubmit"
          :aria-label="t('equipment.addAria')"
        >
          <Plus class="w-5 h-5" />
        </UiButton>
      </form>

      <p
        v-if="presetMatchNotice && !customError"
        role="status"
        class="mt-2 text-xs font-medium text-primary"
      >
        {{ presetMatchNotice }}
      </p>

      <p v-if="isAtLimit && !customError" class="mt-2 text-xs font-medium text-muted-foreground">
        {{ t("equipment.maxSelected", { max: MAX_EQUIPMENT_ITEMS }) }}
      </p>

      <ul v-if="customItems.length > 0" class="flex flex-col gap-2 mt-3">
        <li
          v-for="item in customItems"
          :key="item"
          class="flex items-center justify-between gap-3 rounded-xl border-2 border-primary bg-primary/10 px-5 py-2.5 text-white shadow-sm"
        >
          <span class="text-base font-medium truncate">{{ item }}</span>
          <UiButton
            variant="ghost"
            size="icon"
            class="shrink-0 text-muted-foreground hover:text-foreground"
            :aria-label="t('equipment.removeAria', { item })"
            @click="handleRemoveCustom(item)"
          >
            <X class="w-4 h-4" />
          </UiButton>
        </li>
      </ul>
    </div>

    <div>
      <h3 class="text-sm font-bold text-foreground mb-3">{{ t("equipment.standardHeading") }}</h3>
      <UiToggleGroup type="multiple" v-model="selectedPresets">
        <UiToggleGroupItem
          v-for="preset in EQUIPMENT_PRESETS"
          :key="preset.id"
          :value="preset.id"
          :disabled="isAtLimit && !selectedPresets.includes(preset.id)"
          class="py-3"
        >
          {{ t(`equipment.presets.${preset.id}`) }}
        </UiToggleGroupItem>
      </UiToggleGroup>
    </div>
  </div>
</template>
