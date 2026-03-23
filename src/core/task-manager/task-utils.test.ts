import { describe, expect, it } from 'vitest'

import type { DownloadTask } from '../../types'
import { resolveRuntimeTaskMessage } from './task-utils'

function createTask(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: 'task-1',
    name: 'Ubuntu ISO',
    type: 'magnet',
    source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
    engine: 'aria2',
    status: 'metadata',
    savePath: 'D:\\Downloads',
    progress: 0,
    speedBytes: 0,
    downloadedBytes: 0,
    createdAt: '2026-03-21T12:00:00.000Z',
    updatedAt: '2026-03-21T12:00:00.000Z',
    facts: {
      sourceType: 'magnet'
    },
    ...patch
  }
}

describe('resolveRuntimeTaskMessage', () => {
  it('lowers expectations when metadata has no available peers', () => {
    const previousTask = createTask()
    const nextTask = createTask({
      status: 'metadata',
      facts: {
        sourceType: 'magnet',
        seedersCount: 0,
        fallbackTrackerCount: 7
      }
    })

    const message = resolveRuntimeTaskMessage(previousTask, nextTask)

    expect(message).toContain('当前仍未发现可用 peer')
    expect(message).toContain('资源热度较低')
    expect(message).toContain('建议降低速度预期')
    expect(message).toContain('7 个 fallback tracker')
  })

  it('surfaces resource-side bottleneck for zero-speed downloads with sparse peers', () => {
    const previousTask = createTask({
      status: 'downloading',
      downloadedBytes: 128,
      progress: 0.2
    })
    const nextTask = createTask({
      status: 'downloading',
      downloadedBytes: 128,
      progress: 0.2,
      speedBytes: 0,
      facts: {
        sourceType: 'magnet',
        seedersCount: 1,
        fallbackTrackerCount: 3
      }
    })

    const message = resolveRuntimeTaskMessage(previousTask, nextTask)

    expect(message).toContain('当前下载速度持续为 0')
    expect(message).toContain('当前仅有 1 个可用 peer')
    expect(message).toContain('资源侧瓶颈')
    expect(message).toContain('建议降低速度预期')
    expect(message).toContain('3 个 fallback tracker')
  })
})
