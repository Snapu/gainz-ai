<script setup lang="ts">
import { FileSpreadsheet, FolderOpen, Plus } from "@lucide/vue";
import { useOnline } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import { type SpreadsheetChoiceError, useSpreadsheetStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { resolveRouteTarget } from "@/router/routePolicy";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiTelemetryLoader from "@/shared/presentation/components/ui/UiTelemetryLoader.vue";
import { useLegalConsent } from "@/shared/presentation/composables/useLegalConsent";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";

function resolveChoiceErrorToast(
  error: Exclude<SpreadsheetChoiceError, "picker-cancelled">,
  isOnlineNow: boolean,
): { title: string; description: string } {
  if (error === "auth-failed" && !isOnlineNow) {
    return {
      title: t("loading.errors.connectionUnavailableTitle"),
      description: t("loading.errors.connectionUnavailableDesc"),
    };
  }

  switch (error) {
    case "auth-failed":
      return {
        title: t("loading.errors.permissionExpiredTitle"),
        description: t("loading.errors.permissionExpiredDesc"),
      };
    case "forbidden":
      return {
        title: t("loading.errors.permissionDeniedTitle"),
        description: t("loading.errors.permissionDeniedDesc"),
      };
    case "picker-unavailable":
      return {
        title: t("loading.errors.pickerUnavailableTitle"),
        description: t("loading.errors.pickerUnavailableDesc"),
      };
    case "not-found":
      return {
        title: t("loading.errors.sheetNotFoundTitle"),
        description: t("loading.errors.sheetNotFoundDesc"),
      };
    default:
      return {
        title: t("loading.errors.connectFailedTitle"),
        description: t("loading.errors.connectFailedDesc"),
      };
  }
}

const router = useRouter();
const authStore = useAuthStore();
const { hasLegalConsent } = useLegalConsent();
const profileStore = useUserProfileStore();
const spreadsheetStore = useSpreadsheetStore();
const isOnline = useOnline();
const { toast } = useToast();
const confirmingCreate = ref(false);

const showChoiceScreen = computed(
  () =>
    spreadsheetStore.needsSpreadsheetChoice && !spreadsheetStore.isLoading && !spreadsheetStore.doc,
);

const loadingMessage = computed(() => {
  if (!isOnline.value && !spreadsheetStore.doc) {
    return t("loading.waitingNetwork");
  }
  return profileStore.isLoading ? t("loading.loadingProfile") : t("loading.loadingSpreadsheet");
});

function notifyChoiceError(error: SpreadsheetChoiceError): void {
  if (error === "picker-cancelled") return;
  if (error === "auth-failed" && !authStore.isLoggedIn) return;

  const message = resolveChoiceErrorToast(error, isOnline.value);

  toast({
    variant: "destructive",
    title: message.title,
    description: message.description,
  });
}

function handleLinkExisting(): void {
  confirmingCreate.value = false;
  void spreadsheetStore.linkExistingSpreadsheet().orTee(notifyChoiceError);
}

function handleCreateNew(): void {
  if (!confirmingCreate.value) {
    confirmingCreate.value = true;
    return;
  }
  confirmingCreate.value = false;
  void spreadsheetStore.createNewSpreadsheet().orTee(notifyChoiceError);
}

async function handleSwitchAccount(): Promise<void> {
  await authStore.logout();
  await router.push("/");
}

// Re-evaluate routing when the loading-relevant state changes.
// The beforeEach guard only fires on route transitions, so we need
// an explicit watcher to push the user forward once loading finishes.
watch(
  () => ({
    isLoggedIn: authStore.isLoggedIn,
    hasConsent: hasLegalConsent.value,
    hasDoc: !!spreadsheetStore.doc,
    isLoading: profileStore.isLoading,
    setupCompleted: profileStore.setupCompleted,
  }),
  (state) => {
    const target = resolveRouteTarget("/loading", undefined, state);
    if (target !== true) {
      router.push(target);
    }
  },
  { immediate: true },
);
</script>

<template>
  <main
    v-if="showChoiceScreen"
    class="h-full w-full overflow-y-auto overscroll-y-contain pt-safe pb-safe px-4 flex"
  >
    <div class="w-full max-w-md m-auto py-4">
      <UiCard class="w-full p-5 flex flex-col gap-5">
        <div class="flex flex-col gap-2 text-center">
          <div
            class="mx-auto w-12 h-12 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center"
          >
            <FileSpreadsheet class="w-5 h-5" />
          </div>
          <h1 class="text-xl font-black tracking-tight text-foreground">
            {{ t("loading.connectTitle") }}
          </h1>
          <p class="text-sm font-medium text-muted-foreground">
            {{ t("loading.connectDescription") }}
          </p>
        </div>

        <div class="flex flex-col gap-3">
          <UiButton
            variant="default"
            class="gap-2"
            :disabled="spreadsheetStore.isPickerOpen"
            :aria-busy="spreadsheetStore.isPickerOpen ? 'true' : undefined"
            @click="handleLinkExisting"
          >
            <FolderOpen class="w-4 h-4 shrink-0" />
            {{
              spreadsheetStore.isPickerOpen ? t("loading.openingDrive") : t("loading.linkExisting")
            }}
          </UiButton>

          <UiButton
            variant="secondary"
            class="gap-2"
            :disabled="spreadsheetStore.isPickerOpen"
            @click="handleCreateNew"
          >
            <Plus class="w-4 h-4 shrink-0" />
            {{ confirmingCreate ? t("loading.confirmCreateNew") : t("loading.createNew") }}
          </UiButton>
        </div>

        <div class="bg-white/5 border border-white/5 rounded-xl p-4">
          <p class="text-xs font-medium text-muted-foreground text-center">
            {{ t("loading.privacyNote") }}
          </p>
        </div>

        <UiButton
          variant="ghost"
          size="sm"
          class="self-center text-muted-foreground"
          @click="void handleSwitchAccount()"
        >
          {{ t("loading.switchAccount") }}
        </UiButton>
      </UiCard>
    </div>
  </main>

  <UiTelemetryLoader
    v-else
    fullscreen
    :text="loadingMessage"
    :subtitle="t('loading.subtitle')"
  />
</template>
