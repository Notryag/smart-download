import type { DownloadTask } from '../../../types'

export function isSupportedSource(value: string): boolean {
  return value.trim().startsWith('magnet:?')
}

export function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const normalized = value / 1024 ** unitIndex

  return `${normalized.toFixed(normalized >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

export function formatProgress(value: number): string {
  return `${Math.round(value * 100)}%`
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

export function formatLogLevel(level: 'info' | 'error'): string {
  return level === 'error' ? '错误' : '信息'
}

export function canPauseTask(task: DownloadTask): boolean {
  return !['paused', 'completed', 'failed', 'canceled'].includes(task.status)
}

export function canResumeTask(task: DownloadTask): boolean {
  return task.status === 'paused'
}
