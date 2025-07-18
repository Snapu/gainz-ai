import { ok } from 'neverthrow'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useOfflineSyncedStore } from './offlineSyncedStore'

describe('useOfflineSyncedStore', () => {
  const key = 'exercises'
  const fetchRemote = vi.fn().mockResolvedValue([
    { id: '1', name: 'Squats' },
    { id: '2', name: 'Dead Lifts' },
  ])
  const addRemote = vi.fn()
  const updateRemote = vi.fn()
  const removeRemote = vi.fn()

  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('on init', () => {
    it('loads remote items', async () => {
      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      expect(addRemote).toHaveBeenCalledTimes(0)
      expect(updateRemote).toHaveBeenCalledTimes(0)
      expect(removeRemote).toHaveBeenCalledTimes(0)
      expect(fetchRemote).toHaveBeenCalledTimes(1)
      expect(store.items.value).toHaveLength(2)
      expect(store.items.value.map((i) => i.id)).toContain('1')
    })

    it('syncs pending operations before loading remote items', async () => {
      localStorage.setItem(
        'pending:exercises',
        JSON.stringify([
          {
            type: 'add',
            item: {
              name: 'Bench Press',
            },
          },
          {
            type: 'update',
            item: {
              id: '1',
              name: 'Renamed',
            },
          },
          {
            type: 'remove',
            item: {
              id: '2',
              name: 'Does not matter',
            },
          },
        ]),
      )
      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      expect(addRemote).toHaveBeenCalledTimes(1)
      expect(updateRemote).toHaveBeenCalledTimes(1)
      expect(removeRemote).toHaveBeenCalledTimes(1)
      expect(fetchRemote).toHaveBeenCalledTimes(1)
      expect(fetchRemote).toHaveBeenCalledAfter(addRemote)
      expect(fetchRemote).toHaveBeenCalledAfter(updateRemote)
      expect(fetchRemote).toHaveBeenCalledAfter(removeRemote)
      expect(store.items.value).toHaveLength(2)
      expect(store.items.value.map((i) => i.id)).toContain('1')
      const pending = JSON.parse(localStorage.getItem('pending:exercises')!)
      expect(pending).toHaveLength(0)
    })

    it('keeps ops failed to sync in queue', async () => {
      localStorage.setItem(
        'pending:exercises',
        JSON.stringify([
          {
            type: 'add',
            item: {
              name: 'Bench Press',
            },
          },
        ]),
      )
      addRemote.mockRejectedValueOnce(new Error('Offline'))

      useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      const pending = JSON.parse(localStorage.getItem('pending:exercises')!)
      expect(pending).toHaveLength(1)
    })

    it('falls back to empty array if fetchRemote fails', async () => {
      const store = useOfflineSyncedStore({
        key,
        fetchRemote: vi.fn().mockRejectedValue(new Error('fail')),
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      expect(store.items.value).toEqual([])
    })
  })

  describe('add', () => {
    it('adds to local cache and tries remote', async () => {
      const item = { id: '3', name: 'Push Ups' }
      addRemote.mockResolvedValue(undefined)

      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      await store.add(item)
      await flushPromises()

      expect(store.items.value).toContainEqual(item)
      expect(addRemote).toHaveBeenCalledWith(item)
      expect(JSON.parse(localStorage.getItem('pending:exercises')!)).toHaveLength(0)
    })

    it('saves as pending if remote fails', async () => {
      const item = { id: '4', name: 'Burpees' }
      addRemote.mockRejectedValue(new Error('Network'))

      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      await store.add(item)
      await flushPromises()

      expect(store.items.value).toContainEqual(item)
      expect(addRemote).toHaveBeenCalledWith(item)
      const pending = JSON.parse(localStorage.getItem('pending:exercises')!)
      expect(pending).toHaveLength(1)
      expect(pending[0].type).toBe('add')
      expect(pending[0].item).toEqual(item)
    })
  })

  describe('update', () => {
    it('updates item in local cache and tries remote', async () => {
      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      const updated = { id: '1', name: 'Lunges' }
      await store.update(updated)
      await flushPromises()

      expect(store.items.value.find((i) => i.id === '1')?.name).toBe('Lunges')
      expect(updateRemote).toHaveBeenCalledWith(updated)
      expect(JSON.parse(localStorage.getItem('pending:exercises')!)).toHaveLength(0)
    })

    it('saves as pending if remote fails', async () => {
      updateRemote.mockRejectedValue(new Error('Failed'))

      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      const updated = { id: '1', name: 'Jumping Jacks' }
      await store.update(updated)
      await flushPromises()

      expect(store.items.value.find((i) => i.id === '1')?.name).toBe('Jumping Jacks')
      const pending = JSON.parse(localStorage.getItem('pending:exercises')!)
      expect(pending).toHaveLength(1)
      expect(pending[0].type).toBe('update')
      expect(pending[0].item).toEqual(updated)
    })

    it('localCache overrides remoteItems for same ID in items', async () => {
      const store = useOfflineSyncedStore({
        key,
        fetchRemote: async () => ok([{ id: '1', name: 'Remote' }]),
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      await store.update({ id: '1', name: 'Local' })
      await flushPromises()

      expect(store.items.value.find((i) => i.id === '1')?.name).toBe('Local')
    })
  })

  describe('remove', () => {
    it('removes from local cache and tries remote', async () => {
      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      await store.remove({ id: '1' })
      await flushPromises()

      expect(store.items.value.find((i) => i.id === '1')).toBeUndefined()
      expect(removeRemote).toHaveBeenCalledWith({ id: '1' })
      expect(JSON.parse(localStorage.getItem('pending:exercises')!)).toHaveLength(0)
    })

    it('saves as pending if remote fails', async () => {
      removeRemote.mockRejectedValue(new Error('Failed'))

      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      await store.remove({ id: '2' })
      await flushPromises()

      expect(store.items.value.find((i) => i.id === '2')).toBeUndefined()
      const pending = JSON.parse(localStorage.getItem('pending:exercises')!)
      expect(pending).toHaveLength(1)
      expect(pending[0].type).toBe('remove')
      expect(pending[0].item.id).toBe('2')
    })
  })

  describe('squashing pending', () => {
    it('replaces previous update with newer one', async () => {
      const first = { id: '1', name: 'Jump' }
      const second = { id: '1', name: 'Jump Higher' }

      updateRemote.mockRejectedValue(new Error('Offline'))

      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      await store.update(first)
      await store.update(second)
      await flushPromises()

      const pending = JSON.parse(localStorage.getItem('pending:exercises')!)
      expect(pending).toHaveLength(1)
      expect(pending[0].item.name).toBe('Jump Higher')
    })

    it('adds update if no existing operation for item', async () => {
      const item = { id: '10', name: 'Plank' }

      updateRemote.mockRejectedValue(new Error('Offline'))

      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      await store.update(item)
      await flushPromises()

      const pending = JSON.parse(localStorage.getItem('pending:exercises')!)
      expect(pending).toHaveLength(1)
      expect(pending[0].type).toBe('update')
      expect(pending[0].item.id).toBe('10')
    })

    it('does not squash add operations', async () => {
      const item = { id: '5', name: 'Wall Sit' }
      addRemote.mockRejectedValue(new Error('Fail'))

      const store = useOfflineSyncedStore({
        key,
        fetchRemote,
        addRemote,
        updateRemote,
        removeRemote,
      })

      await flushPromises()

      await store.add(item)
      await store.add(item)
      await flushPromises()

      const pending = JSON.parse(localStorage.getItem('pending:exercises')!)
      expect(pending.filter((p: { type: string }) => p.type === 'add')).toHaveLength(2)
    })
  })
})
