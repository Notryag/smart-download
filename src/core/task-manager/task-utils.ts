import type { DownloadTaskSnapshot } from '../../adapters'
import {
  isFinishedDownloadTaskStatus,
  type CreateDownloadTaskInput,
  type DownloadTask
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

export function applySnapshot(task: DownloadTask, snapshot: DownloadTaskSnapshot): DownloadTask {
  return updateTask(task, {
    remoteId: snapshot.remoteId ?? task.remoteId,
    status: snapshot.status,
    progress: snapshot.progress,
    downloadedBytes: snapshot.downloadedBytes,
    totalBytes: snapshot.totalBytes,
    speedBytes: snapshot.speedBytes,
    etaSeconds: snapshot.etaSeconds,
    errorMessage: snapshot.errorMessage
  })
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
      etaSeconds: undefined,
      errorMessage: RESTART_RECOVERY_MESSAGE
    })
  }

  if (task.status === 'paused') {
    return updateTask(task, {
      speedBytes: 0,
      etaSeconds: undefined
    })
  }

  if (isFinishedDownloadTaskStatus(task.status)) {
    return updateTask(task, {
      speedBytes: 0,
      etaSeconds: undefined
    })
  }

  return task
}

export function buildSourcePreview(source: string): string {
  const normalized = source.trim()
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized
}
