import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { defineStore } from "pinia";
import { computed, type Ref, ref, shallowRef, watchEffect } from "vue";
import {
  createSpreadsheet,
  getSpreadsheetId,
  loadSpreadsheet,
  SPREADSHEET_NAME,
} from "@/services/spreadsheets";
import { useAuthStore } from "./auth";

export const useSpreadsheetStore = defineStore("spreadsheet", () => {
  const doc = shallowRef<GoogleSpreadsheet | null>(null) as Ref<GoogleSpreadsheet | null>;
  const isLoading = ref(false);

  const authStore = useAuthStore();

  async function init(accessToken: string) {
    isLoading.value = true;
    try {
      const idResult = await getSpreadsheetId(SPREADSHEET_NAME, accessToken);
      if (idResult.isErr()) {
        console.error("Error getting spreadsheet ID:", idResult.error);
        Sentry.captureException(idResult.error);
      }
      if (idResult.isOk() && idResult.value !== null) {
        const loadResult = await loadSpreadsheet(idResult.value, accessToken);
        if (loadResult.isOk()) doc.value = loadResult.value as GoogleSpreadsheet;
      } else {
        const createResult = await createSpreadsheet(SPREADSHEET_NAME, accessToken);
        if (createResult.isOk()) doc.value = createResult.value as GoogleSpreadsheet;
      }
    } catch (error) {
      console.error("Failed to init spreadsheet", error);
    } finally {
      isLoading.value = false;
    }
  }

  watchEffect(() => {
    const { accessToken, isLoggedIn } = authStore;
    if (!accessToken || !isLoggedIn) return;
    console.debug("User has logged in - initializing spreadsheet");
    void init(accessToken);
  });

  const spreadsheetUrl = computed(() => {
    if (!doc.value?.spreadsheetId) return null;
    return `https://docs.google.com/spreadsheets/d/${doc.value.spreadsheetId}/edit`;
  });

  return { isLoading, doc, spreadsheetUrl };
});
