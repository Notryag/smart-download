import { existsSync } from 'node:fs'
import { basename, join, parse } from 'node:path'
import type { DownloadTaskSnapshot } from '../download'
import type { DownloadTaskStatus } from '../../types'
import type { Aria2TellStatusResult, RuntimeSession } from './types'

export const ARIA2_STATE_SETTLE_TIMEOUT_MS = 5_000
export const ARIA2_STATE_SETTLE_INTERVAL_MS = 150
export const ARIA2_DIAGNOSTIC_LOG_INTERVAL_MS = 30_000
export const ARIA2_FALLBACK_TRACKERS = [
  'https://http1.torrust-tracker-demo.com:443/announce',
  'https://tracker.qingwapt.org:443/announce',
  'https://tracker.aburaya.live:443/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce'
] as const

export function toIsoNow(): string {
  return new Date().toISOString()
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function isMissingGidErrorMessage(message: string): boolean {
  return message.includes('Invalid GID') || /GID .+ is not found/.test(message)
}

export function assertSource(source: string): void {
  if (source.trim().length === 0) {
    throw new Error('下载地址不能为空。')
  }
}

export function normalizeMagnetSourceForAria2(source: string): {
  source: string
  trackerCount: number
  addedTrackerCount: number
} {
  const normalizedSource = source.trim()

  try {
    const magnet = new URL(normalizedSource)

    if (magnet.protocol !== 'magnet:') {
      return {
        source: normalizedSource,
        trackerCount: 0,
        addedTrackerCount: 0
      }
    }

    const existingTrackers = magnet.searchParams.getAll('tr').map((tracker) => tracker.trim())
    const mergedTrackers: string[] = []
    const seenTrackers = new Set<string>()

    for (const tracker of [...ARIA2_FALLBACK_TRACKERS, ...existingTrackers]) {
      const normalizedTracker = tracker.toLowerCase()

      if (!tracker || seenTrackers.has(normalizedTracker)) {
        continue
      }

      seenTrackers.add(normalizedTracker)
      mergedTrackers.push(tracker)
    }

    const nextSearchParams = new URLSearchParams()

    for (const [key, value] of magnet.searchParams.entries()) {
      if (key === 'tr') {
        continue
      }

      nextSearchParams.append(key, value)
    }

    for (const tracker of mergedTrackers) {
      nextSearchParams.append('tr', tracker)
    }

    magnet.search = nextSearchParams.toString()

    return {
      source: magnet.toString(),
      trackerCount: mergedTrackers.length,
      addedTrackerCount: mergedTrackers.filter((tracker) =>
        !existingTrackers.some((existingTracker) => existingTracker.toLowerCase() === tracker.toLowerCase())
      ).length
    }
  } catch {
    return {
      source: normalizedSource,
      trackerCount: 0,
      addedTrackerCount: 0
    }
  }
}

function parseBytes(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '0', 10)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function parseCount(value: string | undefined): number | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : undefined
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
    seedersCount: parseCount(result.numSeeders),
    connectionsCount: parseCount(result.connections),
    etaSeconds: parseEtaSeconds(totalBytes, downloadedBytes, speedBytes),
    errorMessage: translateAria2ErrorMessage(result.errorMessage),
    updatedAt: toIsoNow()
  }
}

export function buildAddUriOptions(source: string, savePath: string): Record<string, string> {
  const options: Record<string, string> = {
    dir: savePath.trim(),
    pause: 'true'
  }
  const renamedOutput = resolveRenamedOutputForSingleFileMagnet(source, savePath)

  if (renamedOutput) {
    options['index-out'] = `1=${renamedOutput}`
  }

  return options
}

export function buildSourcePreview(source: string): string {
  const normalized = source.trim()
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized
}

function translateAria2ErrorMessage(message?: string): string | undefined {
  if (!message) {
    return message
  }

  const fileConflictMatch = message.match(
    /^File (.+) exists, but a control file\(\*\.aria2\) does not exist\./
  )

  if (fileConflictMatch) {
    return `目标文件已存在：${fileConflictMatch[1]}。为避免覆盖现有文件，本次下载已取消。请删除原文件，或改用新的文件名后重试。`
  }

  const duplicateMatch = message.match(/^InfoHash ([a-f0-9]+) is already registered\./i)

  if (duplicateMatch) {
    return `该 magnet 任务已存在于 aria2 下载队列中：${duplicateMatch[1]}。请不要重复创建，或先删除旧任务后再试。`
  }

  return message
}

function resolveRenamedOutputForSingleFileMagnet(source: string, savePath: string): string | null {
  const displayName = getMagnetDisplayName(source)

  if (!displayName) {
    return null
  }

  if (!existsSync(join(savePath.trim(), displayName))) {
    return null
  }

  return findNextAvailableFileName(displayName, savePath.trim())
}

function getMagnetDisplayName(source: string): string | null {
  try {
    const displayName = new URL(source.trim()).searchParams.get('dn')?.trim()

    if (!displayName) {
      return null
    }

    const normalized = basename(displayName)
    return normalized.length > 0 ? normalized : null
  } catch {
    return null
  }
}

function findNextAvailableFileName(fileName: string, savePath: string): string {
  const parsed = parse(fileName)
  const baseName = parsed.name || fileName
  const extension = parsed.ext

  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${baseName} (${index})${extension}`

    if (!existsSync(join(savePath, candidate))) {
      return candidate
    }
  }

  return `${baseName} (${Date.now()})${extension}`
}
