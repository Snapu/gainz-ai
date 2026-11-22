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

const ADD_ERROR_MESSAGES: Record<Exclude<AddEquipmentError, "empty">, string> = {
  "too-short": `Enter at least ${MIN_EQUIPMENT_NAME_LENGTH} characters.`,
  "too-long": `Keep equipment names under ${MAX_EQUIPMENT_NAME_LENGTH} characters.`,
  "invalid-characters": "Commas and line breaks are not allowed.",
  duplicate: "This equipment is already added.",
  "max-reached": `You can select up to ${MAX_EQUIPMENT_ITEMS} equipment items.`,
};

const equipmentAccess = defineModel<EquipmentOption[] | undefined>();

const customInput = ref("");
const customError = ref("");
const presetMatchNotice = ref("");

watch(customInput, (nextVal) => {
  if (customError.value) customError.value = "";
  if (nextVal.length > 0 && presetMatchNotice.value) presetMatchNotice.value = "";
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
      customError.value = "";
      presetMatchNotice.value = matchedPreset ? `Selected preset: ${matchedPreset.label}` : "";
    },
    (error) => {
      presetMatchNotice.value = "";
      customError.value = error === "empty" ? "" : ADD_ERROR_MESSAGES[error];
    },
  );
}

function handleRemoveCustom(item: string): void {
  equipmentAccess.value = removeEquipmentItem(equipmentAccess.value, item);
  customError.value = "";
  presetMatchNotice.value = "";
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
      <h3 class="text-sm font-bold text-foreground mb-3">Custom equipment</h3>

      <form class="flex items-start gap-2" @submit.prevent="handleAddCustom">
        <UiInput
          v-model="customInput"
          type="text"
          enterkeyhint="done"
          :maxlength="MAX_EQUIPMENT_NAME_LENGTH"
          :disabled="isAtLimit"
          :error="customError"
          placeholder="e.g. Smith machine"
          aria-label="Custom equipment"
        />
        <UiButton
          type="submit"
          :variant="canSubmit ? 'tonal' : 'secondary'"
          class="h-14 shrink-0 px-4"
          :disabled="!canSubmit"
          aria-label="Add custom equipment"
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
        Maximum of {{ MAX_EQUIPMENT_ITEMS }} equipment items selected.
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
            :aria-label="`Remove ${item}`"
            @click="handleRemoveCustom(item)"
          >
            <X class="w-4 h-4" />
          </UiButton>
        </li>
      </ul>
    </div>

    <div>
      <h3 class="text-sm font-bold text-foreground mb-3">Standard equipment</h3>
      <UiToggleGroup type="multiple" v-model="selectedPresets">
        <UiToggleGroupItem
          v-for="preset in EQUIPMENT_PRESETS"
          :key="preset.id"
          :value="preset.id"
          :disabled="isAtLimit && !selectedPresets.includes(preset.id)"
          class="py-3"
        >
          {{ preset.label }}
        </UiToggleGroupItem>
      </UiToggleGroup>
    </div>
  </div>
</template>
