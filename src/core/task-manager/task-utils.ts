import type { DownloadTaskSnapshot } from '../../adapters'
import {
  isFinishedDownloadTaskStatus,
  type CreateDownloadTaskInput,
  type DownloadTask,
  type DownloadTaskFacts,
  type DownloadTaskGuidance
} from '../../types'

const RESTART_RECOVERY_MESSAGE = '应用重启后下载已停止，请手动恢复任务'
const LONG_METADATA_THRESHOLD_MS = 60_000
const ZERO_SPEED_THRESHOLD_MS = 60_000

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

function hasFactPatch<Key extends keyof DownloadTaskFacts>(
  patch: Partial<DownloadTaskFacts>,
  key: Key
): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key)
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
    hasFactPatch(patch, 'metadataSince')
      ? patch.metadataSince
      : previousFacts?.metadataSince ?? task.metadataSince
  const zeroSpeedSince =
    hasFactPatch(patch, 'zeroSpeedSince')
      ? patch.zeroSpeedSince
      : previousFacts?.zeroSpeedSince ?? task.zeroSpeedSince

  return {
    sourceType: 'magnet',
    seedersCount: hasFactPatch(patch, 'seedersCount')
      ? patch.seedersCount
      : previousFacts?.seedersCount ?? task.seedersCount,
    trackerCount: hasFactPatch(patch, 'trackerCount')
      ? patch.trackerCount
      : previousFacts?.trackerCount ?? task.trackerCount,
    fallbackTrackerCount: hasFactPatch(patch, 'fallbackTrackerCount')
      ? patch.fallbackTrackerCount
      : previousFacts?.fallbackTrackerCount ?? task.fallbackTrackerCount,
    metadataSince,
    zeroSpeedSince,
    metadataElapsedMs: parseDurationMs(metadataSince, updatedAt),
    zeroSpeedDurationMs: parseDurationMs(zeroSpeedSince, updatedAt),
    resourceHealthScore: hasFactPatch(patch, 'resourceHealthScore')
      ? patch.resourceHealthScore
      : undefined,
    guidance: hasFactPatch(patch, 'guidance') ? patch.guidance : previousFacts?.guidance
  }
}

function clampResourceHealthScore(score: number): number {
  return Math.max(0, Math.min(100, score))
}

export function buildResourceHealthScore(task: DownloadTask): number | undefined {
  if (task.type !== 'magnet') {
    return undefined
  }

  if (typeof task.facts?.resourceHealthScore === 'number') {
    return task.facts.resourceHealthScore
  }

  let score = 100
  const metadataElapsedMs = task.facts?.metadataElapsedMs
  const zeroSpeedDurationMs = task.facts?.zeroSpeedDurationMs
  const seedersCount = task.facts?.seedersCount ?? task.seedersCount
  const trackerCount = task.facts?.trackerCount ?? task.trackerCount
  const fallbackTrackerCount = task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount
  const normalizedSeedersCount = seedersCount ?? 0
  const normalizedTrackerCount = trackerCount ?? 0
  const normalizedFallbackTrackerCount = fallbackTrackerCount ?? 0

  if (task.status === 'metadata' && (metadataElapsedMs ?? 0) >= LONG_METADATA_THRESHOLD_MS) {
    score -= 45
  }

  if (task.status === 'downloading' && (zeroSpeedDurationMs ?? 0) >= ZERO_SPEED_THRESHOLD_MS) {
    score -= 50
  }

  if (normalizedSeedersCount <= 0) {
    score -= 25
  } else if (normalizedSeedersCount === 1) {
    score -= 20
  } else if (normalizedSeedersCount <= 3) {
    score -= 10
  }

  if (normalizedTrackerCount <= 1) {
    score -= 10
  }

  if (normalizedFallbackTrackerCount > 0 && score < 100) {
    score += 5
  }

  return clampResourceHealthScore(score)
}

function buildFallbackTrackerHint(fallbackTrackerCount: number | undefined): string {
  if (!fallbackTrackerCount || fallbackTrackerCount <= 0) {
    return ''
  }

  return ` 已补充 ${fallbackTrackerCount} 个 fallback tracker。`
}

