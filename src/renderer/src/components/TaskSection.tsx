import type { DownloadTask } from '../../../types'
import {
  canPauseTask,
  canResumeTask,
  formatBytes,
  formatDate,
  formatEtaSeconds,
  formatProgress,
  formatStatus
} from '../utils/download-task'

export type TaskAction = 'pause' | 'resume' | 'delete'

interface TaskSectionProps {
  actionTaskId: string | null
  isLoadingTasks: boolean
  listErrorMessage: string
  selectedTaskId: string | null
  tasks: DownloadTask[]
  onSelectTask: (taskId: string) => void
  onTaskAction: (action: TaskAction, taskId: string) => Promise<void>
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
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  const activeTasks = tasks.filter((task) => ['pending', 'metadata', 'downloading'].includes(task.status))
  const failedTasks = tasks.filter((task) => task.status === 'failed')
  const pausedTasks = tasks.filter((task) => task.status === 'paused')

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
          <div className="task-list">
            {tasks.map((task) => (
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
                    <p>{task.remoteId ?? task.id}</p>
                  </div>
                  <span className={`status-badge status-${task.status}`}>
                    {formatStatus(task.status)}
                  </span>
                </div>

                <div className="task-progress-row">
                  <div className="task-progress-main">
                    <strong>{formatProgress(task.progress)}</strong>
                    <span>
                      {formatBytes(task.downloadedBytes)}
                      {typeof task.totalBytes === 'number' ? ` / ${formatBytes(task.totalBytes)}` : ''}
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
                    <dt>已下载</dt>
                    <dd>{formatBytes(task.downloadedBytes)}</dd>
                  </div>
                  <div>
                    <dt>ETA</dt>
                    <dd>{formatEtaSeconds(task.etaSeconds)}</dd>
                  </div>
                </dl>

                {task.errorMessage ? <p className="task-inline-error">{task.errorMessage}</p> : null}
              </article>
            ))}
          </div>

          <aside className="task-detail">
            <header className="task-detail-header">
              <span className="panel-kicker">Task detail</span>
              <h3>基础信息</h3>
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
