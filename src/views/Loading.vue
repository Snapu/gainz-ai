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
import { useToast } from "@/shared/presentation/composables/useToast";

const DEFAULT_CHOICE_ERROR_TOAST = {
  title: "Could Not Connect Sheet",
  description: "Something went wrong connecting your spreadsheet. Please try again.",
};

const CHOICE_ERROR_TOASTS: Partial<
  Record<
    Exclude<SpreadsheetChoiceError, "picker-cancelled">,
    { title: string; description: string }
  >
> = {
  "auth-failed": {
    title: "Permission Expired",
    description: "Google Drive authorization expired. Please sign in again.",
  },
  forbidden: {
    title: "Permission Denied",
    description: "You do not have permission to access the selected spreadsheet.",
  },
  "picker-unavailable": {
    title: "Google Picker Unavailable",
    description: "Could not open Google Picker. Try again or create a new spreadsheet instead.",
  },
  "not-found": {
    title: "Spreadsheet Not Found",
    description: "The selected spreadsheet is no longer available in Google Drive.",
  },
};

const router = useRouter();
const authStore = useAuthStore();
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
    return "Waiting for network connection...";
  }
  return profileStore.isLoading ? "Loading profile..." : "Loading spreadsheet...";
});

function notifyChoiceError(error: SpreadsheetChoiceError): void {
  if (error === "picker-cancelled") return;
  if (error === "auth-failed" && !authStore.isLoggedIn) return;

  const message =
    error === "auth-failed" && !isOnline.value
      ? {
          title: "Connection Unavailable",
          description:
            "Could not reach Google Drive while offline. Check your connection and try again.",
        }
      : (CHOICE_ERROR_TOASTS[error] ?? DEFAULT_CHOICE_ERROR_TOAST);

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

// Re-evaluate routing when the loading-relevant state changes.
// The beforeEach guard only fires on route transitions, so we need
// an explicit watcher to push the user forward once loading finishes.
watch(
  () => ({
    isLoggedIn: authStore.isLoggedIn,
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
            Connect Training Sheet
          </h1>
          <p class="text-sm font-medium text-muted-foreground">
            Select your existing Google Spreadsheet (such as "Gainz AI App Database") to keep your training history, or create a new one.
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
              spreadsheetStore.isPickerOpen ? "Opening Google Drive..." : "Link Existing Spreadsheet"
            }}
          </UiButton>

          <UiButton
            variant="secondary"
            class="gap-2"
            :disabled="spreadsheetStore.isPickerOpen"
            @click="handleCreateNew"
          >
            <Plus class="w-4 h-4 shrink-0" />
            {{ confirmingCreate ? "Tap Again to Confirm New Sheet" : "Create New Spreadsheet" }}
          </UiButton>
        </div>

        <div class="bg-white/5 border border-white/5 rounded-xl p-4">
          <p class="text-xs font-medium text-muted-foreground text-center">
            GainzAI only reads and updates spreadsheets you create here or select via Google Picker.
          </p>
        </div>

        <UiButton
          variant="ghost"
          size="sm"
          class="self-center text-muted-foreground"
          @click="authStore.logout()"
        >
          Switch Google Account
        </UiButton>
      </UiCard>
    </div>
  </main>

  <UiTelemetryLoader
    v-else
    fullscreen
    :text="loadingMessage"
    subtitle="Gainz AI Engine"
  />
</template>
