import { describe, expect, it, vi } from 'vitest'

import type { DownloadAdapter, DownloadTaskSnapshot } from '../../adapters'
import { InMemoryLogger } from '../logger'
import { InMemoryTaskManager } from './index'
import type { DownloadTaskStore } from '../../storage'
import type { DownloadTask } from '../../types'

class MemoryTaskStore implements DownloadTaskStore {
  readonly tasks = new Map<string, DownloadTask>()
  readonly upsertedTaskIds: string[] = []
  readonly deletedTaskIds: string[] = []

  async upsertTask(task: DownloadTask): Promise<void> {
    this.tasks.set(task.id, task)
    this.upsertedTaskIds.push(task.id)
  }

  async listTasks(): Promise<DownloadTask[]> {
    return Array.from(this.tasks.values())
  }

  async deleteTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId)
    this.deletedTaskIds.push(taskId)
  }
}

function createSnapshot(
  taskId: string,
  remoteId: string,
  patch: Partial<DownloadTaskSnapshot> = {}
): DownloadTaskSnapshot {
  return {
    taskId,
    remoteId,
    status: 'downloading',
    totalBytes: 100,
    downloadedBytes: 10,
    speedBytes: 5,
    progress: 0.1,
    updatedAt: new Date().toISOString(),
    ...patch
  }
}

function createAdapterMock(): DownloadAdapter {
  return {
    getRuntimeStatus: vi.fn(async () => ({
      ready: true,
      client: 'aria2',
      message: 'ok'
    })),
    assertReady: vi.fn(async () => {}),
    attachTask: vi.fn(async ({ taskId, source, savePath }) => ({
      id: `session-${taskId}`,
      taskId,
      remoteId: `gid-${taskId}`,
      source,
      savePath,
      status: 'pending',
      totalBytes: 0,
      downloadedBytes: 0,
      speedBytes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })),
    hydrateTask: vi.fn(async (task) => ({
      id: `session-${task.id}`,
      taskId: task.id,
      remoteId: task.remoteId ?? `gid-${task.id}`,
      source: task.source,
      savePath: task.savePath,
      status: task.status,
      totalBytes: task.totalBytes ?? 0,
      downloadedBytes: task.downloadedBytes,
      speedBytes: task.speedBytes,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    })),
    startTask: vi.fn(async ({ taskId }) => createSnapshot(taskId, `gid-${taskId}`)),
    getTaskSnapshot: vi.fn(async ({ taskId }) => createSnapshot(taskId, `gid-${taskId}`)),
    pauseTask: vi.fn(async ({ taskId }) =>
      createSnapshot(taskId, `gid-${taskId}`, {
        status: 'paused',
        speedBytes: 0
      })
    ),
    resumeTask: vi.fn(async ({ taskId }) => createSnapshot(taskId, `gid-${taskId}`)),
    deleteTask: vi.fn(async () => {})
  }
}

function createManagerHarness(adapter: DownloadAdapter = createAdapterMock()): {
  adapter: DownloadAdapter
  logger: InMemoryLogger
  store: MemoryTaskStore
  taskManager: InMemoryTaskManager
} {
  const logger = new InMemoryLogger()
  const store = new MemoryTaskStore()
  const taskManager = new InMemoryTaskManager(adapter, logger, store)

  return {
    adapter,
    logger,
    store,
    taskManager
  }
}

