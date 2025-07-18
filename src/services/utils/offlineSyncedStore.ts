import { type Ref, computed, ref } from 'vue'

import { Result } from 'neverthrow'
import { useAsyncState, useLocalStorage } from '@vueuse/core'

type OperationType = 'add' | 'update' | 'remove'

type PendingOperation<T> = {
  type: OperationType
  item: T
}

type UseOfflineSyncedStoreParams<T extends { id?: string }> = {
  key: string
  fetchRemote: () => Promise<Result<T[], unknown>>
  addRemote: (item: T) => Promise<Result<void, unknown>>
  removeRemote: (item: T) => Promise<Result<void, unknown>>
  updateRemote?: (item: T) => Promise<Result<void, unknown>>
}

export function useOfflineSyncedStore<T extends { id?: string }>({
  key,
  fetchRemote,
  addRemote,
  removeRemote,
  updateRemote,
}: UseOfflineSyncedStoreParams<T>) {
  const localCache = ref<T[]>([]) as Ref<T[]>
  const pending = useLocalStorage<PendingOperation<T>[]>(`pending:${key}`, [])

  const remoteHandlers = {
    add: addRemote,
    update: updateRemote,
    remove: removeRemote,
  }

  function squashPendingOperation(op: PendingOperation<T>) {
    const { type, item } = op

    // Adds can't be squashed, just append
    if (type === 'add') {
      pending.value.push(op)
      return
    }

    const id = item.id
    if (!id) return

    const index = pending.value.findIndex((p) => p.item.id === id)
    if (index === -1) {
      pending.value.push(op)
      return
    }

    const existing = pending.value[index]
    if (existing.type === 'update') {
      pending.value[index] = op
    }
  }

  async function syncPending() {
    const queue = [...pending.value]
    const leftovers: typeof queue = []

    for (const op of queue) {
      const result = await remoteHandlers[op.type]?.(op.item)
      // Keep failed operation in queue
      if (result?.isErr()) leftovers.push(op)
    }

    pending.value = leftovers
  }

  const { state: remoteItems, isLoading } = useAsyncState(async () => {
    await syncPending()
    const result = await fetchRemote()
    if (result.isErr()) return []
    return result.value
  }, [])

  const items = computed(() => [...remoteItems.value, ...localCache.value])

  async function add(item: T) {
    localCache.value.push(item)
    const result = await addRemote(item)
    if (result.isErr()) squashPendingOperation({ type: 'add', item })
  }

  async function remove(item: T) {
    if (!item.id) return

    remoteItems.value = remoteItems.value.filter((i) => i.id !== item.id)
    localCache.value = localCache.value.filter((i) => i.id !== item.id)

    const result = await removeRemote(item)
    if (result.isErr()) squashPendingOperation({ type: 'remove', item })
  }

  async function update(item: T) {
    if (!item.id) return

    remoteItems.value = remoteItems.value.filter((i) => i.id !== item.id)
    const index = localCache.value.findIndex((i) => i.id === item.id)
    if (index === -1) {
      localCache.value.push(item)
    } else {
      localCache.value[index] = item
    }

    const result = await updateRemote?.(item)
    if (result?.isErr()) squashPendingOperation({ type: 'update', item })
  }

  return { items, isLoading, add, remove, update }
}
