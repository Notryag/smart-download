import { describe, expect, it } from 'vitest'

import type { RuntimeSession } from './types'
import {
  ARIA2_FALLBACK_TRACKERS,
  assertSource,
  buildSnapshot,
  isSettledTaskStatus,
  normalizeMagnetSourceForAria2,
  toRuntimeStatusMessage
} from './utils'

function createSession(patch: Partial<RuntimeSession> = {}): RuntimeSession {
  return {
    taskId: 'task-1',
    gid: 'gid-1',
    source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
    savePath: 'D:\\Downloads',
    createdAt: '2026-03-21T12:00:00.000Z',
    updatedAt: '2026-03-21T12:00:00.000Z',
    ...patch
  }
}

describe('aria2 utils', () => {
  it('maps active magnet tasks without total size to metadata', () => {
    const snapshot = buildSnapshot(createSession(), {
      gid: 'gid-1',
      status: 'active',
      totalLength: '0',
      completedLength: '0',
      downloadSpeed: '0',
      numSeeders: '0'
    })

    expect(snapshot.status).toBe('metadata')
    expect(snapshot.progress).toBe(0)
    expect(snapshot.speedBytes).toBe(0)
    expect(snapshot.seedersCount).toBe(0)
    expect(snapshot.etaSeconds).toBeUndefined()
  })

  it('maps active tasks with size to downloading and calculates progress fields', () => {
    const snapshot = buildSnapshot(createSession(), {
      gid: 'gid-1',
      status: 'active',
      totalLength: '100',
      completedLength: '25',
      downloadSpeed: '5',
      numSeeders: '12'
    })

    expect(snapshot.status).toBe('downloading')
    expect(snapshot.totalBytes).toBe(100)
    expect(snapshot.downloadedBytes).toBe(25)
    expect(snapshot.progress).toBe(0.25)
    expect(snapshot.speedBytes).toBe(5)
    expect(snapshot.seedersCount).toBe(12)
    expect(snapshot.etaSeconds).toBe(15)
  })

  it('prefers the current aria2 gid in snapshots', () => {
    const snapshot = buildSnapshot(createSession({ gid: 'gid-1' }), {
      gid: 'gid-2',
      status: 'active',
      totalLength: '100',
      completedLength: '25',
      downloadSpeed: '5'
    })

    expect(snapshot.remoteId).toBe('gid-2')
  })

  it('maps terminal aria2 states to settled task statuses', () => {
    const paused = buildSnapshot(createSession(), {
      gid: 'gid-1',
      status: 'paused',
      totalLength: '100',
      completedLength: '10',
      downloadSpeed: '20'
    })
    const completed = buildSnapshot(createSession(), {
      gid: 'gid-1',
      status: 'complete',
      totalLength: '100',
      completedLength: '100',
      downloadSpeed: '0'
    })
    const failed = buildSnapshot(createSession(), {
      gid: 'gid-1',
      status: 'error',
      totalLength: '100',
      completedLength: '30',
      downloadSpeed: '0',
      errorMessage: 'tracker failed'
    })

    expect(paused.status).toBe('paused')
    expect(paused.speedBytes).toBe(0)
    expect(completed.status).toBe('completed')
    expect(failed.status).toBe('failed')
    expect(failed.errorMessage).toBe('tracker failed')
    expect(isSettledTaskStatus(paused.status)).toBe(true)
    expect(isSettledTaskStatus(completed.status)).toBe(true)
    expect(isSettledTaskStatus(failed.status)).toBe(true)
  })

  it('translates aria2 file-conflict errors into user-readable chinese messages', () => {
    const snapshot = buildSnapshot(createSession(), {
      gid: 'gid-1',
      status: 'error',
      totalLength: '5702520832',
      completedLength: '0',
      downloadSpeed: '0',
      errorMessage:
        'File D:/ubuntu-25.10-desktop-amd64.iso exists, but a control file(*.aria2) does not exist. Download was canceled in order to prevent your file from being truncated to 0. If you are sure to download the file all over again, then delete it or add --allow-overwrite=true option and restart aria2.'
    })

    expect(snapshot.errorMessage).toBe(
      '目标文件已存在：D:/ubuntu-25.10-desktop-amd64.iso。为避免覆盖现有文件，本次下载已取消。请删除原文件，或改用新的文件名后重试。'
    )
  })

  it('converts transport errors into user-readable runtime status messages', () => {
    expect(toRuntimeStatusMessage(new Error('fetch failed'))).toBe(
      '无法连接 aria2 RPC。请确认 aria2 已启动，并已启用 RPC。'
    )
    expect(toRuntimeStatusMessage(new Error('401 unauthorized'))).toBe(
      'aria2 RPC 检查失败：401 unauthorized'
    )
  })

  it('appends fallback trackers to magnet sources without duplicating existing entries', () => {
    const normalized = normalizeMagnetSourceForAria2(
      `magnet:?xt=urn:btih:1234567890123456789012345678901234567890&tr=${encodeURIComponent(ARIA2_FALLBACK_TRACKERS[0])}`
    )
    const trackers = new URL(normalized.source).searchParams.getAll('tr')

    expect(normalized.addedTrackerCount).toBe(ARIA2_FALLBACK_TRACKERS.length - 1)
    expect(trackers).toEqual([ARIA2_FALLBACK_TRACKERS[0], ...ARIA2_FALLBACK_TRACKERS.slice(1)])
  })

  it('rejects blank sources early', () => {
    expect(() => assertSource('   ')).toThrow('下载地址不能为空。')
  })
})
