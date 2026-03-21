interface HeroSectionProps {
  successMessage: string
  onCreateTask: () => void
}

export function HeroSection({ successMessage, onCreateTask }: HeroSectionProps): React.JSX.Element {
  return (
    <section className="hero">
      <p className="eyebrow">Stage 1 · Aria2 MVP</p>
      <h1>Smart Download</h1>
      <p className="hero-copy">
        第一版先统一走 aria2，并收口到 magnet 主链路。当前先把任务创建、状态同步和基础诊断跑通。
      </p>
      <div className="hero-actions">
        <button className="primary-button" type="button" onClick={onCreateTask}>
          新建下载任务
        </button>
        <p className="hero-hint">当前任务统一由 aria2 RPC 托管，renderer 只做展示和交互。</p>
      </div>
      {successMessage ? <p className="feedback success">{successMessage}</p> : null}
    </section>
  )
}
