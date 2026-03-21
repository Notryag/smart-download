import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'

import type { CreateDownloadTaskInput, DiagnosticSummary, DownloadTask } from '../../types'

const DEFAULT_FORM: CreateDownloadTaskInput = {
  source: '',
  savePath: '',
  name: ''
}

function isSupportedSource(value: string): boolean {
  const normalized = value.trim()

  if (normalized.startsWith('magnet:?')) {
    return true
  }

  try {
    const url = new URL(normalized)
    return ['http:', 'https:', 'ftp:'].includes(url.protocol)
  } catch {
    return false
  }
}

function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const normalized = value / 1024 ** unitIndex

  return `${normalized.toFixed(normalized >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

function formatProgress(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatStatus(status: DownloadTask['status']): string {
  switch (status) {
    case 'metadata':
      return '获取元数据中'
    case 'downloading':
      return '下载中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'canceled':
      return '已取消'
    case 'pending':
    default:
      return '等待中'
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false
  })
}

function formatLogLevel(level: 'info' | 'error'): string {
  return level === 'error' ? '错误' : '信息'
}

function canPauseTask(task: DownloadTask): boolean {
  return !['paused', 'completed', 'failed', 'canceled'].includes(task.status)
}

function canResumeTask(task: DownloadTask): boolean {
  return task.status === 'paused'
}

function App(): React.JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [actionTaskId, setActionTaskId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [diagnostics, setDiagnostics] = useState<DiagnosticSummary | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateDownloadTaskInput>(DEFAULT_FORM)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [listErrorMessage, setListErrorMessage] = useState('')

  async function loadDashboard(): Promise<void> {
    try {
      const nextTasks = await window.api.listTasks()
      const nextDiagnostics = await window.api.getDiagnostics()
      setTasks(nextTasks)
      setDiagnostics(nextDiagnostics)
      setListErrorMessage('')
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载任务列表失败'
      setListErrorMessage(message)
    } finally {
      setIsLoadingTasks(false)
    }
  }

  useEffect(() => {
    void loadDashboard()

    const timer = window.setInterval(() => {
      void loadDashboard()
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(null)
      return
    }

    if (!selectedTaskId || !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0].id)
    }
  }, [selectedTaskId, tasks])

  function openModal(): void {
    setIsModalOpen(true)
    setErrorMessage('')
    setSuccessMessage('')
  }

  function closeModal(): void {
    setIsModalOpen(false)
    setErrorMessage('')
  }

  function updateField<Key extends keyof CreateDownloadTaskInput>(
    key: Key,
    value: CreateDownloadTaskInput[Key]
  ): void {
    setForm((current) => ({
      ...current,
      [key]: value
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!isSupportedSource(form.source)) {
      setErrorMessage('请输入 aria2 支持的下载地址，例如 https://... 或 magnet:?...')
      return
    }

    if (form.savePath.trim().length === 0) {
      setErrorMessage('请输入保存目录。')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const result = await window.api.createTask({
        source: form.source.trim(),
        savePath: form.savePath.trim(),
        name: form.name?.trim() || undefined
      })

      setSuccessMessage(`任务已创建，ID: ${result.taskId}`)
      setForm(DEFAULT_FORM)
      setIsModalOpen(false)
      await loadDashboard()
      setSelectedTaskId(result.taskId)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建任务失败'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleTaskAction(
    action: 'pause' | 'resume' | 'delete',
    taskId: string
  ): Promise<void> {
    setActionTaskId(taskId)
    setListErrorMessage('')

    try {
      if (action === 'pause') {
        await window.api.pauseTask({ taskId })
      } else if (action === 'resume') {
        await window.api.resumeTask({ taskId })
      } else {
        await window.api.deleteTask({ taskId })

        if (selectedTaskId === taskId) {
          setSelectedTaskId(null)
        }
      }

      await loadDashboard()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : action === 'delete'
            ? '删除任务失败'
            : action === 'pause'
              ? '暂停任务失败'
              : '恢复任务失败'

      setListErrorMessage(message)
    } finally {
      setActionTaskId(null)
    }
  }

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null

  return (
    <>
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Stage 1 · Aria2 MVP</p>
          <h1>Smart Download</h1>
          <p className="hero-copy">
            第一版先统一走 aria2。当前先把任务创建、任务列表、状态同步和基础诊断这条主链路跑通。
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={openModal}>
              新建下载任务
            </button>
            <p className="hero-hint">当前任务统一由 aria2 RPC 托管，renderer 只做展示和交互。</p>
          </div>
          {successMessage ? <p className="feedback success">{successMessage}</p> : null}
        </section>

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

        <section className="task-section panel">
          <header className="task-section-header">
            <div>
              <span className="panel-kicker">Task list</span>
              <h2>下载任务</h2>
            </div>
            <span className="task-count">{tasks.length} 个任务</span>
          </header>

          {listErrorMessage ? <p className="feedback error">{listErrorMessage}</p> : null}

          {isLoadingTasks ? <p className="empty-state">正在加载任务列表...</p> : null}

          {!isLoadingTasks && tasks.length === 0 ? (
            <p className="empty-state">还没有任务。先创建一个下载任务。</p>
          ) : null}

          {!isLoadingTasks && tasks.length > 0 ? (
            <div className="task-layout">
              <div className="task-list">
                {tasks.map((task) => (
                  <article
                    key={task.id}
                    className={`task-card${task.id === selectedTaskId ? ' task-card-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTaskId(task.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedTaskId(task.id)
                      }
                    }}
                  >
                    <div className="task-card-header">
                      <div>
                        <strong>{task.name}</strong>
                        <p>{task.id}</p>
                      </div>
                      <span className={`status-badge status-${task.status}`}>
                        {formatStatus(task.status)}
                      </span>
                    </div>

                    <div className="task-progress-row">
                      <div className="task-progress-bar">
                        <span style={{ width: `${task.progress * 100}%` }} />
                      </div>
                      <strong>{formatProgress(task.progress)}</strong>
                    </div>

                    <dl className="task-meta-grid">
                      <div>
                        <dt>速度</dt>
                        <dd>{formatBytes(task.speedBytes)}/s</dd>
                      </div>
                      <div>
                        <dt>已下载</dt>
                        <dd>{formatBytes(task.downloadedBytes)}</dd>
                      </div>
                      <div>
                        <dt>总大小</dt>
                        <dd>
                          {typeof task.totalBytes === 'number'
                            ? formatBytes(task.totalBytes)
                            : '待确定'}
                        </dd>
                      </div>
                      <div>
                        <dt>剩余</dt>
                        <dd>
                          {typeof task.etaSeconds === 'number' ? `${task.etaSeconds}s` : '--'}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>

              <aside className="task-detail">
                <header className="task-detail-header">
                  <span className="panel-kicker">Task detail</span>
                  <h3>基础信息</h3>
                </header>

                {selectedTask ? (
                  <>
                    {selectedTask.errorMessage ? (
                      <p className="feedback error">{selectedTask.errorMessage}</p>
                    ) : null}

                    <div className="task-action-row">
                      <button
                        className="ghost-button"
                        disabled={!canPauseTask(selectedTask) || actionTaskId === selectedTask.id}
                        type="button"
                        onClick={() => void handleTaskAction('pause', selectedTask.id)}
                      >
                        暂停
                      </button>
                      <button
                        className="ghost-button"
                        disabled={!canResumeTask(selectedTask) || actionTaskId === selectedTask.id}
                        type="button"
                        onClick={() => void handleTaskAction('resume', selectedTask.id)}
                      >
                        恢复
                      </button>
                      <button
                        className="ghost-button danger-button"
                        disabled={actionTaskId === selectedTask.id}
                        type="button"
                        onClick={() => void handleTaskAction('delete', selectedTask.id)}
                      >
                        删除
                      </button>
                    </div>

                    <div className="task-detail-title-row">
                      <div>
                        <strong>{selectedTask.name}</strong>
                        <p>{selectedTask.id}</p>
                      </div>
                      <span className={`status-badge status-${selectedTask.status}`}>
                        {formatStatus(selectedTask.status)}
                      </span>
                    </div>

                    <dl className="task-detail-grid">
                      <div>
                        <dt>任务类型</dt>
                        <dd>{selectedTask.type}</dd>
                      </div>
                      <div>
                        <dt>下载引擎</dt>
                        <dd>{selectedTask.engine}</dd>
                      </div>
                      <div>
                        <dt>保存目录</dt>
                        <dd className="break-all">{selectedTask.savePath}</dd>
                      </div>
                      <div>
                        <dt>创建时间</dt>
                        <dd>{formatDate(selectedTask.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>更新时间</dt>
                        <dd>{formatDate(selectedTask.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt>数据来源</dt>
                        <dd className="break-all">{selectedTask.source}</dd>
                      </div>
                      <div>
                        <dt>远端任务 ID</dt>
                        <dd className="break-all">{selectedTask.remoteId ?? '待分配'}</dd>
                      </div>
                      <div>
                        <dt>下载进度</dt>
                        <dd>{formatProgress(selectedTask.progress)}</dd>
                      </div>
                      <div>
                        <dt>当前速度</dt>
                        <dd>{formatBytes(selectedTask.speedBytes)}/s</dd>
                      </div>
                      <div>
                        <dt>错误状态</dt>
                        <dd>{selectedTask.errorMessage ?? '无'}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="empty-state">选择一个任务查看详情。</p>
                )}
              </aside>
            </div>
          ) : null}
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
            <span className="status-label">Diagnostics</span>
            <strong>
              {diagnostics
                ? diagnostics.runtime.ready
                  ? 'Aria2 Ready'
                  : 'Attention Needed'
                : 'Loading'}
            </strong>
          </div>
        </section>

        {diagnostics ? (
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
                    className={`diagnostic-item diagnostic-${entry.level === 'error' ? 'error' : 'info'}`}
                  >
                    <strong>
                      {formatLogLevel(entry.level)}
                      {entry.taskId ? ` · ${entry.taskId}` : ''}
                    </strong>
                    <p>{entry.message}</p>
                    <span className="diagnostic-time">{formatDate(entry.createdAt)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">还没有日志记录。</p>
            )}
          </section>
        ) : null}
      </main>

      {isModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <section
            aria-labelledby="new-task-title"
            aria-modal="true"
            className="modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <span className="panel-kicker">Create task</span>
                <h2 id="new-task-title">新建下载任务</h2>
              </div>
              <button
                aria-label="关闭新建任务弹窗"
                className="ghost-button"
                type="button"
                onClick={closeModal}
              >
                关闭
              </button>
            </header>

            <form className="task-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>下载地址</span>
                <textarea
                  placeholder="https://example.com/file.zip 或 magnet:?xt=urn:btih:..."
                  rows={4}
                  value={form.source}
                  onChange={(event) => updateField('source', event.target.value)}
                />
              </label>

              <label className="field">
                <span>保存目录</span>
                <input
                  placeholder="D:\\Downloads"
                  type="text"
                  value={form.savePath}
                  onChange={(event) => updateField('savePath', event.target.value)}
                />
              </label>

              <label className="field">
                <span>任务名（可选）</span>
                <input
                  placeholder="例如：Ubuntu ISO"
                  type="text"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </label>

              {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

              <div className="form-actions">
                <button className="ghost-button" type="button" onClick={closeModal}>
                  取消
                </button>
                <button className="primary-button" disabled={isSubmitting} type="submit">
                  {isSubmitting ? '创建中...' : '创建任务'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}

export default App
