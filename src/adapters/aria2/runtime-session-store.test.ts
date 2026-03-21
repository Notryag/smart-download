import { describe, expect, it } from 'vitest'

import type { DownloadTask } from '../../types'
import { Aria2RuntimeSessionStore } from './runtime-session-store'

function createPersistedTask(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: 'task-1',
    type: 'magnet',
    name: 'Ubuntu ISO',
    source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
    savePath: 'D:\\Downloads',
    status: 'paused',
    progress: 0.5,
    downloadedBytes: 50,
    speedBytes: 0,
    createdAt: '2026-03-21T12:00:00.000Z',
    updatedAt: '2026-03-21T12:01:00.000Z',
    ...patch
  }
}

describe('Aria2RuntimeSessionStore', () => {
  it('creates a normalized runtime session', () => {
    const store = new Aria2RuntimeSessionStore()
    const session = store.createSession({
      taskId: 'task-1',
      gid: 'gid-1',
      source: '  magnet:?xt=urn:btih:1234567890123456789012345678901234567890  ',
      savePath: '  D:\\Downloads  ',
      createdAt: '2026-03-21T12:00:00.000Z',
      updatedAt: '2026-03-21T12:00:00.000Z'
    })

    expect(session.source).toBe('magnet:?xt=urn:btih:1234567890123456789012345678901234567890')
    expect(session.savePath).toBe('D:\\Downloads')
    expect(store.getSessionOrThrow('task-1')).toEqual(session)
  })

  it('hydrates a persisted task and keeps the original createdAt', () => {
    const store = new Aria2RuntimeSessionStore()
    const task = createPersistedTask({
      remoteId: 'gid-1',
      source: ' magnet:?xt=urn:btih:1234567890123456789012345678901234567890 '
    })

    const session = store.hydrateTask(task, '2026-03-21T12:02:00.000Z')

    expect(session.gid).toBe('gid-1')
    expect(session.createdAt).toBe(task.createdAt)
    expect(session.updatedAt).toBe('2026-03-21T12:02:00.000Z')
    expect(session.source).toBe('magnet:?xt=urn:btih:1234567890123456789012345678901234567890')
  })

  it('updates and deletes runtime sessions', () => {
    const store = new Aria2RuntimeSessionStore()
    store.createSession({
      taskId: 'task-1',
      gid: 'gid-1',
      source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
      savePath: 'D:\\Downloads',
      createdAt: '2026-03-21T12:00:00.000Z',
      updatedAt: '2026-03-21T12:00:00.000Z'
    })

    const touchedSession = store.touchSession('task-1', '2026-03-21T12:03:00.000Z')
    expect(touchedSession.updatedAt).toBe('2026-03-21T12:03:00.000Z')

    store.deleteSession('task-1')
    expect(() => store.getSessionOrThrow('task-1')).toThrow('Download session not found')
  })
})
