export const DOWNLOAD_TASK_TYPES = ['uri', 'magnet'] as const

export type DownloadTaskType = (typeof DOWNLOAD_TASK_TYPES)[number]

export const DOWNLOAD_ENGINES = ['qbittorrent', 'aria2'] as const

export type DownloadEngine = (typeof DOWNLOAD_ENGINES)[number]

export const DOWNLOAD_TASK_STATUSES = [
  'pending',
  'metadata',
  'downloading',
  'paused',
  'completed',
  'failed',
  'canceled'
] as const

export type DownloadTaskStatus = (typeof DOWNLOAD_TASK_STATUSES)[number]

export const FINISHED_DOWNLOAD_TASK_STATUSES = ['completed', 'failed', 'canceled'] as const

export interface CreateDownloadTaskInput {
  source: string
  savePath: string
  name?: string
}

export interface DownloadTaskGuidance {
  reason: string
  bottleneck: string
  nextStep: string
}

export interface DownloadTaskFacts {
  sourceType: DownloadTaskType
  seedersCount?: number
  trackerCount?: number
  fallbackTrackerCount?: number
  metadataSince?: string
  zeroSpeedSince?: string
  metadataElapsedMs?: number
  zeroSpeedDurationMs?: number
  guidance?: DownloadTaskGuidance
}

export interface DownloadTask {
  id: string
  name: string
  type: DownloadTaskType
  source: string
  engine: DownloadEngine
  remoteId?: string
  status: DownloadTaskStatus
  savePath: string
  progress: number
  speedBytes: number
  downloadedBytes: number
  totalBytes?: number
  seedersCount?: number
  trackerCount?: number
  fallbackTrackerCount?: number
  metadataSince?: string
  zeroSpeedSince?: string
  facts?: DownloadTaskFacts
  etaSeconds?: number
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export function isFinishedDownloadTaskStatus(
  status: DownloadTaskStatus
): status is (typeof FINISHED_DOWNLOAD_TASK_STATUSES)[number] {
  return (FINISHED_DOWNLOAD_TASK_STATUSES as readonly DownloadTaskStatus[]).includes(status)
}
