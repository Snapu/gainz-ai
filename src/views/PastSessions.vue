<script setup lang="ts">
import { History } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  type ExerciseLog,
  groupLogsIntoSessions,
  LogExerciseSheet,
  useExerciseLogsStore,
} from "@/modules/trainingLogs/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import SessionLogGroup from "@/shared/presentation/components/SessionLogGroup.vue";
import { useLogSheet } from "@/shared/presentation/composables/useLogSheet";

interface GroupedSession {
  id: string;
  date: string;
  logs: ExerciseLog[];
  stats: {
    sets: number;
    volume: number;
    durationMinutes: number;
    exerciseCount: number;
  };
}

const router = useRouter();
const logsStore = useExerciseLogsStore();
const { exerciseLogs } = storeToRefs(logsStore);
const logSheet = useLogSheet();

const collapsedSessions = ref<Record<string, boolean>>({});

const groupedLogs = computed(() => {
  const sessions = groupLogsIntoSessions(exerciseLogs.value);
  const sortedSessions = [...sessions].reverse();

  return sortedSessions.map((session): GroupedSession => {
    const logs = [...session.logs].sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());
    const volume = logs.reduce((acc, log) => acc + (log.weight ?? 0) * (log.reps ?? 0), 0);
    const exerciseCount = new Set(logs.map((l) => l.exerciseName)).size;

    const times = logs.map((l) => l.loggedAt.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const durationMinutes = Math.round((maxTime - minTime) / 60000);

    return {
      id: `${session.sessionId}-${session.startTime.getTime()}`,
      date: session.sessionDate,
      logs,
      stats: {
        sets: logs.length,
        volume,
        durationMinutes,
        exerciseCount,
      },
    };
  });
});

watch(
  groupedLogs,
  (newGroups) => {
    for (let i = 1; i < newGroups.length; i++) {
      const session = newGroups[i];
      if (session && collapsedSessions.value[session.id] === undefined) {
        collapsedSessions.value[session.id] = true;
      }
    }
  },
  { immediate: true },
);

function toggleSession(id: string) {
  collapsedSessions.value[id] = !collapsedSessions.value[id];
}

function editLog(log: ExerciseLog) {
  logSheet.openEditLog(log);
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe">
    <AppHeader show-back title="Past Sessions" @back="router.back()" />

    <main
      class="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-28 overflow-y-auto no-scrollbar flex flex-col gap-4"
    >
      <SessionLogGroup
        v-for="session in groupedLogs"
        :key="session.id"
        :date="session.date"
        :logs="session.logs"
        :stats="session.stats"
        :is-collapsed="!!collapsedSessions[session.id]"
        @toggle="toggleSession(session.id)"
        @delete-log="logsStore.removeExerciseLog"
        @edit-log="editLog"
      />

      <EmptyState
        v-if="groupedLogs.length === 0"
        :icon="History"
        title="No exercises yet."
        description="Log your first set in the Train tab to see your session history here."
      />
    </main>

    <!-- Reusable Bottom Sheet Form for editing past logs -->
    <LogExerciseSheet
      v-model:open="logSheet.isOpen.value"
      :log-to-edit="logSheet.logToEdit.value"
      :prefill-data="logSheet.prefillData.value"
      :rest-seconds="logSheet.restSeconds.value"
    />
  </div>
</template>
