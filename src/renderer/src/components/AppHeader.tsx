import type { DiagnosticSummary } from '../../../types'

interface AppHeaderProps {
  diagnostics: DiagnosticSummary | null
  successMessage: string
  onCreateTask: () => void
}

export function AppHeader({
  diagnostics,
  successMessage,
  onCreateTask
}: AppHeaderProps): React.JSX.Element {
  const runtimeLabel =
    diagnostics === null
      ? '引擎检查中'
      : diagnostics.runtime.ready
        ? 'aria2 已连接'
        : 'aria2 需要处理'

  return (
    <header className="app-header panel">
      <div className="app-header-main">
        <div>
          <span className="panel-kicker">Download workspace</span>
          <h1>Smart Download</h1>
          <p className="app-header-copy">
            聚焦 magnet 主链路。任务创建、状态观察和失败排查都在同一个工作台完成。
          </p>
        </div>

        <button className="primary-button" type="button" onClick={onCreateTask}>
          新建任务
        </button>
      </div>

      <div className="app-header-stats">
        <article className="header-stat">
          <span className="status-label">引擎状态</span>
          <strong>{runtimeLabel}</strong>
          <p>{diagnostics?.runtime.message ?? '正在读取 aria2 运行状态。'}</p>
        </article>
        <article className="header-stat">
          <span className="status-label">进行中</span>
          <strong>{diagnostics?.taskStats.active ?? 0}</strong>
          <p>包含待获取元数据和正在下载的任务。</p>
        </article>
        <article className="header-stat">
          <span className="status-label">失败任务</span>
          <strong>{diagnostics?.taskStats.failed ?? 0}</strong>
          <p>优先关注失败原因和最近诊断摘要。</p>
        </article>
        <article className="header-stat">
          <span className="status-label">已暂停</span>
          <strong>{diagnostics?.taskStats.paused ?? 0}</strong>
          <p>可在任务详情中继续恢复或删除。</p>
        </article>
      </div>

      {successMessage ? <p className="feedback success">{successMessage}</p> : null}
    </header>
  )
}
