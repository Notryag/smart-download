import type { DownloadTaskStatus, DownloadTaskType } from './download-task'

export type DiagnosticSeverity = 'info' | 'warning' | 'error'

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
}

export interface DiagnosticFactsSummary {
  slowTasks: DiagnosticTaskFact[]
  bottlenecks: {
    metadataStallCount: number
    zeroSpeedCount: number
    trackerSparseCount: number
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
  recentLogs: DiagnosticLogEntry[]
}
