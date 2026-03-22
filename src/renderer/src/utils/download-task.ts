import type { DownloadTask } from '../../../types'

export const TASK_WORKSPACE_FILTERS = [
  'all',
  'active',
  'paused',
  'completed',
  'failed'
] as const

export type TaskWorkspaceFilter = (typeof TASK_WORKSPACE_FILTERS)[number]

export function isSupportedSource(value: string): boolean {
  return value.trim().startsWith('magnet:?')
}

export function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log10(value) / 3), units.length - 1)
  const normalized = value / 1000 ** unitIndex

  return `${normalized.toFixed(normalized >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

export function formatProgress(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatEtaSeconds(value?: number): string {
  if (typeof value !== 'number' || value < 0) {
    return '--'
  }

  if (value < 60) {
    return `${value}s`
  }

  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

export function formatSeedersCount(value?: number): string {
  if (typeof value !== 'number' || value < 0) {
    return '--'
  }

  return String(value)
}

export function formatStatus(status: DownloadTask['status']): string {
  switch (status) {
    case 'metadata':
      return '获取元数据中'
    case 'downloading':
      return '下载中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'canceled':
      return '已取消'
    case 'pending':
    default:
      return '等待中'
  }
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false
  })
}

export function formatCompactDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit'
  })
}

export function formatLogLevel(level: 'info' | 'warning' | 'error'): string {
  if (level === 'error') {
    return '错误'
  }

  if (level === 'warning') {
    return '警告'
  }

  return '信息'
}

export function canPauseTask(task: DownloadTask): boolean {
  return !['paused', 'completed', 'failed', 'canceled'].includes(task.status)
}

export function canResumeTask(task: DownloadTask): boolean {
  return task.status === 'paused'
}

export function getTaskMessageTone(task: DownloadTask): 'error' | 'warning' {
  return task.status === 'paused' ? 'warning' : 'error'
}

export function matchesTaskWorkspaceFilter(
  task: DownloadTask,
  filter: TaskWorkspaceFilter
): boolean {
  if (filter === 'all') {
    return true
  }

  if (filter === 'active') {
    return ['pending', 'metadata', 'downloading'].includes(task.status)
  }

  if (filter === 'paused') {
    return task.status === 'paused'
  }

  if (filter === 'completed') {
    return task.status === 'completed'
  }

  return task.status === 'failed'
}

export function sortTasksForWorkspace(tasks: DownloadTask[]): DownloadTask[] {
  return [...tasks].sort((left, right) => {
    const priorityDiff = getWorkspaceTaskPriority(left) - getWorkspaceTaskPriority(right)

    if (priorityDiff !== 0) {
      return priorityDiff
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })
}

function getWorkspaceTaskPriority(task: DownloadTask): number {
  if (['pending', 'metadata', 'downloading'].includes(task.status)) {
    return 0
  }

  if (task.status === 'failed') {
    return 1
  }

  if (task.status === 'paused') {
    return 2
  }

  if (task.status === 'completed') {
    return 3
  }

  return 4
}
