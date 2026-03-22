import { useEffect, useState } from 'react'

import type { DownloadTask } from '../../../types'
import {
  canPauseTask,
  canResumeTask,
  formatBytes,
  formatDate,
  formatEtaSeconds,
  formatProgress,
  formatStatus,
  matchesTaskWorkspaceFilter,
  sortTasksForWorkspace,
  type TaskWorkspaceFilter
} from '../utils/download-task'

export type TaskAction = 'pause' | 'resume' | 'delete'

const FILTER_ITEMS: Array<{
  id: TaskWorkspaceFilter
  label: string
  description: string
}> = [
  {
    id: 'all',
    label: '全部',
    description: '查看所有任务'
  },
  {
    id: 'active',
    label: '下载中',
    description: '待获取元数据和下载中的任务'
  },
  {
    id: 'paused',
    label: '已暂停',
    description: '等待继续或删除'
  },
  {
    id: 'completed',
    label: '已完成',
    description: '已完成的下载'
  },
  {
    id: 'failed',
    label: '失败',
    description: '优先处理失败原因'
  }
]

interface TaskFilterRailProps {
  filter: TaskWorkspaceFilter
  onFilterChange: (filter: TaskWorkspaceFilter) => void
  getFilterCount: (filter: TaskWorkspaceFilter) => number
}

interface TaskQueuePanelProps {
  currentFilter: TaskWorkspaceFilter
  filteredTasks: DownloadTask[]
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
}

interface TaskSectionProps {
  actionTaskId: string | null
  isLoadingTasks: boolean
  listErrorMessage: string
  selectedTaskId: string | null
  tasks: DownloadTask[]
  onSelectTask: (taskId: string) => void
  onTaskAction: (action: TaskAction, taskId: string) => Promise<void>
}

function TaskFilterRail({
  filter,
  onFilterChange,
  getFilterCount
}: TaskFilterRailProps): React.JSX.Element {
  return (
    <aside className="task-filter-rail">
      <header className="task-filter-rail-header">
        <span className="panel-kicker">Views</span>
        <h3>分类</h3>
      </header>

      <div className="task-filter-list">
        {FILTER_ITEMS.map((item) => (
          <button
            key={item.id}
            aria-label={`${item.label}（${getFilterCount(item.id)}）`}
            className={`task-filter-item${filter === item.id ? ' task-filter-item-active' : ''}`}
            title={item.description}
            type="button"
            onClick={() => onFilterChange(item.id)}
          >
            <span className="task-filter-icon" aria-hidden="true">
              <TaskFilterIcon filter={item.id} />
            </span>
            <strong>{getFilterCount(item.id)}</strong>
            <small>{item.label}</small>
          </button>
        ))}
      </div>
    </aside>
  )
}

