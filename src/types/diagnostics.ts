import type {
  DownloadTaskBottleneckCode,
  DownloadTaskGuidanceCode,
  DownloadTaskPeerAvailability,
  DownloadTaskResourceHealthLevel,
  DownloadTaskStatus,
  DownloadTaskTrackerHealth,
  DownloadTaskType,
  GuidanceSeverity
} from './download-task'

export type DiagnosticSeverity = GuidanceSeverity
export type DiagnosticResourceHealthLevel = DownloadTaskResourceHealthLevel

export interface DiagnosticHighlight {
  id: string
  severity: DiagnosticSeverity
  title: string
  detail: string
}

export interface DiagnosticLogEntry {
  id: string
  category: string
  level: 'info' | 'warning' | 'error'
  details?: Record<string, string | number | boolean | null>
  message: string
  taskId?: string
  createdAt: string
}

export interface DiagnosticTaskFact {
  taskId: string
  taskName: string
  sourceType: DownloadTaskType
  status: DownloadTaskStatus
  seedersCount?: number
  trackerCount?: number
  fallbackTrackerCount?: number
  metadataElapsedMs?: number
  zeroSpeedDurationMs?: number
  resourceHealthScore?: number
  resourceHealthLevel?: DownloadTaskResourceHealthLevel
  bottleneckCode?: DownloadTaskBottleneckCode
  peerAvailability?: DownloadTaskPeerAvailability
  trackerHealth?: DownloadTaskTrackerHealth
}

export interface DiagnosticGuidance {
  id: string
  title: string
  taskId?: string
  code: DownloadTaskGuidanceCode
  severity: DiagnosticSeverity
  shortMessage: string
  reason?: string
  bottleneck?: string
  nextStep?: string
}

export interface DiagnosticFactsSummary {
  slowTasks: DiagnosticTaskFact[]
  bottlenecks: {
    metadataStallCount: number
    zeroSpeedCount: number
    peerSparseCount: number
    trackerSparseCount: number
  }
  resourceHealth: {
    score: number
    level: DiagnosticResourceHealthLevel
    reason: string
    dominantBottleneckCode: DownloadTaskBottleneckCode
    signals: {
      metadataStallCount: number
      zeroSpeedCount: number
      peerSparseCount: number
      trackerSparseCount: number
    }
  }
}

export interface DiagnosticSummary {
  checkedAt: string
  overview: string
  runtime: {
    ready: boolean
    client: string
    message: string
  }
  taskStats: {
    total: number
    active: number
    paused: number
    failed: number
    completed: number
  }
  highlights: DiagnosticHighlight[]
  taskFacts: DiagnosticTaskFact[]
  facts: DiagnosticFactsSummary
  guidance: DiagnosticGuidance[]
  recentLogs: DiagnosticLogEntry[]
}
