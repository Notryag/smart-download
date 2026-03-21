import type { DownloadTask, DiagnosticLogEntry, DiagnosticSummary } from '../../types'
import type { DownloadAdapter } from '../../adapters'
import type { LogEntry } from '../logger'

function buildOverview(summary: DiagnosticSummary['taskStats'], runtimeReady: boolean): string {
  if (!runtimeReady) {
    return `下载引擎检查失败，当前共有 ${summary.total} 个任务需要关注。`
  }

  if (summary.failed > 0) {
    return `当前共有 ${summary.failed} 个失败任务，建议优先处理。`
  }

  if (summary.active > 0) {
    return `当前有 ${summary.active} 个任务正在运行。`
  }

  if (summary.paused > 0) {
    return `当前有 ${summary.paused} 个任务处于暂停状态。`
  }

  if (summary.completed > 0) {
    return `最近累计完成 ${summary.completed} 个任务。`
  }

  return '当前还没有下载任务。'
}

function toDiagnosticLogEntry(entry: LogEntry): DiagnosticLogEntry {
  return {
    id: entry.id,
    category: entry.category,
    details: entry.details,
    level: entry.level,
    message: entry.message,
    taskId: entry.taskId,
    createdAt: entry.createdAt
  }
}

export class BasicDiagnosticsService {
  constructor(private readonly downloadAdapter: DownloadAdapter) {}

  async getSummary(tasks: DownloadTask[], logEntries: LogEntry[]): Promise<DiagnosticSummary> {
    const runtime = await this.downloadAdapter.getRuntimeStatus()
    const failedTasks = tasks.filter((task) => task.status === 'failed')
    const pausedTasks = tasks.filter((task) => task.status === 'paused')
    const taskStats = {
      total: tasks.length,
      active: tasks.filter((task) => ['pending', 'metadata', 'downloading'].includes(task.status))
        .length,
      paused: pausedTasks.length,
      failed: failedTasks.length,
      completed: tasks.filter((task) => task.status === 'completed').length
    }

    const highlights = [
      ...(!runtime.ready
        ? [
            {
              id: 'runtime',
              severity: 'error' as const,
              title: 'aria2 不可用',
              detail: runtime.message
            }
          ]
        : []),
      ...failedTasks.slice(0, 2).map((task) => ({
        id: `failed-${task.id}`,
        severity: 'error' as const,
        title: `任务失败：${task.name}`,
        detail: task.errorMessage ?? '任务失败，但没有记录更详细的错误信息。'
      })),
      ...pausedTasks
        .filter((task) => Boolean(task.errorMessage))
        .slice(0, 2)
        .map((task) => ({
          id: `paused-${task.id}`,
          severity: 'warning' as const,
          title: `任务暂停：${task.name}`,
          detail: task.errorMessage as string
        }))
    ]

    return {
      checkedAt: new Date().toISOString(),
      overview: buildOverview(taskStats, runtime.ready),
      runtime,
      taskStats,
      highlights,
      recentLogs: logEntries.slice(0, 5).map(toDiagnosticLogEntry)
    }
  }
}
