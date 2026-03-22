import type { DiagnosticSummary, DownloadTask } from '../../../types'
import { canPauseTask, canResumeTask } from '../utils/download-task'

interface AppHeaderProps {
  actionTaskId: string | null
  diagnostics: DiagnosticSummary | null
  selectedTask: DownloadTask | null
  successMessage: string
  onCreateTask: () => void
  onTaskAction: (action: 'pause' | 'resume' | 'delete', taskId: string) => Promise<void>
}

export function AppHeader({
  actionTaskId,
  diagnostics,
  selectedTask,
  successMessage,
  onCreateTask,
  onTaskAction
}: AppHeaderProps): React.JSX.Element {
  const runtimeLabel =
    diagnostics === null
      ? '引擎检查中'
      : diagnostics.runtime.ready
        ? 'aria2 已连接'
        : 'aria2 需要处理'
  const isTaskBusy = selectedTask !== null && actionTaskId === selectedTask.id

  return (
    <header className="app-header">
      <div className="app-brandbar">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            <BrandIcon />
          </span>
          <div className="app-brand-copy">
            <strong>TORRENT DOWNLOADER</strong>
            <span className="app-brand-tag">FREE</span>
          </div>
        </div>
        <div className="app-runtime-pill">
          <span
            className={`status-indicator${diagnostics?.runtime.ready ? ' status-indicator-ready' : ''}`}
          />
          <div>
            <strong>{runtimeLabel}</strong>
            <p>{diagnostics?.runtime.message ?? '正在读取 aria2 运行状态。'}</p>
          </div>
        </div>
      </div>

      <div className="command-bar panel">
        <button className="command-button command-button-primary" type="button" onClick={onCreateTask}>
          <LinkIcon />
          <span>新建任务</span>
        </button>
        <button
          className="command-button"
          disabled={!selectedTask || !canPauseTask(selectedTask) || isTaskBusy}
          type="button"
          onClick={() => selectedTask && void onTaskAction('pause', selectedTask.id)}
        >
          <PauseIcon />
          <span>暂停</span>
        </button>
        <button
          className="command-button"
          disabled={!selectedTask || !canResumeTask(selectedTask) || isTaskBusy}
          type="button"
          onClick={() => selectedTask && void onTaskAction('resume', selectedTask.id)}
        >
          <ResumeIcon />
          <span>恢复</span>
        </button>
        <button
          className="command-button command-button-danger"
          disabled={!selectedTask || isTaskBusy}
          type="button"
          onClick={() => selectedTask && void onTaskAction('delete', selectedTask.id)}
        >
          <DeleteIcon />
          <span>删除</span>
        </button>
      </div>

      <div className="app-stats-strip panel">
        <article className="app-stat-item">
          <span className="status-label">进行中</span>
          <div className="app-stat-value-row">
            <strong>{diagnostics?.taskStats.active ?? 0}</strong>
            <small>metadata / downloading</small>
          </div>
        </article>
        <article className="app-stat-item app-stat-item-attention">
          <span className="status-label">失败任务</span>
          <div className="app-stat-value-row">
            <strong>{diagnostics?.taskStats.failed ?? 0}</strong>
            <small>优先处理原因</small>
          </div>
        </article>
        <article className="app-stat-item">
          <span className="status-label">已暂停</span>
          <div className="app-stat-value-row">
            <strong>{diagnostics?.taskStats.paused ?? 0}</strong>
            <small>等待继续或删除</small>
          </div>
        </article>
        <article className="app-stat-item">
          <span className="status-label">总任务</span>
          <div className="app-stat-value-row">
            <strong>{diagnostics?.taskStats.total ?? 0}</strong>
            <small>当前 magnet 工作区</small>
          </div>
        </article>
      </div>

      {successMessage ? <p className="feedback success header-feedback">{successMessage}</p> : null}
    </header>
  )
}

function BrandIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M13 2L5 13H11L9 22L19 9H13L13 2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function LinkIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M9 15L15 9M8 8H7C4.791 8 3 9.791 3 12S4.791 16 7 16H10M16 8H17C19.209 8 21 9.791 21 12S19.209 16 17 16H14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function PauseIcon(): React.JSX.Element {
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

function ResumeIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M9 7L17 12L9 17V7Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function DeleteIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M5 7H19M9 7V5C9 4.448 9.448 4 10 4H14C14.552 4 15 4.448 15 5V7M8 10V17M12 10V17M16 10V17M7 7L8 19C8.052 19.56 8.522 20 9.084 20H14.916C15.478 20 15.948 19.56 16 19L17 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}
