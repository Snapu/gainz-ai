import { computed } from 'vue'

import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

import { useOfflineSyncedStore } from '@/services/utils/offlineSyncedStore'
import {
  type ExerciseLog,
  createExerciseLog,
  deleteExerciseLog,
  getExerciseLogs,
} from '@/services/exerciseLogs'

export type ExerciseLogState = Omit<ExerciseLog, 'id'> & { id?: string }

export const useExerciseLogsStore = defineStore('exerciseLogs', () => {
  const {
    items: exerciseLogs,
    isLoading,
    add,
    remove,
  } = useOfflineSyncedStore<ExerciseLogState>({
    key: 'exerciseLogs',
    fetchRemote: () => getExerciseLogs(),
    addRemote: (item) =>
      createExerciseLog({
        exercise_name: item.exercise_name,
        reps: item.reps ?? undefined,
        weight: item.weight ?? undefined,
        distance: item.distance ?? undefined,
        duration: item.duration ?? undefined,
        logged_at: item.logged_at,
      }),
    removeRemote: (item) => deleteExerciseLog(item.id!),
  })

  const exerciseLogsMigration = useLocalStorage(
    'exerciseLogs',
    [] as {
      exerciseName: string
      reps?: number
      weight?: number
      distance?: number
      duration?: number
      timestamp: number
    }[],
  )

  async function migrate() {
    const failed: typeof exerciseLogsMigration.value = []
    for (const exerciseLog of exerciseLogsMigration.value) {
      const result = await createExerciseLog({
        exercise_name: exerciseLog.exerciseName,
        reps: exerciseLog.reps,
        distance: exerciseLog.distance,
        weight: exerciseLog.weight,
        duration: exerciseLog.duration,
        logged_at: new Date(exerciseLog.timestamp),
      })
      if (result.isErr()) failed.push(exerciseLog)
    }
    exerciseLogsMigration.value = failed
  }

  void migrate()

  const workoutFinished = useLocalStorage('workoutFinished', false)

  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const workoutStarted = computed(() =>
    exerciseLogs.value.find((log) => log.logged_at.getTime() > startOfToday),
  )

  // reset on new day (i.e. workout not started yet)
  if (!workoutStarted.value) {
    workoutFinished.value = false
  }

  const addExerciseLog: typeof add = async (exerciseLog) => {
    console.log('Adding exercise log', exerciseLog)
    return add(exerciseLog)
  }

  const removeExerciseLog: typeof add = async (exerciseLog) => {
    console.log('Removing exercise log', exerciseLog)
    return remove(exerciseLog)
  }

  function lastLogForExercise(exerciseName: string) {
    return exerciseLogs.value
      .filter((log) => exerciseName === log.exercise_name)
      .sort((a, b) => b.logged_at.getTime() - a.logged_at.getTime())?.[0]
  }

  return {
    exerciseLogs,
    workoutFinished,
    workoutStarted,
    isLoading,
    addExerciseLog,
    removeExerciseLog,
    lastLogForExercise,
  }
})
