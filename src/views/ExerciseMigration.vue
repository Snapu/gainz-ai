<script setup lang="ts">
import { ArrowLeft } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useRouter } from "vue-router";
import type {
  ExerciseWeightMigrationCandidate,
  ExerciseWeightMigrationDecision,
} from "@/modules/migration/application";
import { useExerciseWeightMigrationStore } from "@/modules/migration/presentation";
import { localeDateString } from "@/modules/shared/domain";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import { useToast } from "@/shared/presentation/composables/useToast";

const router = useRouter();
const migrationStore = useExerciseWeightMigrationStore();
const { toast } = useToast();
const { pendingExercises, reviewedCount, isLoading, activeExerciseName, lastError } =
  storeToRefs(migrationStore);

const summaryText = computed(
  () => `${reviewedCount.value} reviewed · ${pendingExercises.value.length} pending`,
);

function formatPreviewLog(candidateLog: ExerciseWeightMigrationCandidate["recentLogs"][number]) {
  return `${localeDateString(candidateLog.loggedAt)} · ${candidateLog.weight}kg`;
}

function actionLabel(
  candidate: ExerciseWeightMigrationCandidate,
  decision: ExerciseWeightMigrationDecision,
) {
  if (activeExerciseName.value !== candidate.exerciseName) {
    return decision === "keep_as_is" ? "Already total" : "Convert to total (×2)";
  }
  return decision === "keep_as_is" ? "Saving..." : "Converting...";
}

async function applyDecision(
  candidate: ExerciseWeightMigrationCandidate,
  decision: ExerciseWeightMigrationDecision,
) {
  const result = await migrationStore.applyDecision(candidate.exerciseName, decision);
  if (!result) {
    toast({
      title: "Migration unavailable",
      description: "Spreadsheet is not ready yet.",
      variant: "destructive",
    });
    return;
  }

  if (result.isErr()) {
    toast({
      title: "Migration failed",
      description: migrationStore.lastError ?? result.error,
      variant: "destructive",
    });
    return;
  }

  toast({
    title: "Exercise reviewed",
    description:
      decision === "keep_as_is"
        ? `${candidate.exerciseName} kept as already-total weights.`
        : `${candidate.exerciseName} converted to total weight.`,
  });
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe">
    <AppHeader>
      <UiButton variant="ghost" size="icon" @click="router.back()">
        <ArrowLeft class="w-5 h-5" />
      </UiButton>
      <div class="flex-1 min-w-0 ml-2">
        <h1 class="text-lg font-bold tracking-tight text-foreground">Weight Migration</h1>
        <p class="text-xs text-muted-foreground/70 mt-0.5">{{ summaryText }}</p>
      </div>
      <UiButton variant="ghost" size="sm" @click="migrationStore.refresh()">Refresh</UiButton>
    </AppHeader>

    <main class="flex-1 px-4 pt-4 pb-12 overflow-y-auto no-scrollbar">
      <div v-if="isLoading && pendingExercises.length === 0" class="py-12 text-center text-sm text-muted-foreground/70">
        Loading migration candidates...
      </div>

      <EmptyState
        v-else-if="pendingExercises.length === 0"
        title="Migration complete"
        description="No weighted exercises need review right now."
        class="mt-16"
      />

      <div v-else class="flex flex-col gap-4">
        <UiCard
          v-for="candidate in pendingExercises"
          :key="candidate.exerciseName"
          class="p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-bold tracking-tight text-foreground">
                {{ candidate.exerciseName }}
              </h2>
              <p class="text-xs text-muted-foreground/70 mt-1">
                {{ candidate.affectedLogCount }} weighted logs
                <span v-if="candidate.spansMultipleYears">· spans multiple years</span>
              </p>
            </div>
            <div class="text-right text-xs text-muted-foreground/60">
              <div>Latest</div>
              <div class="font-semibold text-foreground/80 mt-1">{{ candidate.latestWeight }}kg</div>
            </div>
          </div>

          <p class="mt-4 text-sm text-foreground/80">
            Do these historical numbers already represent total weight?
          </p>
          <p class="mt-1 text-xs text-muted-foreground/70">
            Recent weighted entries help you decide whether to keep them as-is or double them.
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="previewLog in candidate.recentLogs"
              :key="`${candidate.exerciseName}-${previewLog.loggedAt.toISOString()}`"
              class="rounded-full border border-white/8 bg-card/60 px-3 py-1 text-sm font-medium text-foreground/80"
            >
              {{ formatPreviewLog(previewLog) }}
            </span>
          </div>

          <div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <UiButton
              variant="ghost"
              :disabled="activeExerciseName === candidate.exerciseName"
              @click="applyDecision(candidate, 'keep_as_is')"
            >
              {{ actionLabel(candidate, 'keep_as_is') }}
            </UiButton>
            <UiButton
              :disabled="activeExerciseName === candidate.exerciseName"
              @click="applyDecision(candidate, 'convert_to_total')"
            >
              {{ actionLabel(candidate, 'convert_to_total') }}
            </UiButton>
          </div>
        </UiCard>
      </div>

      <p v-if="lastError" class="mt-4 text-center text-xs text-red-400/80">
        Last error: {{ lastError }}
      </p>
    </main>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
