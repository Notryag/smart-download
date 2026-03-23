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

function buildFallbackTrackerHint(fallbackTrackerCount: number | undefined): string {
  if (!fallbackTrackerCount || fallbackTrackerCount <= 0) {
    return ''
  }

  return ` 已补充 ${fallbackTrackerCount} 个 fallback tracker。`
}

function buildMetadataPolicyMessage(task: DownloadTask): string {
  const seedersCount = task.facts?.seedersCount ?? task.seedersCount
  const fallbackHint = buildFallbackTrackerHint(
    task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount
  )

  if ((seedersCount ?? 0) <= 0) {
    return `正在获取种子元数据；当前仍未发现可用 peer，资源热度较低，建议降低速度预期并稍后再试。${fallbackHint}`.trim()
  }

  if (seedersCount === 1) {
    return `正在获取种子元数据；当前仅发现 1 个可用 peer，资源较冷，建议降低速度预期。${fallbackHint}`.trim()
  }

  return `正在获取种子元数据；当前 peer 仍偏少，tracker 暂未返回更稳定的节点，建议先降低速度预期。${fallbackHint}`.trim()
}

function buildZeroSpeedPolicyMessage(task: DownloadTask): string {
  const seedersCount = task.facts?.seedersCount ?? task.seedersCount
  const fallbackHint = buildFallbackTrackerHint(
    task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount
  )

  if ((seedersCount ?? 0) <= 0) {
    return `当前下载速度持续为 0；已补 fallback tracker 后仍未发现稳定 peer，更可能是资源侧瓶颈，建议降低速度预期或稍后重试。${fallbackHint}`.trim()
  }

  if (seedersCount === 1) {
    return `当前下载速度持续为 0；当前仅有 1 个可用 peer，更可能是资源侧瓶颈，建议降低速度预期。${fallbackHint}`.trim()
  }

  return `当前下载速度持续为 0；当前 peer 仍偏少或连接不稳定，建议先降低速度预期。${fallbackHint}`.trim()
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
    return buildMetadataPolicyMessage(nextTask)
  }

  if (nextTask.status === 'downloading' && isStalled) {
    return buildZeroSpeedPolicyMessage(nextTask)
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
