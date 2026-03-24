import { describe, expect, it } from 'vitest'

import type { DownloadTask } from '../../types'
import {
  buildBottleneckCode,
  buildMetadataState,
  buildPeerAvailability,
  buildResourceHealthLevel,
  buildResourceHealthScore,
  buildTaskGuidance,
  buildTrackerHealth,
  resolveRuntimeTaskMessage
} from './task-utils'

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
    const guidance = buildTaskGuidance(nextTask)
    const message = resolveRuntimeTaskMessage(previousTask, nextTask)

    expect(guidance).toMatchObject({
      code: 'magnet_metadata_sparse_peers',
      severity: 'warning',
      shortMessage: expect.any(String)
    })
    expect(message).toContain('正在获取种子元数据；')
    expect(message).toContain(guidance?.shortMessage ?? '')
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
    const guidance = buildTaskGuidance(nextTask)
    const message = resolveRuntimeTaskMessage(previousTask, nextTask)

    expect(guidance).toMatchObject({
      code: 'magnet_zero_speed_sparse_peers',
      severity: 'warning',
      shortMessage: expect.any(String)
    })
    expect(message).toContain(guidance?.shortMessage ?? '')
    expect(message).toContain('3 个 fallback tracker')
  })

  it('builds structured guidance for the inspector', () => {
    const task = createTask({
      status: 'metadata',
      speedBytes: 0,
      facts: {
        sourceType: 'magnet',
        seedersCount: 0,
        fallbackTrackerCount: 7,
        metadataElapsedMs: 120_000
      }
    })

    const guidance = buildTaskGuidance(task)

    expect(guidance).toMatchObject({
      code: 'magnet_metadata_sparse_peers',
      severity: 'warning',
      shortMessage: expect.any(String)
    })
  })

  it('distinguishes metadata wait stages from current network facts', () => {
    const waitingPeersTask = createTask({
      status: 'metadata',
      facts: {
        sourceType: 'magnet',
        seedersCount: 0,
        trackerCount: 1
      }
    })
    const connectingPeersTask = createTask({
      status: 'metadata',
      facts: {
        sourceType: 'magnet',
        seedersCount: 3,
        connectionsCount: 0,
        trackerCount: 4
      }
    })
    const exchangingMetadataTask = createTask({
      status: 'metadata',
      facts: {
        sourceType: 'magnet',
        seedersCount: 3,
        connectionsCount: 2,
        trackerCount: 4
      }
    })

    expect(buildMetadataState(waitingPeersTask)).toBe('waiting_peers')
    expect(buildMetadataState(connectingPeersTask)).toBe('connecting_peers')
    expect(buildMetadataState(exchangingMetadataTask)).toBe('exchanging_metadata')
  })

  it('surfaces tracker-side weakness before any peer is discovered', () => {
    const task = createTask({
      status: 'metadata',
      facts: {
        sourceType: 'magnet',
        seedersCount: 0,
        trackerCount: 0,
        metadataState: 'waiting_peers',
        trackerHealth: 'none',
        fallbackTrackerCount: 7
      }
    })

    const guidance = buildTaskGuidance(task)

    expect(guidance).toMatchObject({
      code: 'magnet_metadata_sparse_peers',
      shortMessage: expect.stringContaining('tracker')
    })
    expect(guidance?.reason).toContain('tracker 信号偏弱')
  })

  it('surfaces metadata exchange stalls after peer connections are established', () => {
    const task = createTask({
      status: 'metadata',
      facts: {
        sourceType: 'magnet',
        seedersCount: 3,
        connectionsCount: 2,
        metadataState: 'exchanging_metadata',
        fallbackTrackerCount: 3
      }
    })

    const guidance = buildTaskGuidance(task)

    expect(guidance).toMatchObject({
      code: 'magnet_metadata_sparse_peers',
      shortMessage: expect.stringContaining('已连上 2 个 peer')
    })
    expect(guidance?.bottleneck).toContain('metadata 交换阶段')
  })

  it('scores magnet resource health from current facts', () => {
    const task = createTask({
      status: 'downloading',
      speedBytes: 0,
      facts: {
        sourceType: 'magnet',
        seedersCount: 1,
        trackerCount: 1,
        fallbackTrackerCount: 3,
        zeroSpeedDurationMs: 61_000
      }
    })

    expect(buildResourceHealthScore(task)).toBe(25)
    expect(buildResourceHealthLevel(buildResourceHealthScore(task))).toBe('critical')
    expect(buildBottleneckCode(task)).toBe('zero_speed_stall')
    expect(buildPeerAvailability(task.facts?.seedersCount)).toBe('scarce')
    expect(buildTrackerHealth(task.facts?.trackerCount)).toBe('sparse')
  })

  it('classifies metadata tasks with no peers as resource-side bottlenecks', () => {
    const task = createTask({
      status: 'metadata',
      facts: {
        sourceType: 'magnet',
        seedersCount: 0,
        trackerCount: 2,
        metadataElapsedMs: 120_000
      }
    })

    expect(buildResourceHealthScore(task)).toBe(30)
    expect(buildResourceHealthLevel(buildResourceHealthScore(task))).toBe('critical')
    expect(buildBottleneckCode(task)).toBe('metadata_stall')
    expect(buildPeerAvailability(task.facts?.seedersCount)).toBe('none')
    expect(buildTrackerHealth(task.facts?.trackerCount)).toBe('normal')
  })

  it('keeps healthy resources readable through structured fields', () => {
    const task = createTask({
      status: 'downloading',
      speedBytes: 2_048,
      downloadedBytes: 1_024,
      facts: {
        sourceType: 'magnet',
        seedersCount: 8,
        trackerCount: 4,
        fallbackTrackerCount: 2
      }
    })

    expect(buildResourceHealthScore(task)).toBe(100)
    expect(buildResourceHealthLevel(buildResourceHealthScore(task))).toBe('healthy')
    expect(buildBottleneckCode(task)).toBe('none')
    expect(buildPeerAvailability(task.facts?.seedersCount)).toBe('good')
    expect(buildTrackerHealth(task.facts?.trackerCount)).toBe('normal')
  })
})