describe('InMemoryTaskManager create flow', () => {
  it('creates and starts a magnet task', async () => {
    const { adapter, store, taskManager } = createManagerHarness()
    const task = await taskManager.createTask({
      source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
      savePath: 'D:\\Downloads',
      name: 'Ubuntu ISO'
    })

    expect(task.status).toBe('downloading')
    expect(task.remoteId).toBe(`gid-${task.id}`)
    expect(adapter.assertReady).toHaveBeenCalledOnce()
    expect(adapter.attachTask).toHaveBeenCalledOnce()
    expect(adapter.startTask).toHaveBeenCalledWith({ taskId: task.id })
    expect(store.tasks.get(task.id)?.status).toBe('downloading')
  })

  it('surfaces a readable message when metadata fetch has no available peers yet', async () => {
    const adapter = createAdapterMock()
    adapter.attachTask = vi.fn(async ({ taskId, source, savePath }) => ({
      id: `session-${taskId}`,
      taskId,
      remoteId: `gid-${taskId}`,
      source,
      savePath,
      status: 'pending',
      totalBytes: 0,
      downloadedBytes: 0,
      speedBytes: 0,
      trackerCount: 1,
      fallbackTrackerCount: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))
    adapter.startTask = vi.fn(async ({ taskId }) =>
      createSnapshot(taskId, `gid-${taskId}`, {
        status: 'metadata',
        totalBytes: 0,
        downloadedBytes: 0,
        speedBytes: 0,
        seedersCount: 0,
        progress: 0
      })
    )

    const { taskManager } = createManagerHarness(adapter)
    const task = await taskManager.createTask({
      source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
      savePath: 'D:\\Downloads'
    })

    expect(task.status).toBe('metadata')
    expect(task.facts?.guidance).toMatchObject({
      code: 'magnet_metadata_sparse_peers',
      severity: 'warning',
      shortMessage: expect.any(String)
    })
    expect(task.errorMessage).toContain(task.facts?.guidance?.shortMessage ?? '')
    expect(task.errorMessage).toContain('已补充 5 个 fallback tracker')
  })

  it('tracks magnet fact fields across creation and repeated metadata syncs', async () => {
    vi.useFakeTimers()

    try {
      vi.setSystemTime(new Date('2026-03-21T12:00:00.000Z'))
      const adapter = createAdapterMock()
      adapter.attachTask = vi.fn(async ({ taskId, source, savePath }) => ({
        id: `session-${taskId}`,
        taskId,
        remoteId: `gid-${taskId}`,
        source,
        savePath,
        status: 'pending',
        totalBytes: 0,
        downloadedBytes: 0,
        speedBytes: 0,
        trackerCount: 4,
        fallbackTrackerCount: 7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }))
      adapter.startTask = vi.fn(async ({ taskId }) =>
        createSnapshot(taskId, `gid-${taskId}`, {
          status: 'metadata',
          totalBytes: 0,
          downloadedBytes: 0,
          speedBytes: 0,
          progress: 0,
          seedersCount: 0
        })
      )
      adapter.getTaskSnapshot = vi.fn(async ({ taskId }) =>
        createSnapshot(taskId, `gid-${taskId}`, {
          status: 'metadata',
          totalBytes: 0,
          downloadedBytes: 0,
          speedBytes: 0,
          progress: 0,
          seedersCount: 0
        })
      )

      const { store, taskManager } = createManagerHarness(adapter)
      const task = await taskManager.createTask({
        source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
        savePath: 'D:\\Downloads'
      })

      expect(task.status).toBe('metadata')
      expect(task.facts).toMatchObject({
        sourceType: 'magnet',
        seedersCount: 0,
        trackerCount: 4,
        fallbackTrackerCount: 7,
        metadataSince: '2026-03-21T12:00:00.000Z',
        zeroSpeedSince: '2026-03-21T12:00:00.000Z',
        metadataElapsedMs: 0,
        zeroSpeedDurationMs: 0,
        resourceHealthScore: 80,
        resourceHealthLevel: 'healthy',
        bottleneckCode: 'peer_sparse',
        peerAvailability: 'none',
        trackerHealth: 'normal'
      })

      vi.setSystemTime(new Date('2026-03-21T12:00:45.000Z'))

      const [syncedTask] = await taskManager.listTasks()
      expect(syncedTask.status).toBe('metadata')
      expect(syncedTask.facts?.guidance).toMatchObject({
        code: 'magnet_metadata_sparse_peers',
        severity: 'warning',
        shortMessage: expect.any(String)
      })
      expect(syncedTask.errorMessage).toContain(syncedTask.facts?.guidance?.shortMessage ?? '')
      expect(syncedTask.errorMessage).toContain('已补充 7 个 fallback tracker')
      expect(syncedTask.facts).toMatchObject({
        sourceType: 'magnet',
        seedersCount: 0,
        trackerCount: 4,
        fallbackTrackerCount: 7,
        metadataSince: '2026-03-21T12:00:00.000Z',
        zeroSpeedSince: '2026-03-21T12:00:00.000Z',
        metadataElapsedMs: 45_000,
        zeroSpeedDurationMs: 45_000,
        resourceHealthScore: 80,
        resourceHealthLevel: 'healthy',
        bottleneckCode: 'peer_sparse',
        peerAvailability: 'none',
        trackerHealth: 'normal',
        guidance: {
          code: 'magnet_metadata_sparse_peers',
          severity: 'warning',
          shortMessage: expect.any(String)
        }
      })
      expect(taskManager.getTasks()[0].facts).toMatchObject(syncedTask.facts ?? {})
      expect(store.tasks.get(task.id)?.facts).toMatchObject({
        sourceType: 'magnet',
        seedersCount: 0,
        trackerCount: 4,
        fallbackTrackerCount: 7,
        metadataSince: '2026-03-21T12:00:00.000Z',
        zeroSpeedSince: '2026-03-21T12:00:00.000Z',
        metadataElapsedMs: 45_000,
        zeroSpeedDurationMs: 45_000,
        resourceHealthScore: 80,
        resourceHealthLevel: 'healthy',
        bottleneckCode: 'peer_sparse',
        peerAvailability: 'none',
        trackerHealth: 'normal',
        guidance: {
          code: 'magnet_metadata_sparse_peers',
          severity: 'warning',
          shortMessage: expect.any(String)
        }
      })
      expect(store.tasks.get(task.id)?.status).toBe('metadata')
      expect(store.tasks.get(task.id)?.errorMessage).toContain(
        store.tasks.get(task.id)?.facts?.guidance?.shortMessage ?? ''
      )
    } finally {
      vi.useRealTimers()
    }
  })

})

describe('InMemoryTaskManager lifecycle and failure handling', () => {
  it('rolls back the remote task when start fails after attach', async () => {
    const adapter = createAdapterMock()
    adapter.startTask = vi.fn(async () => {
      throw new Error('aria2 start failed')
    })

    const { taskManager } = createManagerHarness(adapter)

    await expect(
      taskManager.createTask({
        source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
        savePath: 'D:\\Downloads'
      })
    ).rejects.toThrow('aria2 start failed')

    expect(adapter.deleteTask).toHaveBeenCalledOnce()

    const [failedTask] = await taskManager.listTasks()
    expect(failedTask.status).toBe('failed')
    expect(failedTask.remoteId).toBeUndefined()
    expect(failedTask.errorMessage).toContain('aria2 start failed')
  })

  it('rolls back the remote task when start returns a failed snapshot', async () => {
    const adapter = createAdapterMock()
    adapter.startTask = vi.fn(async ({ taskId }) =>
      createSnapshot(taskId, `gid-${taskId}`, {
        status: 'failed',
        errorMessage: '该 magnet 任务已存在于 aria2 下载队列中'
      })
    )

    const { taskManager } = createManagerHarness(adapter)

    await expect(
      taskManager.createTask({
        source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
        savePath: 'D:\\Downloads'
      })
    ).rejects.toThrow('该 magnet 任务已存在于 aria2 下载队列中')

    expect(adapter.deleteTask).toHaveBeenCalledOnce()

    const [failedTask] = await taskManager.listTasks()
    expect(failedTask.status).toBe('failed')
    expect(failedTask.remoteId).toBeUndefined()
    expect(failedTask.errorMessage).toContain('该 magnet 任务已存在于 aria2 下载队列中')
  })

  it('surfaces rollback failure in the task error message', async () => {
    const adapter = createAdapterMock()
    adapter.startTask = vi.fn(async () => {
      throw new Error('aria2 start failed')
    })
    adapter.deleteTask = vi.fn(async () => {
      throw new Error('remote cleanup failed')
    })

    const { taskManager } = createManagerHarness(adapter)

    await expect(
      taskManager.createTask({
        source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
        savePath: 'D:\\Downloads'
      })
    ).rejects.toThrow('aria2 start failed')

    const [failedTask] = await taskManager.listTasks()
    expect(failedTask.status).toBe('failed')
    expect(failedTask.remoteId).toBeDefined()
    expect(failedTask.errorMessage).toContain('aria2 start failed')
    expect(failedTask.errorMessage).toContain('remote cleanup failed')
  })

  it('rejects non-magnet sources before touching adapter or storage', async () => {
    const { adapter, store, taskManager } = createManagerHarness()

    await expect(
      taskManager.createTask({
        source: 'https://example.com/file.zip',
        savePath: 'D:\\Downloads'
      })
    ).rejects.toThrow('当前阶段仅支持 magnet 下载任务')

    expect(adapter.assertReady).not.toHaveBeenCalled()
    expect(store.tasks.size).toBe(0)
  })

  it('updates task state for pause, resume and delete operations', async () => {
    let currentStatus: DownloadTaskSnapshot['status'] = 'downloading'
    const adapter = createAdapterMock()
    adapter.getTaskSnapshot = vi.fn(async ({ taskId }) =>
      createSnapshot(taskId, `gid-${taskId}`, {
        status: currentStatus,
        speedBytes: currentStatus === 'paused' ? 0 : 5
      })
    )
    adapter.pauseTask = vi.fn(async ({ taskId }) => {
      currentStatus = 'paused'
      return createSnapshot(taskId, `gid-${taskId}`, {
        status: 'paused',
        speedBytes: 0
      })
    })
    adapter.resumeTask = vi.fn(async ({ taskId }) => {
      currentStatus = 'downloading'
      return createSnapshot(taskId, `gid-${taskId}`)
    })

    const { store, taskManager } = createManagerHarness(adapter)
    const task = await taskManager.createTask({
      source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
      savePath: 'D:\\Downloads'
    })

    await taskManager.pauseTask({ taskId: task.id })
    let [storedTask] = await taskManager.listTasks()
    expect(storedTask.status).toBe('paused')

    await taskManager.resumeTask({ taskId: task.id })
    ;[storedTask] = await taskManager.listTasks()
    expect(storedTask.status).toBe('downloading')

    await taskManager.deleteTask({ taskId: task.id })
    expect(adapter.deleteTask).toHaveBeenCalled()
    expect(store.deletedTaskIds).toContain(task.id)
    expect(await taskManager.listTasks()).toHaveLength(0)
  })
})
