import type {
  DownloadTask,
  DownloadTaskBottleneckCode,
  DiagnosticFactsSummary,
  DiagnosticGuidance,
  DiagnosticHighlight,
  DiagnosticLogEntry,
  DiagnosticSummary,
  DiagnosticTaskFact
} from '../../types'
import type { DownloadAdapter } from '../../adapters'
import type { LogEntry } from '../logger'
import {
  buildBottleneckCode,
  buildMetadataState,
  buildPeerAvailability,
  buildResourceHealthLevel,
  buildResourceHealthScore,
  buildTaskGuidance,
  buildTrackerHealth
} from '../task-manager/task-utils'

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
    connectionsCount: task.facts?.connectionsCount ?? task.connectionsCount,
    trackerCount: task.facts?.trackerCount ?? task.trackerCount,
    fallbackTrackerCount: task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount,
    metadataElapsedMs,
    zeroSpeedDurationMs,
    resourceHealthScore: task.facts?.resourceHealthScore ?? buildResourceHealthScore(task),
    resourceHealthLevel:
      task.facts?.resourceHealthLevel ??
      buildResourceHealthLevel(task.facts?.resourceHealthScore ?? buildResourceHealthScore(task)),
    bottleneckCode: task.facts?.bottleneckCode ?? buildBottleneckCode(task),
    peerAvailability:
      task.facts?.peerAvailability ?? buildPeerAvailability(task.facts?.seedersCount ?? task.seedersCount),
    trackerHealth:
      task.facts?.trackerHealth ?? buildTrackerHealth(task.facts?.trackerCount ?? task.trackerCount),
    metadataState: task.facts?.metadataState ?? buildMetadataState(task)
  }
}

function buildMetadataHighlightDetail(fact: DiagnosticTaskFact): string {
  const fallbackText =
    (fact.fallbackTrackerCount ?? 0) > 0 ? `已补充 ${fact.fallbackTrackerCount} 个 fallback tracker。` : ''
  const trackerAdvice =
    (fact.fallbackTrackerCount ?? 0) > 0 ? '建议继续观察或稍后再试。' : '建议补充 tracker 后继续观察。'

  if (fact.metadataState === 'exchanging_metadata') {
    return `已停留在 metadata ${Math.floor((fact.metadataElapsedMs ?? 0) / 1000)} 秒，当前已建立 ${fact.connectionsCount ?? 0} 个 peer 连接，但元数据交换仍未完成。${fallbackText}建议继续观察，若长时间无变化可稍后重试。`.trim()
  }

  if (fact.metadataState === 'connecting_peers') {
    return `已停留在 metadata ${Math.floor((fact.metadataElapsedMs ?? 0) / 1000)} 秒，当前已发现 ${fact.seedersCount ?? 0} 个 peer，但连接仍未稳定。${fallbackText}建议继续观察连接是否建立。`.trim()
  }

  if (fact.trackerHealth === 'none') {
    return `已停留在 metadata ${Math.floor((fact.metadataElapsedMs ?? 0) / 1000)} 秒，当前 tracker 信号较弱，仍未发现可用 peer。${fallbackText}${trackerAdvice}`.trim()
  }

  if (fact.trackerHealth === 'sparse') {
    return `已停留在 metadata ${Math.floor((fact.metadataElapsedMs ?? 0) / 1000)} 秒，当前 tracker 返回的 peer 仍偏少，metadata 仍在等待可连接节点。${fallbackText}${trackerAdvice}`.trim()
  }

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
  const signals = {
    metadataStallCount: taskFacts.filter(
      (fact) => fact.status === 'metadata' && (fact.metadataElapsedMs ?? 0) >= LONG_METADATA_THRESHOLD_MS
    ).length,
    zeroSpeedCount: taskFacts.filter(
      (fact) =>
        ['metadata', 'downloading'].includes(fact.status) &&
        (fact.zeroSpeedDurationMs ?? 0) >= ZERO_SPEED_THRESHOLD_MS
    ).length,
    peerSparseCount: taskFacts.filter((fact) => ['none', 'scarce'].includes(fact.peerAvailability ?? 'none'))
      .length,
    trackerSparseCount: taskFacts.filter((fact) => (fact.trackerCount ?? 0) <= 1).length
  }
  const score = taskFacts.length
    ? Math.min(...taskFacts.map((fact) => fact.resourceHealthScore ?? 100))
    : 100
  const level = score >= 80 ? 'healthy' : score >= 40 ? 'degraded' : 'critical'
  const dominantBottleneckCode = resolveDominantBottleneckCode(signals)
  const reason =
    level === 'healthy'
      ? '当前资源侧信号稳定，未发现明显的资源侧瓶颈。'
      : level === 'degraded'
        ? '当前资源侧信号开始走弱，建议继续观察 peer 与 tracker 变化。'
        : '当前资源侧信号偏弱，持续 0 速度或 peer 稀缺更可能是主要瓶颈。'

  return {
    slowTasks: taskFacts,
    bottlenecks: signals,
    resourceHealth: {
      score,
      level,
      reason,
      dominantBottleneckCode,
      signals
    }
  }
}

function resolveDominantBottleneckCode(
  signals: DiagnosticFactsSummary['bottlenecks']
): DownloadTaskBottleneckCode {
  if (signals.zeroSpeedCount > 0) {
    return 'zero_speed_stall'
  }

  if (signals.metadataStallCount > 0) {
    return 'metadata_stall'
  }

  if (signals.peerSparseCount > 0) {
    return 'peer_sparse'
  }

  if (signals.trackerSparseCount > 0) {
    return 'tracker_sparse'
  }

  return 'none'
}

function buildDiagnosticGuidance(tasks: DownloadTask[]): DiagnosticGuidance[] {
  const guidanceItems: DiagnosticGuidance[] = []

  for (const task of tasks) {
    const guidance = task.facts?.guidance ?? buildTaskGuidance(task)

    if (!guidance) {
      continue
    }

    const severity = task.status === 'failed' ? 'error' : guidance.severity

    guidanceItems.push({
      id: `guidance-${task.id}`,
      title: task.name,
      taskId: task.id,
      code: guidance.code,
      severity,
      shortMessage: guidance.shortMessage,
      reason: guidance.reason,
      bottleneck: guidance.bottleneck,
      nextStep: guidance.nextStep
    })
  }

  return guidanceItems.slice(0, 2)
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
      guidance: buildDiagnosticGuidance(tasks),
      recentLogs: logEntries.slice(0, 5).map(toDiagnosticLogEntry)
    }
  }
}
