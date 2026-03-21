import type { DiagnosticSummary } from './diagnostics'
import type { CreateDownloadTaskInput, DownloadTask } from './download-task'

export const DOWNLOAD_TASK_IPC_CHANNELS = {
  createTask: 'download-task:create',
  getDashboard: 'download-task:dashboard',
  dashboardUpdated: 'download-task:dashboard-updated',
  listTasks: 'download-task:list',
  getDiagnostics: 'download-task:diagnostics',
  pauseTask: 'download-task:pause',
  resumeTask: 'download-task:resume',
  deleteTask: 'download-task:delete'
} as const

export interface DownloadDashboardSnapshot {
  tasks: DownloadTask[]
  diagnostics: DiagnosticSummary
}

export interface CreateTaskResult {
  taskId: string
}

export interface DeleteTaskInput {
  taskId: string
}

export interface TaskIdInput {
  taskId: string
}

export interface DownloadTaskApi {
  createTask(input: CreateDownloadTaskInput): Promise<CreateTaskResult>
  getDashboard(): Promise<DownloadDashboardSnapshot>
  onDashboardUpdated(listener: (snapshot: DownloadDashboardSnapshot) => void): () => void
  listTasks(): Promise<DownloadTask[]>
  getDiagnostics(): Promise<DiagnosticSummary>
  pauseTask(input: TaskIdInput): Promise<void>
  resumeTask(input: TaskIdInput): Promise<void>
  deleteTask(input: DeleteTaskInput): Promise<void>
}
