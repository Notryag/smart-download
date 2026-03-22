import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'

import type {
  CreateDownloadTaskInput,
  DiagnosticSummary,
  DownloadDashboardSnapshot,
  DownloadTask
} from '../../types'
import { AppHeader } from './components/AppHeader'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { NewTaskModal } from './components/NewTaskModal'
import { RecentLogsPanel } from './components/RecentLogsPanel'
import { TaskSection, type TaskAction } from './components/TaskSection'
import { isSupportedSource } from './utils/download-task'

const DEFAULT_FORM: CreateDownloadTaskInput = {
  source: '',
  savePath: '',
  name: ''
}

function App(): React.JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPickingSavePath, setIsPickingSavePath] = useState(false)
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [actionTaskId, setActionTaskId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [diagnostics, setDiagnostics] = useState<DiagnosticSummary | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateDownloadTaskInput>(DEFAULT_FORM)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [listErrorMessage, setListErrorMessage] = useState('')
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null

  useEffect(() => {
    function applyDashboard(snapshot: DownloadDashboardSnapshot): void {
      setTasks(snapshot.tasks)
      setDiagnostics(snapshot.diagnostics)
      setListErrorMessage('')
      setIsLoadingTasks(false)
    }

    async function loadInitialDashboard(): Promise<void> {
      try {
        const snapshot = await window.api.getDashboard()
        applyDashboard(snapshot)
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载任务列表失败'
        setListErrorMessage(message)
        setIsLoadingTasks(false)
      }
    }

    void loadInitialDashboard()

    const unsubscribe = window.api.onDashboardUpdated((snapshot) => {
      applyDashboard(snapshot)
    })

    return () => {
      unsubscribe()
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

  async function handlePickSavePath(): Promise<void> {
    setIsPickingSavePath(true)

    try {
      const selectedPath = await window.api.pickDirectory()

      if (selectedPath) {
        updateField('savePath', selectedPath)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '选择保存目录失败'
      setErrorMessage(message)
    } finally {
      setIsPickingSavePath(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!isSupportedSource(form.source)) {
      setErrorMessage('当前阶段仅支持 magnet 链接，请输入以 magnet:? 开头的下载地址。')
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
      setSelectedTaskId(result.taskId)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建任务失败'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleTaskAction(action: TaskAction, taskId: string): Promise<void> {
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

  return (
    <>
      <main className="app-shell">
        <AppHeader
          actionTaskId={actionTaskId}
          diagnostics={diagnostics}
          selectedTask={selectedTask}
          successMessage={successMessage}
          onCreateTask={openModal}
          onTaskAction={handleTaskAction}
        />
        <TaskSection
          actionTaskId={actionTaskId}
          isLoadingTasks={isLoadingTasks}
          listErrorMessage={listErrorMessage}
          selectedTaskId={selectedTaskId}
          tasks={tasks}
          onSelectTask={setSelectedTaskId}
          onTaskAction={handleTaskAction}
        />
        <section className="support-grid">
          <DiagnosticsPanel diagnostics={diagnostics} />
          <RecentLogsPanel diagnostics={diagnostics} />
        </section>

        <footer className="workspace-statusbar panel">
          <div className="workspace-statusbar-group">
            <span className={`status-indicator${diagnostics?.runtime.ready ? ' status-indicator-ready' : ''}`} />
            <strong>{diagnostics?.runtime.ready ? 'aria2 已连接' : 'aria2 待处理'}</strong>
            <span>{diagnostics?.runtime.message ?? '正在读取运行状态。'}</span>
          </div>
          <div className="workspace-statusbar-group workspace-statusbar-metrics">
            <span>总任务 {diagnostics?.taskStats.total ?? tasks.length}</span>
            <span>进行中 {diagnostics?.taskStats.active ?? 0}</span>
            <span>失败 {diagnostics?.taskStats.failed ?? 0}</span>
            <span>已完成 {diagnostics?.taskStats.completed ?? 0}</span>
          </div>
        </footer>
      </main>

      <NewTaskModal
        errorMessage={errorMessage}
        form={form}
        isOpen={isModalOpen}
        isPickingSavePath={isPickingSavePath}
        isSubmitting={isSubmitting}
        onClose={closeModal}
        onFieldChange={updateField}
        onPickSavePath={handlePickSavePath}
        onSubmit={handleSubmit}
      />
    </>
  )
}

export default App
