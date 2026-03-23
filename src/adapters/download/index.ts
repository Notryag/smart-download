import type {
  CreateDownloadTaskInput,
  DownloadTask,
  DownloadTaskStatus,
  TaskIdInput
} from '../../types'

export interface DownloadAdapterRuntimeStatus {
  ready: boolean
  client: string
  message: string
}

export interface DownloadAdapterSession {
  id: string
  taskId: string
  remoteId: string
  source: string
  savePath: string
  status: DownloadTaskStatus
  totalBytes: number
  downloadedBytes: number
  speedBytes: number
  trackerCount?: number
  fallbackTrackerCount?: number
  createdAt: string
  updatedAt: string
}

export interface DownloadTaskSnapshot {
  taskId: string
  remoteId?: string
  status: DownloadTaskStatus
  totalBytes: number
  downloadedBytes: number
  speedBytes: number
  progress: number
  seedersCount?: number
  etaSeconds?: number
  errorMessage?: string
  updatedAt: string
}

export interface AttachDownloadTaskInput extends CreateDownloadTaskInput {
  taskId: string
}

export interface DownloadAdapter {
  getRuntimeStatus(): Promise<DownloadAdapterRuntimeStatus>
  assertReady(): Promise<void>
  attachTask(input: AttachDownloadTaskInput): Promise<DownloadAdapterSession>
  hydrateTask(task: DownloadTask): Promise<DownloadAdapterSession>
  startTask(input: TaskIdInput): Promise<DownloadTaskSnapshot>
  getTaskSnapshot(input: TaskIdInput): Promise<DownloadTaskSnapshot>
  pauseTask(input: TaskIdInput): Promise<DownloadTaskSnapshot>
  resumeTask(input: TaskIdInput): Promise<DownloadTaskSnapshot>
  deleteTask(input: TaskIdInput): Promise<void>
}
