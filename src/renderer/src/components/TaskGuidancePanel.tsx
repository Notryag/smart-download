import type { DownloadTaskGuidance } from '../../../types'

interface TaskGuidancePanelProps {
  guidance: DownloadTaskGuidance
}

export function TaskGuidancePanel({ guidance }: TaskGuidancePanelProps): React.JSX.Element {
  return (
    <div className="task-guidance-card">
      <span className="panel-kicker">Guidance</span>
      <dl className="task-guidance-list">
        <div>
          <dt>原因</dt>
          <dd>{guidance.reason}</dd>
        </div>
        <div>
          <dt>瓶颈</dt>
          <dd>{guidance.bottleneck}</dd>
        </div>
        <div>
          <dt>建议</dt>
          <dd>{guidance.nextStep}</dd>
        </div>
      </dl>
    </div>
  )
}
