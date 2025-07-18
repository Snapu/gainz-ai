import { z } from 'zod'
import { type Result, err, ok } from 'neverthrow'

import { supabase } from '@/supabase'

import { parseData } from './utils/parseData'

export const ExerciseLogSchema = z.object({
  id: z.string(),
  exercise_name: z.string(),
  reps: z.number().nullable(),
  weight: z.number().nullable(),
  distance: z.number().nullable(),
  duration: z.number().nullable(),
  logged_at: z.coerce.date(),
})

export type ExerciseLog = z.infer<typeof ExerciseLogSchema>

export type CreateExerciseLogInput = {
  exercise_name: string
  reps?: number
  weight?: number
  distance?: number
  duration?: number
  logged_at?: Date
}

export async function getExerciseLogs(): Promise<
  Result<ExerciseLog[], 'select-failed' | 'parse-data-failed'>
> {
  const { data, error } = await supabase
    .from('exercise_logs')
    .select('id, exercise_name, reps, weight, distance, duration, logged_at')
    .order('logged_at', { ascending: true })

  if (error) {
    console.error(error)
    return err('select-failed')
  }

  return parseData(ExerciseLogSchema.array(), data)
}

export async function createExerciseLog(
  log: CreateExerciseLogInput,
): Promise<Result<void, 'insert-failed'>> {
  const { error } = await supabase.from('exercise_logs').insert([log])

  if (error) {
    console.error(error)
    return err('insert-failed')
  }

  return ok()
}

export async function deleteExerciseLog(id: string): Promise<Result<void, 'delete-failed'>> {
  const { error } = await supabase.from('exercise_logs').delete().eq('id', id)

  if (error) {
    console.error(error)
    return err('delete-failed')
  }

  return ok()
}
