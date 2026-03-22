import type { DownloadTaskSnapshot } from '../download'
import type { DownloadTaskStatus } from '../../types'
import type { Aria2TellStatusResult, RuntimeSession } from './types'

export const ARIA2_STATE_SETTLE_TIMEOUT_MS = 5_000
export const ARIA2_STATE_SETTLE_INTERVAL_MS = 150
export const ARIA2_DIAGNOSTIC_LOG_INTERVAL_MS = 30_000

export function toIsoNow(): string {
  return new Date().toISOString()
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function assertSource(source: string): void {
  if (source.trim().length === 0) {
    throw new Error('下载地址不能为空。')
  }
}

function parseBytes(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '0', 10)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function parseEtaSeconds(
  totalBytes: number,
  downloadedBytes: number,
  speedBytes: number
): number | undefined {
  if (speedBytes <= 0 || totalBytes <= 0) {
    return undefined
  }

  const remainingBytes = Math.max(totalBytes - downloadedBytes, 0)
  return Math.ceil(remainingBytes / speedBytes)
}

function mapAria2Status(source: string, status: string, totalBytes: number): DownloadTaskStatus {
  switch (status) {
    case 'active':
      return source.startsWith('magnet:?') && totalBytes === 0 ? 'metadata' : 'downloading'
    case 'waiting':
      return 'pending'
    case 'paused':
      return 'paused'
    case 'complete':
      return 'completed'
    case 'removed':
      return 'canceled'
    case 'error':
      return 'failed'
    default:
      return 'pending'
  }
}

export function toRuntimeStatusMessage(error: unknown): string {
  const message = getErrorMessage(error, 'aria2 RPC 不可用')

  if (message.includes('fetch failed')) {
    return '无法连接 aria2 RPC。请确认 aria2 已启动，并已启用 RPC。'
  }

  return `aria2 RPC 检查失败：${message}`
}

export function isSettledTaskStatus(status: DownloadTaskStatus): boolean {
  return ['paused', 'completed', 'failed', 'canceled'].includes(status)
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function buildSnapshot(
  session: RuntimeSession,
  result: Aria2TellStatusResult
): DownloadTaskSnapshot {
  const totalBytes = parseBytes(result.totalLength)
  const downloadedBytes = parseBytes(result.completedLength)
  const status = mapAria2Status(session.source, result.status, totalBytes)
  const speedBytes =
    status === 'downloading' || status === 'metadata' ? parseBytes(result.downloadSpeed) : 0
  const progress = totalBytes > 0 ? Math.min(downloadedBytes / totalBytes, 1) : 0

  return {
    taskId: session.taskId,
    remoteId: result.gid || session.gid,
    status,
    totalBytes,
    downloadedBytes,
    speedBytes,
    progress,
    etaSeconds: parseEtaSeconds(totalBytes, downloadedBytes, speedBytes),
    errorMessage: result.errorMessage,
    updatedAt: toIsoNow()
  }
}

export function buildSourcePreview(source: string): string {
  const normalized = source.trim()
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized
}
