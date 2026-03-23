import type {
  DownloadTask,
  DiagnosticHighlight,
  DiagnosticLogEntry,
  DiagnosticFactsSummary,
  DiagnosticSummary,
  DiagnosticTaskFact
} from '../../types'
import type { DownloadAdapter } from '../../adapters'
import type { LogEntry } from '../logger'

const LONG_METADATA_THRESHOLD_MS = 60_000
const ZERO_SPEED_THRESHOLD_MS = 60_000

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

function parseDurationMs(from: string | undefined, checkedAt: number): number | undefined {
  if (!from) {
    return undefined
  }

  const startedAt = Date.parse(from)

  if (Number.isNaN(startedAt)) {
    return undefined
  }

  return Math.max(checkedAt - startedAt, 0)
}

function buildTaskFact(task: DownloadTask, checkedAt: number): DiagnosticTaskFact {
  const metadataElapsedMs =
    task.facts?.metadataElapsedMs ?? parseDurationMs(task.facts?.metadataSince ?? task.metadataSince, checkedAt)
  const zeroSpeedDurationMs =
    task.facts?.zeroSpeedDurationMs ?? parseDurationMs(task.facts?.zeroSpeedSince ?? task.zeroSpeedSince, checkedAt)

  return {
    taskId: task.id,
    taskName: task.name,
    sourceType: task.facts?.sourceType ?? task.type,
    status: task.status,
    seedersCount: task.facts?.seedersCount ?? task.seedersCount,
    trackerCount: task.facts?.trackerCount ?? task.trackerCount,
    fallbackTrackerCount: task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount,
    metadataElapsedMs,
    zeroSpeedDurationMs
  }
}

function buildMetadataHighlightDetail(fact: DiagnosticTaskFact): string {
  const fallbackText =
    (fact.fallbackTrackerCount ?? 0) > 0 ? `已补充 ${fact.fallbackTrackerCount} 个 fallback tracker。` : ''
  const trackerAdvice =
    (fact.fallbackTrackerCount ?? 0) > 0 ? '建议继续观察或稍后再试。' : '建议补充 tracker 后继续观察。'

  if ((fact.seedersCount ?? 0) <= 0) {
    return `已停留在 metadata ${Math.floor((fact.metadataElapsedMs ?? 0) / 1000)} 秒，当前仍未发现可用 peer，资源热度较低，建议降低速度预期。${fallbackText}${trackerAdvice}`.trim()
  }

  if (fact.seedersCount === 1) {
    return `已停留在 metadata ${Math.floor((fact.metadataElapsedMs ?? 0) / 1000)} 秒，当前仅发现 1 个可用 peer，资源较冷，建议降低速度预期。${fallbackText}${trackerAdvice}`.trim()
  }

  return `已停留在 metadata ${Math.floor((fact.metadataElapsedMs ?? 0) / 1000)} 秒，当前 peer 仍偏少，建议先降低速度预期。${fallbackText}${trackerAdvice}`.trim()
}

function buildZeroSpeedHighlightDetail(fact: DiagnosticTaskFact): string {
  const fallbackText =
    (fact.fallbackTrackerCount ?? 0) > 0 ? `已补充 ${fact.fallbackTrackerCount} 个 fallback tracker。` : ''
  const followUpAdvice =
    (fact.fallbackTrackerCount ?? 0) > 0 ? '建议继续观察或稍后重试。' : '建议补充 tracker 后继续观察。'

  if ((fact.seedersCount ?? 0) <= 0) {
    return `当前已连续 ${Math.floor((fact.zeroSpeedDurationMs ?? 0) / 1000)} 秒无下载速度，仍未发现稳定 peer，更可能是资源侧瓶颈，建议降低速度预期。${fallbackText}${followUpAdvice}`.trim()
  }

  if (fact.seedersCount === 1) {
    return `当前已连续 ${Math.floor((fact.zeroSpeedDurationMs ?? 0) / 1000)} 秒无下载速度，仅有 1 个可用 peer，更可能是资源侧瓶颈，建议降低速度预期。${fallbackText}${followUpAdvice}`.trim()
  }

  return `当前已连续 ${Math.floor((fact.zeroSpeedDurationMs ?? 0) / 1000)} 秒无下载速度，peer 仍偏少或连接不稳定，建议先降低速度预期。${fallbackText}${followUpAdvice}`.trim()
}

function buildActiveTaskHighlights(taskFacts: DiagnosticTaskFact[]): DiagnosticHighlight[] {
  const highlights: DiagnosticHighlight[] = []

  for (const fact of taskFacts) {
    if (
      fact.status === 'metadata' &&
      typeof fact.metadataElapsedMs === 'number' &&
      fact.metadataElapsedMs >= LONG_METADATA_THRESHOLD_MS
    ) {
      highlights.push({
        id: `metadata-${fact.taskId}`,
        severity: 'warning',
        title: `元数据获取偏慢：${fact.taskName}`,
        detail: buildMetadataHighlightDetail(fact)
      })
    }

    if (
      ['metadata', 'downloading'].includes(fact.status) &&
      typeof fact.zeroSpeedDurationMs === 'number' &&
      fact.zeroSpeedDurationMs >= ZERO_SPEED_THRESHOLD_MS
    ) {
      highlights.push({
        id: `zero-speed-${fact.taskId}`,
        severity: 'warning',
        title: `任务持续无速度：${fact.taskName}`,
        detail: buildZeroSpeedHighlightDetail(fact)
      })
    }
  }

  return highlights
}

function buildDiagnosticFacts(taskFacts: DiagnosticTaskFact[]): DiagnosticFactsSummary {
  return {
    slowTasks: taskFacts,
    bottlenecks: {
      metadataStallCount: taskFacts.filter(
        (fact) => fact.status === 'metadata' && (fact.metadataElapsedMs ?? 0) >= LONG_METADATA_THRESHOLD_MS
      ).length,
      zeroSpeedCount: taskFacts.filter(
        (fact) =>
          ['metadata', 'downloading'].includes(fact.status) &&
          (fact.zeroSpeedDurationMs ?? 0) >= ZERO_SPEED_THRESHOLD_MS
      ).length,
      trackerSparseCount: taskFacts.filter((fact) => (fact.trackerCount ?? 0) <= 1).length
    }
  }
}

export class BasicDiagnosticsService {
  constructor(private readonly downloadAdapter: DownloadAdapter) {}

  async getSummary(tasks: DownloadTask[], logEntries: LogEntry[]): Promise<DiagnosticSummary> {
    const checkedAt = Date.now()
    const runtime = await this.downloadAdapter.getRuntimeStatus()
    const failedTasks = tasks.filter((task) => task.status === 'failed')
    const pausedTasks = tasks.filter((task) => task.status === 'paused')
    const taskFacts = tasks
      .filter((task) => task.type === 'magnet' && ['metadata', 'downloading', 'paused'].includes(task.status))
      .map((task) => buildTaskFact(task, checkedAt))
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
      ...buildActiveTaskHighlights(taskFacts).slice(0, 2),
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
      checkedAt: new Date(checkedAt).toISOString(),
      overview: buildOverview(taskStats, runtime.ready),
      runtime,
      taskStats,
      highlights,
      taskFacts,
      facts: buildDiagnosticFacts(taskFacts),
      recentLogs: logEntries.slice(0, 5).map(toDiagnosticLogEntry)
    }
  }
}
