import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

import { useOfflineSyncedStore } from '@/services/utils/offlineSyncedStore'
import { type Exercise, createExercise, deleteExercise, getExercises } from '@/services/exercises'

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

export type ExerciseState = Omit<Exercise, 'id'> & { id?: string }

export const useExercisesStore = defineStore('exercises', () => {
  const {
    items: exercises,
    add,
    remove,
  } = useOfflineSyncedStore<ExerciseState>({
    key: 'exercise',
    fetchRemote: () => getExercises(),
    addRemote: (item) => createExercise(item),
    removeRemote: (item) => deleteExercise(item.id!),
  })

  const exercisesMigration = useLocalStorage('exercises', [] as Exercise[])

  async function migrate() {
    const failed: typeof exercisesMigration.value = []
    for (const exercise of exercisesMigration.value) {
      const result = await createExercise({ ...exercise, name: clean(exercise.name) })
      if (result.isErr()) failed.push(exercise)
    }
    exercisesMigration.value = failed
  }

  void migrate()

  const addExercise: typeof add = async (exercise) => {
    console.log('Adding exercise', exercise)
    if (exercises.value.some(({ name }) => name === exercise.name)) return
    return add(exercise)
  }

  const removeExerciseByName = async (exerciseName: string) => {
    console.log('Removing exercise', exerciseName)
    await Promise.all(exercises.value.filter(({ name }) => name === exerciseName).map(remove))
  }

  return { exercises, addExercise, removeExerciseByName }
})
