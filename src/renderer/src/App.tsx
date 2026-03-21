function App(): React.JSX.Element {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Stage 1 · Magnet MVP</p>
        <h1>Smart Download</h1>
        <p className="hero-copy">
          Electron + React + TypeScript skeleton is in place. The next milestone is to wire a single
          BT adapter and run the magnet download flow end to end.
        </p>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <header className="panel-header">
            <span className="panel-kicker">Current focus</span>
            <h2>Project structure</h2>
          </header>
          <ul className="check-list">
            <li>Main, preload, and renderer processes are separated.</li>
            <li>Electron packaging config is ready.</li>
            <li>Renderer is using the React + TypeScript template.</li>
          </ul>
        </article>

        <article className="panel accent-panel">
          <header className="panel-header">
            <span className="panel-kicker">Next tasks</span>
            <h2>Magnet flow</h2>
          </header>
          <ol className="step-list">
            <li>Define `DownloadTask` and status transitions.</li>
            <li>Design IPC for create, list, pause, resume, and delete.</li>
            <li>Connect a single BT adapter in the main process.</li>
          </ol>
        </article>
      </section>

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
          <span className="status-label">Package manager</span>
          <strong>pnpm</strong>
        </div>
      </section>
    </main>
  )
}

export default App