function TaskQueuePanel({
  currentFilter,
  filteredTasks,
  selectedTaskId,
  onSelectTask
}: TaskQueuePanelProps): React.JSX.Element {
  return (
    <section className="task-list-panel">
      <header className="task-list-panel-header">
        <div>
          <span className="panel-kicker">Queue</span>
          <h3>{FILTER_ITEMS.find((item) => item.id === currentFilter)?.label ?? '全部任务'}</h3>
        </div>
        <div className="task-list-panel-meta">
          <span>{filteredTasks.length} 个结果</span>
          <span>最近更新优先</span>
        </div>
      </header>

      <div className="task-table">
        <div className="task-table-head" aria-hidden="true">
          <span>任务</span>
          <span>状态</span>
          <span>进度</span>
          <span>大小</span>
          <span>速度 / ETA</span>
          <span>更新时间</span>
        </div>

        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => (
            <article
              key={task.id}
              className={`task-table-row${task.id === selectedTaskId ? ' task-table-row-selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTask(task.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectTask(task.id)
                }
              }}
            >
              <div className="task-primary-cell">
                <strong>{task.name}</strong>
                <p>{task.savePath}</p>
                {task.errorMessage ? (
                  <span className={`task-inline-message task-inline-${getTaskMessageTone(task)}`}>
                    {task.errorMessage}
                  </span>
                ) : null}
              </div>

              <div className="task-status-cell">
                <span className={`status-badge status-${task.status}`}>{formatStatus(task.status)}</span>
              </div>

              <div className="task-progress-cell">
                <strong>{formatProgress(task.progress)}</strong>
                <div className="task-progress-bar">
                  <span style={{ width: `${task.progress * 100}%` }} />
                </div>
              </div>

              <div className="task-table-metric">
                <strong>
                  {typeof task.totalBytes === 'number' ? formatBytes(task.totalBytes) : '待确定'}
                </strong>
                <span>{formatBytes(task.downloadedBytes)} 已下载</span>
              </div>

              <div className="task-table-metric">
                <strong>{formatBytes(task.speedBytes)}/s</strong>
                <span>ETA {formatEtaSeconds(task.etaSeconds)}</span>
              </div>

              <div className="task-table-metric">
                <strong>{formatCompactDate(task.updatedAt)}</strong>
                <span>{formatDate(task.updatedAt)}</span>
              </div>
            </article>
          ))
        ) : (
          <div className="task-table-empty">
            <p className="empty-state">当前分类下还没有任务。</p>
          </div>
        )}
      </div>
    </section>
  )
}

export function TaskSection({
  actionTaskId,
  isLoadingTasks,
  listErrorMessage,
  selectedTaskId,
  tasks,
  onSelectTask,
  onTaskAction
}: TaskSectionProps): React.JSX.Element {
  const [filter, setFilter] = useState<TaskWorkspaceFilter>('all')
  const sortedTasks = sortTasksForWorkspace(tasks)
  const filteredTasks = sortedTasks.filter((task) => matchesTaskWorkspaceFilter(task, filter))
  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? null
  const activeTasks = tasks.filter((task) => ['pending', 'metadata', 'downloading'].includes(task.status))
  const failedTasks = tasks.filter((task) => task.status === 'failed')
  const pausedTasks = tasks.filter((task) => task.status === 'paused')

  useEffect(() => {
    if (filteredTasks.length === 0) {
      return
    }

    if (!selectedTaskId || !filteredTasks.some((task) => task.id === selectedTaskId)) {
      onSelectTask(filteredTasks[0].id)
    }
  }, [filteredTasks, onSelectTask, selectedTaskId])

  function getFilterCount(targetFilter: TaskWorkspaceFilter): number {
    if (targetFilter === 'all') {
      return tasks.length
    }

    if (targetFilter === 'active') {
      return activeTasks.length
    }

    if (targetFilter === 'paused') {
      return pausedTasks.length
    }

    if (targetFilter === 'completed') {
      return tasks.filter((task) => task.status === 'completed').length
    }

    return failedTasks.length
  }

  return (
    <section className="task-section panel">
      <header className="task-section-header">
        <div>
          <span className="panel-kicker">Workspace</span>
          <h2>下载工作区</h2>
        </div>
        <div className="task-toolbar">
          <span className="task-count">{tasks.length} 个任务</span>
          <div className="task-filter-summary">
            <span>{activeTasks.length} 进行中</span>
            <span>{failedTasks.length} 失败</span>
            <span>{pausedTasks.length} 已暂停</span>
          </div>
        </div>
      </header>

      {listErrorMessage ? <p className="feedback error">{listErrorMessage}</p> : null}

      {isLoadingTasks ? <div className="workspace-empty-state">正在加载任务列表...</div> : null}

      {!isLoadingTasks && tasks.length === 0 ? (
        <div className="workspace-empty-state">还没有任务。先粘贴一个 magnet 链接创建下载。</div>
      ) : null}

      {!isLoadingTasks && tasks.length > 0 ? (
        <div className="task-layout">
          <TaskFilterRail filter={filter} getFilterCount={getFilterCount} onFilterChange={setFilter} />

          <TaskQueuePanel
            currentFilter={filter}
            filteredTasks={filteredTasks}
            selectedTaskId={selectedTask?.id ?? null}
            onSelectTask={onSelectTask}
          />

          <aside className="task-detail">
            <header className="task-detail-header">
              <div>
                <span className="panel-kicker">Inspector</span>
                <h3>任务详情</h3>
              </div>
              {selectedTask ? (
                <span className={`status-badge status-${selectedTask.status}`}>
                  {formatStatus(selectedTask.status)}
                </span>
              ) : null}
            </header>

            {selectedTask ? (
              <>
                {selectedTask.errorMessage ? (
                  <p
                    className={`feedback ${getTaskMessageTone(selectedTask)} task-detail-alert`}
                  >
                    {selectedTask.errorMessage}
                  </p>
                ) : null}

                <div className="task-detail-hero">
                  <div>
                    <strong>{selectedTask.name}</strong>
                    <p>{selectedTask.remoteId ?? selectedTask.id}</p>
                  </div>
                  <div className="task-detail-progress">
                    <span>{formatProgress(selectedTask.progress)}</span>
                    <small>
                      {formatBytes(selectedTask.downloadedBytes)}
                      {typeof selectedTask.totalBytes === 'number'
                        ? ` / ${formatBytes(selectedTask.totalBytes)}`
                        : ' / 待确定'}
                    </small>
                  </div>
                </div>

                <div className="task-action-row">
                  <button
                    className="ghost-button"
                    disabled={!canPauseTask(selectedTask) || actionTaskId === selectedTask.id}
                    type="button"
                    onClick={() => void onTaskAction('pause', selectedTask.id)}
                  >
                    暂停
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!canResumeTask(selectedTask) || actionTaskId === selectedTask.id}
                    type="button"
                    onClick={() => void onTaskAction('resume', selectedTask.id)}
                  >
                    恢复
                  </button>
                  <button
                    className="ghost-button danger-button"
                    disabled={actionTaskId === selectedTask.id}
                    type="button"
                    onClick={() => void onTaskAction('delete', selectedTask.id)}
                  >
                    删除
                  </button>
                </div>

                <div className="task-detail-stats">
                  <article className="task-detail-stat">
                    <span>当前速度</span>
                    <strong>{formatBytes(selectedTask.speedBytes)}/s</strong>
                  </article>
                  <article className="task-detail-stat">
                    <span>预计剩余</span>
                    <strong>{formatEtaSeconds(selectedTask.etaSeconds)}</strong>
                  </article>
                  <article className="task-detail-stat">
                    <span>任务类型</span>
                    <strong>{selectedTask.type}</strong>
                  </article>
                </div>

                <dl className="task-detail-grid">
                  <div>
                    <dt>下载引擎</dt>
                    <dd>{selectedTask.engine}</dd>
                  </div>
                  <div>
                    <dt>保存目录</dt>
                    <dd className="break-all">{selectedTask.savePath}</dd>
                  </div>
                  <div>
                    <dt>数据来源</dt>
                    <dd className="break-all">{selectedTask.source}</dd>
                  </div>
                  <div>
                    <dt>创建时间</dt>
                    <dd>{formatDate(selectedTask.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>更新时间</dt>
                    <dd>{formatDate(selectedTask.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt>任务 ID</dt>
                    <dd className="break-all">{selectedTask.id}</dd>
                  </div>
                  <div className="task-detail-full-row">
                    <dt>错误状态</dt>
                    <dd>{selectedTask.errorMessage ?? '无'}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="empty-state">选择一个任务查看详情。</p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  )
}

function TaskFilterIcon({ filter }: { filter: TaskWorkspaceFilter }): React.JSX.Element {
  if (filter === 'all') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M5 7H19M5 12H19M5 17H19"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  }

  if (filter === 'active') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M5 15L10 10L13 13L19 7M19 7V12M19 7H14"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  }

  if (filter === 'paused') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M9 6V18M15 6V18"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  }

  if (filter === 'completed') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M5 12L10 17L19 8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 7V12M12 16H12.01M12 3C7.029 3 3 7.029 3 12S7.029 21 12 21S21 16.971 21 12S16.971 3 12 3Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function formatCompactDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit'
  })
}

function getTaskMessageTone(task: DownloadTask): 'error' | 'warning' {
  return task.status === 'paused' ? 'warning' : 'error'
}
