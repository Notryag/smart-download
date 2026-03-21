import type { FormEvent } from 'react'
import { useState } from 'react'

import type { CreateDownloadTaskInput } from '../../types'

const DEFAULT_FORM: CreateDownloadTaskInput = {
  source: '',
  savePath: '',
  name: ''
}

function isMagnetLink(value: string): boolean {
  return value.trim().startsWith('magnet:?')
}

function App(): React.JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState<CreateDownloadTaskInput>(DEFAULT_FORM)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

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

    if (!isMagnetLink(form.source)) {
      setErrorMessage('请输入有效的 magnet 链接。')
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
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建任务失败'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Stage 1 · Magnet MVP</p>
          <h1>Smart Download</h1>
          <p className="hero-copy">
            Electron + React + TypeScript skeleton is in place. The next milestone is to wire a
            single BT adapter and run the magnet download flow end to end.
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={openModal}>
              新建 magnet 任务
            </button>
            <p className="hero-hint">当前阶段先跑通任务创建、状态同步和单一 BT 引擎接入。</p>
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
              <li>新建任务弹窗已接入主进程创建接口。</li>
            </ul>
          </article>

          <article className="panel accent-panel">
            <header className="panel-header">
              <span className="panel-kicker">Next tasks</span>
              <h2>Magnet flow</h2>
            </header>
            <ol className="step-list">
              <li>接入单一 BT adapter。</li>
              <li>创建任务后推进到真实下载状态。</li>
              <li>补任务列表和详情面板。</li>
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
            <span className="status-label">Task creation</span>
            <strong>Typed IPC ready</strong>
          </div>
        </section>
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
                <h2 id="new-task-title">新建 magnet 任务</h2>
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
                <span>Magnet 链接</span>
                <textarea
                  placeholder="magnet:?xt=urn:btih:..."
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
