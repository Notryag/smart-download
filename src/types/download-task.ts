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
export const DOWNLOAD_TASK_GUIDANCE_CODES = [
  'magnet_metadata_sparse_peers',
  'magnet_zero_speed_sparse_peers'
] as const
export const DOWNLOAD_TASK_RESOURCE_HEALTH_LEVELS = ['healthy', 'degraded', 'critical'] as const
export const DOWNLOAD_TASK_BOTTLENECK_CODES = [
  'none',
  'peer_sparse',
  'metadata_stall',
  'zero_speed_stall',
  'tracker_sparse'
] as const
export const DOWNLOAD_TASK_PEER_AVAILABILITIES = ['none', 'scarce', 'limited', 'good'] as const
export const DOWNLOAD_TASK_TRACKER_HEALTH_STATES = ['none', 'sparse', 'normal'] as const
export const DOWNLOAD_TASK_METADATA_STATES = [
  'idle',
  'waiting_peers',
  'connecting_peers',
  'exchanging_metadata'
] as const

export interface CreateDownloadTaskInput {
  source: string
  savePath: string
  name?: string
}

export type DownloadTaskGuidanceCode = (typeof DOWNLOAD_TASK_GUIDANCE_CODES)[number]
export type GuidanceSeverity = 'info' | 'warning' | 'error'
export type DownloadTaskResourceHealthLevel = (typeof DOWNLOAD_TASK_RESOURCE_HEALTH_LEVELS)[number]
export type DownloadTaskBottleneckCode = (typeof DOWNLOAD_TASK_BOTTLENECK_CODES)[number]
export type DownloadTaskPeerAvailability = (typeof DOWNLOAD_TASK_PEER_AVAILABILITIES)[number]
export type DownloadTaskTrackerHealth = (typeof DOWNLOAD_TASK_TRACKER_HEALTH_STATES)[number]
export type DownloadTaskMetadataState = (typeof DOWNLOAD_TASK_METADATA_STATES)[number]

export interface DownloadTaskGuidance {
  code: DownloadTaskGuidanceCode
  severity: GuidanceSeverity
  shortMessage: string
  reason?: string
  bottleneck?: string
  nextStep?: string
}

export interface DownloadTaskFacts {
  sourceType: DownloadTaskType
  seedersCount?: number
  connectionsCount?: number
  trackerCount?: number
  fallbackTrackerCount?: number
  metadataSince?: string
  zeroSpeedSince?: string
  metadataElapsedMs?: number
  zeroSpeedDurationMs?: number
  resourceHealthScore?: number
  resourceHealthLevel?: DownloadTaskResourceHealthLevel
  bottleneckCode?: DownloadTaskBottleneckCode
  peerAvailability?: DownloadTaskPeerAvailability
  trackerHealth?: DownloadTaskTrackerHealth
  metadataState?: DownloadTaskMetadataState
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
  connectionsCount?: number
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
