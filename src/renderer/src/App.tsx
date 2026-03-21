import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'

import type { CreateDownloadTaskInput, DiagnosticSummary, DownloadTask } from '../../types'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { HeroSection } from './components/HeroSection'
import { NewTaskModal } from './components/NewTaskModal'
import { RecentLogsPanel } from './components/RecentLogsPanel'
import { StatusStrip } from './components/StatusStrip'
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

  return (
    <>
      <main className="app-shell">
        <HeroSection successMessage={successMessage} onCreateTask={openModal} />
        <DiagnosticsPanel diagnostics={diagnostics} />
        <TaskSection
          actionTaskId={actionTaskId}
          isLoadingTasks={isLoadingTasks}
          listErrorMessage={listErrorMessage}
          selectedTaskId={selectedTaskId}
          tasks={tasks}
          onSelectTask={setSelectedTaskId}
          onTaskAction={handleTaskAction}
        />
        <StatusStrip isRuntimeReady={diagnostics?.runtime.ready ?? null} />
        <RecentLogsPanel diagnostics={diagnostics} />
      </main>

      <NewTaskModal
        errorMessage={errorMessage}
        form={form}
        isOpen={isModalOpen}
        isSubmitting={isSubmitting}
        onClose={closeModal}
        onFieldChange={updateField}
        onSubmit={handleSubmit}
      />
    </>
  )
}

export default App
