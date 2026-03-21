interface StatusStripProps {
  isRuntimeReady: boolean | null
}

export function StatusStrip({ isRuntimeReady }: StatusStripProps): React.JSX.Element {
  return (
    <section className="status-strip">
      <div>
        <span className="status-label">Renderer</span>
        <strong>React + Vite</strong>
      </div>
      <div>
        <span className="status-label">Desktop shell</span>
        <strong>Electron</strong>
      </div>
      <div>
        <span className="status-label">Diagnostics</span>
        <strong>
          {isRuntimeReady === null
            ? 'Loading'
            : isRuntimeReady
              ? 'Aria2 Ready'
              : 'Attention Needed'}
        </strong>
      </div>
    </section>
  )
}
