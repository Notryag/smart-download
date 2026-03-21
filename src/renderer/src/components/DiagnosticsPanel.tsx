import type { DiagnosticSummary } from '../../../types'

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticSummary | null
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps): React.JSX.Element {
  return (
    <section className="panel-grid">
      <article className="panel">
        <header className="panel-header">
          <span className="panel-kicker">Current focus</span>
          <h2>Project structure</h2>
        </header>
        <ul className="check-list">
          <li>Main、preload、renderer 进程边界已经分开。</li>
          <li>任务类型和 IPC 合同已经定义完成。</li>
          <li>任务列表会轮询主进程的同步状态。</li>
        </ul>
      </article>

      <article className="panel accent-panel">
        <header className="panel-header">
          <span className="panel-kicker">Diagnostics</span>
          <h2>基础诊断摘要</h2>
        </header>
        {diagnostics ? (
          <div className="diagnostic-summary">
            <p className="diagnostic-overview">{diagnostics.overview}</p>

            <dl className="diagnostic-stats">
              <div>
                <dt>总任务</dt>
                <dd>{diagnostics.taskStats.total}</dd>
              </div>
              <div>
                <dt>进行中</dt>
                <dd>{diagnostics.taskStats.active}</dd>
              </div>
              <div>
                <dt>已暂停</dt>
                <dd>{diagnostics.taskStats.paused}</dd>
              </div>
              <div>
                <dt>失败</dt>
                <dd>{diagnostics.taskStats.failed}</dd>
              </div>
            </dl>

            <p
              className={`feedback diagnostic-feedback ${diagnostics.runtime.ready ? 'success' : 'error'}`}
            >
              {diagnostics.runtime.message}
            </p>

            {diagnostics.highlights.length > 0 ? (
              <div className="diagnostic-list">
                {diagnostics.highlights.map((highlight) => (
                  <article
                    key={highlight.id}
                    className={`diagnostic-item diagnostic-${highlight.severity}`}
                  >
                    <strong>{highlight.title}</strong>
                    <p>{highlight.detail}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">当前没有额外告警，主链路状态正常。</p>
            )}
          </div>
        ) : (
          <p className="empty-state">正在生成诊断摘要...</p>
        )}
      </article>
    </section>
  )
}
