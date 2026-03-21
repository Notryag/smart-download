export type DiagnosticSeverity = 'info' | 'warning' | 'error'

export interface DiagnosticHighlight {
  id: string
  severity: DiagnosticSeverity
  title: string
  detail: string
}

export interface DiagnosticLogEntry {
  id: string
  level: 'info' | 'error'
  message: string
  taskId?: string
  createdAt: string
}

export interface DiagnosticSummary {
  checkedAt: string
  overview: string
  network: {
    ready: boolean
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
  recentLogs: DiagnosticLogEntry[]
}
