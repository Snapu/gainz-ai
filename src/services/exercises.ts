import { z } from 'zod'
import { type Result, err, ok } from 'neverthrow'

import { supabase } from '@/supabase'

import { parseData } from './utils/parseData'

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

export const ExerciseSchema = z.object({
  id: z.string(),
  name: z.string().overwrite(clean),
})

export type Exercise = z.infer<typeof ExerciseSchema>

export async function getExercises(): Promise<
  Result<Exercise[], 'select-failed' | 'parse-data-failed'>
> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name')
    .eq('archived', false)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error(error)
    return err('select-failed')
  }

  return parseData(ExerciseSchema.array(), data)
}

export async function createExercise(exercise: {
  name: string
}): Promise<Result<void, 'insert-failed' | 'duplicate-name'>> {
  const { error } = await supabase.from('exercises').insert([exercise])

  if (error) {
    console.error(error)
    if (error.code === '23505') return err('duplicate-name')
    return err('insert-failed')
  }

  return ok()
}

export async function deleteExercise(id: string): Promise<Result<void, 'delete-failed'>> {
  const { error } = await supabase.from('exercises').delete().eq('id', id)

  if (error?.message.includes('Consider archiving')) {
    const { error: archiveError } = await supabase
      .from('exercises')
      .update({ archived: true })
      .eq('id', id)

    if (archiveError) {
      console.error(archiveError)
      return err('delete-failed')
    }

    return ok()
  }

  if (error) {
    console.error(error)
    return err('delete-failed')
  }

  return ok()
}
