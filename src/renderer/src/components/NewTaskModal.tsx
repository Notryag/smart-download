import type { FormEvent } from 'react'
import type { CreateDownloadTaskInput } from '../../../types'

interface NewTaskModalProps {
  errorMessage: string
  form: CreateDownloadTaskInput
  isOpen: boolean
  isPickingSavePath: boolean
  isSubmitting: boolean
  onClose: () => void
  onFieldChange: (key: keyof CreateDownloadTaskInput, value: string) => void
  onPickSavePath: () => Promise<void>
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function NewTaskModal({
  errorMessage,
  form,
  isOpen,
  isPickingSavePath,
  isSubmitting,
  onClose,
  onFieldChange,
  onPickSavePath,
  onSubmit
}: NewTaskModalProps): React.JSX.Element | null {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
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
            onClick={onClose}
          >
            关闭
          </button>
        </header>

        <form className="task-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>下载地址</span>
            <textarea
              autoFocus
              placeholder="magnet:?xt=urn:btih:..."
              rows={4}
              value={form.source}
              onChange={(event) => onFieldChange('source', event.target.value)}
            />
            <small className="field-hint">当前阶段仅支持 magnet 链接。</small>
          </label>

          <label className="field">
            <span>保存目录</span>
            <div className="path-picker-field">
              <input
                placeholder="请选择保存目录"
                readOnly
                type="text"
                value={form.savePath}
              />
              <button
                className="ghost-button"
                disabled={isPickingSavePath || isSubmitting}
                type="button"
                onClick={() => void onPickSavePath()}
              >
                {isPickingSavePath ? '选择中...' : '选择目录'}
              </button>
            </div>
            <small className="field-hint">使用系统目录选择器设置保存路径。</small>
          </label>

          <label className="field">
            <span>任务名（可选）</span>
            <input
              placeholder="例如：Ubuntu ISO"
              type="text"
              value={form.name}
              onChange={(event) => onFieldChange('name', event.target.value)}
            />
            <small className="field-hint">不填时将使用系统生成的默认任务名。</small>
          </label>

          {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

          <div className="form-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? '创建中...' : '创建任务'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
