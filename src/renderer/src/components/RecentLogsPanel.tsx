import type { DiagnosticSummary } from '../../../types'
import { formatDate, formatLogLevel } from '../utils/download-task'

interface RecentLogsPanelProps {
  diagnostics: DiagnosticSummary | null
}

export function RecentLogsPanel({ diagnostics }: RecentLogsPanelProps): React.JSX.Element | null {
  if (!diagnostics) {
    return null
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <span className="panel-kicker">Recent logs</span>
        <h2>最近日志</h2>
      </header>
      {diagnostics.recentLogs.length > 0 ? (
        <div className="diagnostic-list">
          {diagnostics.recentLogs.map((entry) => (
            <article
              key={entry.id}
              className={`diagnostic-item diagnostic-${entry.level === 'error' ? 'error' : entry.level === 'warning' ? 'warning' : 'info'}`}
            >
              <strong>
                {formatLogLevel(entry.level)} · {entry.category}
                {entry.taskId ? ` · ${entry.taskId}` : ''}
              </strong>
              <p>{entry.message}</p>
              {entry.details ? (
                <p className="diagnostic-meta">{formatLogDetails(entry.details)}</p>
              ) : null}
              <span className="diagnostic-time">{formatDate(entry.createdAt)}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">还没有日志记录。</p>
      )}
    </section>
  )
}

function formatLogDetails(details: Record<string, string | number | boolean | null>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}=${value === null ? 'null' : String(value)}`)
    .join(' · ')
}
