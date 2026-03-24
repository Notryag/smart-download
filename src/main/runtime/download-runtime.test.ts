import { describe, expect, it, vi } from 'vitest'

import type { DownloadTaskStore } from '../../storage'
import type { DownloadTask } from '../../types'
import { createDownloadRuntime } from './download-runtime'

class MemoryTaskStore implements DownloadTaskStore {
  close = vi.fn()

  async upsertTask(task: DownloadTask): Promise<void> {
    void task
  }

  async listTasks(): Promise<DownloadTask[]> {
    return []
  }

  async deleteTask(taskId: string): Promise<void> {
    void taskId
  }
}

describe('createDownloadRuntime', () => {
  it('builds a reusable download runtime without window or IPC dependencies', async () => {
    const taskStore = new MemoryTaskStore()
    const managedAria2Service = {
      start: vi.fn(async () => ({
        config: null,
        unavailableMessage: 'aria2 unavailable'
      })),
      stop: vi.fn()
    }

    const runtime = await createDownloadRuntime({
      paths: {
        userDataPath: 'D:\\runtime\\user-data',
        downloadsPath: 'D:\\runtime\\downloads'
      },
      taskStore,
      managedAria2Service: managedAria2Service as never
    })

    expect(managedAria2Service.start).toHaveBeenCalledOnce()
    expect(runtime.taskManager).toBeDefined()
    expect(runtime.diagnosticsService).toBeDefined()
    expect(runtime.taskStore).toBe(taskStore)

    runtime.stop()

    expect(managedAria2Service.stop).toHaveBeenCalledOnce()
    expect(taskStore.close).toHaveBeenCalledOnce()
  })
})
