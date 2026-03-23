import type { DownloadTaskSnapshot } from '../../adapters'
import {
  isFinishedDownloadTaskStatus,
  type CreateDownloadTaskInput,
  type DownloadTask,
  type DownloadTaskFacts
} from '../../types'

const RESTART_RECOVERY_MESSAGE = '应用重启后下载已停止，请手动恢复任务'

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function buildTaskName(input: CreateDownloadTaskInput): string {
  const trimmedName = input.name?.trim()

  if (trimmedName) {
    return trimmedName
  }

  return 'Download Task'
}

function assertTaskField(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required`)
  }
}

function assertSupportedSource(source: string): void {
  if (!source.trim().startsWith('magnet:?')) {
    throw new Error('当前阶段仅支持 magnet 下载任务。请输入以 magnet:? 开头的链接。')
  }
}

export function updateTask(task: DownloadTask, patch: Partial<DownloadTask>): DownloadTask {
  const changed = (Object.keys(patch) as Array<keyof DownloadTask>).some(
    (key) => task[key] !== patch[key]
  )

  if (!changed) {
    return task
  }

  return {
    ...task,
    ...patch,
    updatedAt: new Date().toISOString()
  }
}

function parseDurationMs(from: string | undefined, to: string): number | undefined {
  if (!from) {
    return undefined
  }

  const startedAt = Date.parse(from)
  const endedAt = Date.parse(to)

  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) {
    return undefined
  }

  return Math.max(endedAt - startedAt, 0)
}

function buildMagnetFacts(
  task: DownloadTask,
  patch: Partial<DownloadTaskFacts>,
  updatedAt: string
): DownloadTaskFacts | undefined {
  if (task.type !== 'magnet') {
    return task.facts
  }

  const previousFacts = task.facts
  const metadataSince =
    patch.metadataSince !== undefined ? patch.metadataSince : previousFacts?.metadataSince ?? task.metadataSince
  const zeroSpeedSince =
    patch.zeroSpeedSince !== undefined ? patch.zeroSpeedSince : previousFacts?.zeroSpeedSince ?? task.zeroSpeedSince

  return {
    sourceType: 'magnet',
    seedersCount:
      patch.seedersCount !== undefined ? patch.seedersCount : previousFacts?.seedersCount ?? task.seedersCount,
    trackerCount:
      patch.trackerCount !== undefined ? patch.trackerCount : previousFacts?.trackerCount ?? task.trackerCount,
    fallbackTrackerCount:
      patch.fallbackTrackerCount !== undefined
        ? patch.fallbackTrackerCount
        : previousFacts?.fallbackTrackerCount ?? task.fallbackTrackerCount,
    metadataSince,
    zeroSpeedSince,
    metadataElapsedMs: parseDurationMs(metadataSince, updatedAt),
    zeroSpeedDurationMs: parseDurationMs(zeroSpeedSince, updatedAt)
  }
}

export function applySnapshot(task: DownloadTask, snapshot: DownloadTaskSnapshot): DownloadTask {
  const metadataSince =
    snapshot.status === 'metadata'
      ? task.facts?.metadataSince ?? task.metadataSince ?? snapshot.updatedAt
      : undefined
  const zeroSpeedSince =
    ['metadata', 'downloading'].includes(snapshot.status) && snapshot.speedBytes === 0
      ? task.facts?.zeroSpeedSince ?? task.zeroSpeedSince ?? snapshot.updatedAt
      : undefined

  return updateTask(task, {
    remoteId: snapshot.remoteId ?? task.remoteId,
    status: snapshot.status,
    progress: snapshot.progress,
    downloadedBytes: snapshot.downloadedBytes,
    totalBytes: snapshot.totalBytes,
    speedBytes: snapshot.speedBytes,
    seedersCount: snapshot.seedersCount,
    metadataSince,
    zeroSpeedSince,
    facts: buildMagnetFacts(
      task,
      {
        seedersCount: snapshot.seedersCount,
        metadataSince,
        zeroSpeedSince
      },
      snapshot.updatedAt
    ),
    etaSeconds: snapshot.etaSeconds,
    errorMessage: snapshot.errorMessage
  })
}

export function resolveRuntimeTaskMessage(
  previousTask: DownloadTask,
  nextTask: DownloadTask
): string | undefined {
  if (nextTask.errorMessage) {
    return nextTask.errorMessage
  }

  const isStalled =
    nextTask.speedBytes === 0 &&
    nextTask.downloadedBytes === previousTask.downloadedBytes

  if (nextTask.status === 'metadata' && isStalled) {
    return '正在获取种子元数据；当前未连接到可用 peer，或 tracker 暂未返回可用节点。'
  }

  if (nextTask.status === 'downloading' && isStalled) {
    return '当前下载速度为 0；可能暂无可用 peer，或网络暂时不可达。'
  }

  return undefined
}

function resolveTaskType(source: string): DownloadTask['type'] {
  return source.trim().startsWith('magnet:?') ? 'magnet' : 'uri'
}

export function createPendingMagnetTask(input: CreateDownloadTaskInput): DownloadTask {
  assertTaskField(input.source, 'source')
  assertTaskField(input.savePath, 'savePath')
  assertSupportedSource(input.source)

  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    name: buildTaskName(input),
    type: resolveTaskType(input.source),
    source: input.source.trim(),
    engine: 'aria2',
    status: 'pending',
    savePath: input.savePath.trim(),
    progress: 0,
    speedBytes: 0,
    downloadedBytes: 0,
    facts: {
      sourceType: 'magnet'
    },
    createdAt: now,
    updatedAt: now
  }
}

export function needsRuntimeSession(task: DownloadTask): boolean {
  return task.status === 'paused'
}

export function restoreTaskState(task: DownloadTask): DownloadTask {
  const shouldPauseAfterRestart = ['pending', 'metadata', 'downloading'].includes(task.status)

  if (shouldPauseAfterRestart) {
    return updateTask(task, {
      status: 'paused',
      speedBytes: 0,
      metadataSince: undefined,
      zeroSpeedSince: undefined,
      facts: buildMagnetFacts(
        task,
        {
          metadataSince: undefined,
          zeroSpeedSince: undefined
        },
        new Date().toISOString()
      ),
      etaSeconds: undefined,
      errorMessage: RESTART_RECOVERY_MESSAGE
    })
  }

  if (task.status === 'paused') {
    return updateTask(task, {
      speedBytes: 0,
      metadataSince: undefined,
      zeroSpeedSince: undefined,
      facts: buildMagnetFacts(
        task,
        {
          metadataSince: undefined,
          zeroSpeedSince: undefined
        },
        new Date().toISOString()
      ),
      etaSeconds: undefined
    })
  }

  if (isFinishedDownloadTaskStatus(task.status)) {
    return updateTask(task, {
      speedBytes: 0,
      metadataSince: undefined,
      zeroSpeedSince: undefined,
      facts: buildMagnetFacts(
        task,
        {
          metadataSince: undefined,
          zeroSpeedSince: undefined
        },
        new Date().toISOString()
      ),
      etaSeconds: undefined
    })
  }

  return task
}

export function buildSourcePreview(source: string): string {
  const normalized = source.trim()
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized
}
