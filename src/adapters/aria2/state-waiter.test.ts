import { describe, expect, it, vi } from 'vitest'

import type { DownloadTaskSnapshot } from '../download'
import { Aria2StateWaiter } from './state-waiter'

function createSnapshot(
  patch: Partial<DownloadTaskSnapshot> = {}
): DownloadTaskSnapshot {
  return {
    taskId: 'task-1',
    remoteId: 'gid-1',
    status: 'pending',
    totalBytes: 0,
    downloadedBytes: 0,
    speedBytes: 0,
    progress: 0,
    updatedAt: '2026-03-21T12:00:00.000Z',
    ...patch
  }
}

describe('Aria2StateWaiter', () => {
  it('keeps polling until the predicate is satisfied', async () => {
    const snapshots = [
      createSnapshot({ status: 'pending' }),
      createSnapshot({ status: 'metadata' })
    ]
    const readSnapshot = vi.fn(async () => snapshots.shift() ?? createSnapshot({ status: 'metadata' }))
    const sleep = vi.fn(async () => {})
    let now = 0
    const waiter = new Aria2StateWaiter(readSnapshot, undefined, {
      timeoutMs: 100,
      intervalMs: 10,
      getNow: () => now,
      sleep: async (ms) => {
        now += ms
        await sleep(ms)
      }
    })

    const snapshot = await waiter.waitForSnapshot(
      { taskId: 'task-1' },
      (item) => item.status === 'metadata'
    )

    expect(snapshot.status).toBe('metadata')
    expect(readSnapshot).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('logs a warning and returns the latest snapshot on timeout', async () => {
    const warning = vi.fn()
    const readSnapshot = vi.fn(async () => createSnapshot({ status: 'pending' }))
    let now = 0
    const waiter = new Aria2StateWaiter(readSnapshot, { warning }, {
      timeoutMs: 20,
      intervalMs: 10,
      getNow: () => now,
      sleep: async (ms) => {
        now += ms
      }
    })

    const snapshot = await waiter.waitForSnapshot(
      { taskId: 'task-1' },
      (item) => item.status === 'completed'
    )

    expect(snapshot.status).toBe('pending')
    expect(readSnapshot).toHaveBeenCalledTimes(3)
    expect(warning).toHaveBeenCalledOnce()
  })
})