function buildMetadataGuidance(task: DownloadTask): DownloadTaskGuidance {
  const seedersCount = task.facts?.seedersCount ?? task.seedersCount
  const fallbackHint = buildFallbackTrackerHint(task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount)
  const shortMessage =
    (seedersCount ?? 0) <= 1
      ? `资源较冷，metadata 获取偏慢，当前 peer 不足。${fallbackHint}`.trim()
      : `metadata 获取偏慢，当前 peer 仍偏少。${fallbackHint}`.trim()

  if ((seedersCount ?? 0) <= 0) {
    return {
      code: 'magnet_metadata_sparse_peers',
      severity: 'warning',
      shortMessage,
      reason: `当前仍未发现可用 peer，资源热度较低。${fallbackHint}`.trim(),
      bottleneck: '瓶颈更偏向资源侧，tracker 与 DHT 仍未返回稳定 peer。',
      nextStep: '建议降低速度预期，并稍后再试或继续观察。'
    }
  }

  if (seedersCount === 1) {
    return {
      code: 'magnet_metadata_sparse_peers',
      severity: 'warning',
      shortMessage,
      reason: `当前仅发现 1 个可用 peer，资源较冷。${fallbackHint}`.trim(),
      bottleneck: '瓶颈更偏向资源侧，peer 数过少导致元数据交换不稳定。',
      nextStep: '建议降低速度预期，并继续观察是否能连到更多 peer。'
    }
  }

  return {
    code: 'magnet_metadata_sparse_peers',
    severity: 'warning',
    shortMessage,
    reason: `当前 peer 仍偏少，tracker 暂未返回更稳定的节点。${fallbackHint}`.trim(),
    bottleneck: '瓶颈在资源侧可用 peer 不足，元数据阶段会继续拉长。',
    nextStep: '建议先降低速度预期，继续观察 peer 是否回升。'
  }
}

function buildZeroSpeedGuidance(task: DownloadTask): DownloadTaskGuidance {
  const seedersCount = task.facts?.seedersCount ?? task.seedersCount
  const fallbackHint = buildFallbackTrackerHint(task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount)
  const shortMessage =
    (seedersCount ?? 0) <= 1
      ? `下载持续无速度，当前可用 peer 不足。${fallbackHint}`.trim()
      : `下载持续无速度，当前 peer 偏少或连接不稳定。${fallbackHint}`.trim()

  if ((seedersCount ?? 0) <= 0) {
    return {
      code: 'magnet_zero_speed_sparse_peers',
      severity: 'warning',
      shortMessage,
      reason: `已补 fallback tracker 后仍未发现稳定 peer，当前下载速度持续为 0。${fallbackHint}`.trim(),
      bottleneck: '瓶颈更偏向资源侧，可用 peer 仍不足以维持实际传输。',
      nextStep: '建议降低速度预期，稍后重试或继续观察资源热度变化。'
    }
  }

  if (seedersCount === 1) {
    return {
      code: 'magnet_zero_speed_sparse_peers',
      severity: 'warning',
      shortMessage,
      reason: `当前仅有 1 个可用 peer，下载速度持续为 0。${fallbackHint}`.trim(),
      bottleneck: '瓶颈更偏向资源侧，单个 peer 无法提供稳定吞吐。',
      nextStep: '建议降低速度预期，并继续观察是否能连到更多 peer。'
    }
  }

  return {
    code: 'magnet_zero_speed_sparse_peers',
    severity: 'warning',
    shortMessage,
    reason: `当前 peer 仍偏少或连接不稳定，下载速度持续为 0。${fallbackHint}`.trim(),
    bottleneck: '瓶颈更偏向资源侧连接质量，而不是本地下载引擎。',
    nextStep: '建议先降低速度预期，继续观察是否恢复有效吞吐。'
  }
}

export function buildTaskGuidance(task: DownloadTask): DownloadTaskGuidance | undefined {
  const isMetadataStalled = task.status === 'metadata' && task.speedBytes === 0
  const isZeroSpeedStalled = task.status === 'downloading' && task.speedBytes === 0

  if (isMetadataStalled) {
    return buildMetadataGuidance(task)
  }

  if (isZeroSpeedStalled) {
    return buildZeroSpeedGuidance(task)
  }

  return undefined
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

  const nextTask = updateTask(task, {
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

  const guidance = buildTaskGuidance(nextTask)
  const resourceHealthScore = buildResourceHealthScore(nextTask)

  return updateTask(nextTask, {
    facts:
      nextTask.type === 'magnet'
        ? buildMagnetFacts(
            nextTask,
            {
              resourceHealthScore,
              guidance
            },
            nextTask.updatedAt
          )
        : nextTask.facts
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
    const guidance = buildTaskGuidance(nextTask)
    return guidance ? `正在获取种子元数据；${guidance.shortMessage}` : undefined
  }

  if (nextTask.status === 'downloading' && isStalled) {
    const guidance = buildTaskGuidance(nextTask)
    return guidance ? guidance.shortMessage : undefined
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
          zeroSpeedSince: undefined,
          guidance: undefined
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
          zeroSpeedSince: undefined,
          guidance: undefined
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
          zeroSpeedSince: undefined,
          guidance: undefined
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
