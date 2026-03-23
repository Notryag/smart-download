import { describe, expect, it, vi } from 'vitest'

import type { DownloadAdapter } from '../../adapters'
import type { DownloadTask } from '../../types'
import { BasicDiagnosticsService } from './index'

function createAdapter(): DownloadAdapter {
  return {
    getRuntimeStatus: vi.fn(async () => ({
      ready: true,
      client: 'aria2',
      message: 'ok'
    })),
    assertReady: vi.fn(async () => {}),
    attachTask: vi.fn(),
    hydrateTask: vi.fn(),
    startTask: vi.fn(),
    getTaskSnapshot: vi.fn(),
    pauseTask: vi.fn(),
    resumeTask: vi.fn(),
    deleteTask: vi.fn()
  } as unknown as DownloadAdapter
}

function createTask(patch: Partial<DownloadTask> & Record<string, unknown> = {}): DownloadTask {
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
    ...patch
  } as DownloadTask
}

describe('BasicDiagnosticsService', () => {
  it('aggregates structured slow-magnet facts for downstream consumers', async () => {
    vi.useFakeTimers()

    try {
      vi.setSystemTime(new Date('2026-03-21T12:02:00.000Z'))

      const service = new BasicDiagnosticsService(createAdapter())
      const tasks = [
        createTask({
          id: 'task-1',
          status: 'metadata',
          facts: {
            sourceType: 'magnet',
            seedersCount: 0,
            trackerCount: 2,
            metadataSince: '2026-03-21T12:00:00.000Z',
            zeroSpeedSince: '2026-03-21T12:00:00.000Z',
            metadataElapsedMs: 120_000,
            zeroSpeedDurationMs: 120_000
          }
        }),
        createTask({
          id: 'task-2',
          status: 'downloading',
          progress: 0.15,
          speedBytes: 0,
          downloadedBytes: 15,
          facts: {
            sourceType: 'magnet',
            seedersCount: 1,
            trackerCount: 1,
            fallbackTrackerCount: 3,
            zeroSpeedDurationMs: 61_000
          }
        })
      ]

      const summary = await service.getSummary(tasks as DownloadTask[], [])

      expect(summary.taskFacts).toHaveLength(2)
      expect(summary.facts).toMatchObject({
        slowTasks: [
          {
            taskId: 'task-1',
            status: 'metadata',
            sourceType: 'magnet',
            seedersCount: 0,
            trackerCount: 2,
            resourceHealthScore: 30,
            metadataElapsedMs: 120_000,
            zeroSpeedDurationMs: 120_000
          },
          {
            taskId: 'task-2',
            status: 'downloading',
            sourceType: 'magnet',
            seedersCount: 1,
            trackerCount: 1,
            fallbackTrackerCount: 3,
            resourceHealthScore: 25,
            zeroSpeedDurationMs: 61_000
          }
        ],
        bottlenecks: {
          metadataStallCount: 1,
          zeroSpeedCount: 2,
          trackerSparseCount: 1
        },
        resourceHealth: {
          score: 25,
          level: 'critical',
          reason: expect.any(String),
          signals: {
            metadataStallCount: 1,
            zeroSpeedCount: 2,
            trackerSparseCount: 1
          }
        }
      })
      expect(summary.highlights).toHaveLength(2)
      expect(summary.highlights).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'metadata-task-1',
            severity: 'warning',
            title: '元数据获取偏慢：Ubuntu ISO'
          }),
          expect.objectContaining({
            id: 'zero-speed-task-1',
            severity: 'warning',
            title: '任务持续无速度：Ubuntu ISO'
          })
        ])
      )
      expect(summary.guidance).toMatchObject([
        {
          code: 'magnet_metadata_sparse_peers',
          severity: 'warning',
          shortMessage: expect.any(String)
        },
        {
          code: 'magnet_zero_speed_sparse_peers',
          severity: 'warning',
          shortMessage: expect.any(String)
        }
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a healthy score when magnet resource signals stay stable', async () => {
    const service = new BasicDiagnosticsService(createAdapter())
    const tasks = [
      createTask({
        id: 'task-healthy',
        status: 'downloading',
        speedBytes: 2048,
        downloadedBytes: 1024,
        progress: 0.4,
        facts: {
          sourceType: 'magnet',
          seedersCount: 8,
          trackerCount: 5,
          fallbackTrackerCount: 2,
          resourceHealthScore: 95
        }
      })
    ]

    const summary = await service.getSummary(tasks as DownloadTask[], [])

    expect(summary.taskFacts[0]).toMatchObject({
      taskId: 'task-healthy',
      resourceHealthScore: 95
    })
    expect(summary.facts.resourceHealth).toMatchObject({
      score: 95,
      level: 'healthy',
      reason: expect.any(String),
      signals: {
        metadataStallCount: 0,
        zeroSpeedCount: 0,
        trackerSparseCount: 0
      }
    })
  })
})
