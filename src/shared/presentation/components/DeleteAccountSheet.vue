<script setup lang="ts">
import { AlertTriangle } from "@lucide/vue";
import { ref, watch } from "vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import { useAccountActions } from "@/shared/presentation/composables/useAccountActions";
import { t } from "@/shared/presentation/i18n";

const open = defineModel<boolean>("open", { required: true });

const { isDeleting, hasActiveSpreadsheet, deleteAccount } = useAccountActions();
const trashSpreadsheet = ref(false);
const canTrashSpreadsheet = ref(false);

watch(
  open,
  (isOpen) => {
    if (isOpen) {
      trashSpreadsheet.value = false;
      canTrashSpreadsheet.value = hasActiveSpreadsheet();
    }
  },
  { immediate: true, flush: "sync" },
);

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen && isDeleting.value) return;
  open.value = nextOpen;
}

async function handleConfirmDelete(): Promise<void> {
  const ok = await deleteAccount({ trashSpreadsheet: trashSpreadsheet.value });
  if (ok) {
    open.value = false;
  }
}
</script>

<template>
  <UiBottomSheet
    :open="open"
    :title="t('account.deleteTitle')"
    :subtitle="t('account.deleteSubtitle')"
    @update:open="handleOpenChange"
  >
    <div class="px-6 py-4 space-y-4">
      <div class="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex items-start gap-3">
        <AlertTriangle class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <p class="text-xs font-medium text-red-400 leading-relaxed">
          {{ t("account.deleteWarning") }}
        </p>
      </div>

      <div class="rounded-xl bg-white/5 border border-white/5 p-4 space-y-2">
        <p class="text-micro font-bold uppercase tracking-wider text-muted-foreground">
          {{ t("account.deleteItemsTitle") }}
        </p>
        <ul class="list-disc pl-4 space-y-2 text-xs font-medium text-foreground/85 leading-relaxed">
          <li>{{ t("account.deleteItemServer") }}</li>
          <li>{{ t("account.deleteItemGoogle") }}</li>
          <li>{{ t("account.deleteItemLocal") }}</li>
        </ul>
      </div>

      <div
        v-if="canTrashSpreadsheet"
        class="rounded-xl bg-white/5 border border-white/5 p-4 flex items-start gap-3"
      >
        <input
          id="trash-linked-spreadsheet"
          v-model="trashSpreadsheet"
          type="checkbox"
          :disabled="isDeleting"
          aria-describedby="trash-linked-spreadsheet-hint"
          class="mt-0.5 h-5 w-5 shrink-0 accent-primary cursor-pointer disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <div class="space-y-1 text-xs font-medium leading-relaxed">
          <label
            for="trash-linked-spreadsheet"
            class="block text-foreground cursor-pointer font-semibold"
          >
            {{ t("account.deleteDriveCheckboxLabel") }}
          </label>
          <p id="trash-linked-spreadsheet-hint" class="text-muted-foreground leading-relaxed">
            {{ t("account.deleteDriveCheckboxHint") }}
          </p>
        </div>
      </div>

      <div v-else class="rounded-xl bg-white/5 border border-white/5 p-4">
        <p class="text-xs font-medium text-muted-foreground leading-relaxed">
          {{ t("account.deleteDriveNoteKeep") }}
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-col gap-3">
        <UiButton
          variant="destructive"
          class="w-full"
          :disabled="isDeleting"
          @click="handleConfirmDelete"
        >
          {{ isDeleting ? t("account.deletingButton") : t("account.deleteConfirmButton") }}
        </UiButton>
        <UiButton
          variant="outline"
          class="w-full"
          :disabled="isDeleting"
          @click="handleOpenChange(false)"
        >
          {{ t("common.cancel") }}
        </UiButton>
      </div>
    </template>
  </UiBottomSheet>
</template>
