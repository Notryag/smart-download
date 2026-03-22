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
        <span className="panel-kicker">Categories</span>
        <h3>任务分类</h3>
      </header>

      <div className="task-filter-list">
        {FILTER_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`task-filter-item${filter === item.id ? ' task-filter-item-active' : ''}`}
            type="button"
            onClick={() => onFilterChange(item.id)}
          >
            <span className="task-filter-topline">
              <strong>{item.label}</strong>
              <span>{getFilterCount(item.id)}</span>
            </span>
            <small>{item.description}</small>
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
        <span className="panel-kicker">Queue</span>
        <h3>{FILTER_ITEMS.find((item) => item.id === currentFilter)?.label ?? '全部任务'}</h3>
      </header>

      <div className="task-list">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => (
            <article
              key={task.id}
              className={`task-card${task.id === selectedTaskId ? ' task-card-selected' : ''}`}
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
              <div className="task-card-header">
                <div>
                  <strong>{task.name}</strong>
                  <p>{task.savePath}</p>
                </div>
                <span className={`status-badge status-${task.status}`}>{formatStatus(task.status)}</span>
              </div>

              <div className="task-progress-row">
                <div className="task-progress-main">
                  <strong>{formatProgress(task.progress)}</strong>
                  <span>
                    {formatBytes(task.downloadedBytes)}
                    {typeof task.totalBytes === 'number'
                      ? ` / ${formatBytes(task.totalBytes)}`
                      : ' / 待确定'}
                  </span>
                </div>
                <div className="task-progress-bar">
                  <span style={{ width: `${task.progress * 100}%` }} />
                </div>
              </div>

              <dl className="task-meta-grid">
                <div>
                  <dt>速度</dt>
                  <dd>{formatBytes(task.speedBytes)}/s</dd>
                </div>
                <div>
                  <dt>大小</dt>
                  <dd>{typeof task.totalBytes === 'number' ? formatBytes(task.totalBytes) : '待确定'}</dd>
                </div>
                <div>
                  <dt>ETA</dt>
                  <dd>{formatEtaSeconds(task.etaSeconds)}</dd>
                </div>
              </dl>

              {task.errorMessage ? <p className="task-inline-error">{task.errorMessage}</p> : null}
            </article>
          ))
        ) : (
          <p className="empty-state">当前分类下还没有任务。</p>
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
  const completedTasks = tasks.filter((task) => task.status === 'completed')

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
      return completedTasks.length
    }

    return failedTasks.length
  }

  return (
    <section className="task-section panel">
      <header className="task-section-header">
        <div>
          <span className="panel-kicker">Task list</span>
          <h2>下载任务</h2>
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

      {isLoadingTasks ? <p className="empty-state">正在加载任务列表...</p> : null}

      {!isLoadingTasks && tasks.length === 0 ? (
        <p className="empty-state">还没有任务。先创建一个下载任务。</p>
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
              <span className="panel-kicker">Task detail</span>
              <h3>任务详情</h3>
            </header>

            {selectedTask ? (
              <>
                {selectedTask.errorMessage ? (
                  <p className="feedback error">{selectedTask.errorMessage}</p>
                ) : null}

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

                <div className="task-detail-title-row">
                  <div>
                    <strong>{selectedTask.name}</strong>
                    <p>{selectedTask.remoteId ?? selectedTask.id}</p>
                  </div>
                  <span className={`status-badge status-${selectedTask.status}`}>
                    {formatStatus(selectedTask.status)}
                  </span>
                </div>

                <dl className="task-detail-grid">
                  <div>
                    <dt>任务类型</dt>
                    <dd>{selectedTask.type}</dd>
                  </div>
                  <div>
                    <dt>下载引擎</dt>
                    <dd>{selectedTask.engine}</dd>
                  </div>
                  <div>
                    <dt>保存目录</dt>
                    <dd className="break-all">{selectedTask.savePath}</dd>
                  </div>
                  <div>
                    <dt>已下载 / 总大小</dt>
                    <dd>
                      {formatBytes(selectedTask.downloadedBytes)}
                      {typeof selectedTask.totalBytes === 'number'
                        ? ` / ${formatBytes(selectedTask.totalBytes)}`
                        : ' / 待确定'}
                    </dd>
                  </div>
                  <div>
                    <dt>当前速度 / ETA</dt>
                    <dd>
                      {formatBytes(selectedTask.speedBytes)}/s · {formatEtaSeconds(selectedTask.etaSeconds)}
                    </dd>
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
                  <div>
                    <dt>远端任务 ID</dt>
                    <dd className="break-all">{selectedTask.remoteId ?? '待分配'}</dd>
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
