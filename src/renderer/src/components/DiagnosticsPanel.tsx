import type { DiagnosticSummary } from '../../../types'

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticSummary | null
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps): React.JSX.Element {
  return (
    <section className="panel support-panel">
      <header className="panel-header">
        <span className="panel-kicker">Diagnostics</span>
        <h2>运行摘要</h2>
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

          {diagnostics.guidance.length > 0 ? (
            <div className="diagnostic-guidance-list">
              {diagnostics.guidance.map((item) => (
                <article key={item.id} className={`diagnostic-guidance diagnostic-${item.severity}`}>
                  <strong>{item.title}</strong>
                  <p>
                    {item.shortMessage ??
                      [item.reason, item.bottleneck, item.nextStep].filter(Boolean).join(' ')}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="empty-state">正在生成诊断摘要...</p>
      )}
    </section>
  )
}
