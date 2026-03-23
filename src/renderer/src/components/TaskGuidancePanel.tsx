import type { DownloadTaskGuidance } from '../../../types'

interface TaskGuidancePanelProps {
  guidance: DownloadTaskGuidance
}

export function TaskGuidancePanel({ guidance }: TaskGuidancePanelProps): React.JSX.Element {
  const detail =
    guidance.shortMessage ??
    [guidance.reason, guidance.bottleneck, guidance.nextStep].filter(Boolean).join(' ')

  return (
    <div className="task-guidance-card">
      <span className="panel-kicker">Guidance</span>
      <p>{detail}</p>
    </div>
  )
}
