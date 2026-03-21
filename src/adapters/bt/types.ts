import type {
  CreateDownloadTaskInput,
  DownloadTask,
  DownloadTaskStatus,
  TaskIdInput
} from '../../types'

export type BtSessionState = 'attached' | 'metadata' | 'downloading' | 'paused' | 'completed'

export interface BtAdapterSession {
  id: string
  taskId: string
  source: string
  savePath: string
  state: BtSessionState
  totalBytes: number
  downloadedBytes: number
  speedBytes: number
  metadataStartedAt?: string
  lastActiveAt?: string
  createdAt: string
  updatedAt: string
}

export interface BtTaskSnapshot {
  taskId: string
  state: BtSessionState
  totalBytes: number
  downloadedBytes: number
  speedBytes: number
  progress: number
  etaSeconds?: number
  updatedAt: string
}

export interface AttachBtTaskInput extends CreateDownloadTaskInput {
  taskId: string
}

export interface BtAdapter {
  attachTask(input: AttachBtTaskInput): Promise<BtAdapterSession>
  hydrateTask(task: DownloadTask): Promise<BtAdapterSession>
  startTask(input: TaskIdInput): Promise<BtTaskSnapshot>
  getTaskSnapshot(input: TaskIdInput): Promise<BtTaskSnapshot>
  pauseTask(input: TaskIdInput): Promise<BtTaskSnapshot>
  resumeTask(input: TaskIdInput): Promise<BtTaskSnapshot>
  deleteTask(input: TaskIdInput): Promise<void>
}

export interface QbittorrentClientConfig {
  baseUrl: string
  username: string
  password: string
}

export interface QbittorrentTorrentInfo {
  hash: string
  progress: number
  dlspeed: number
  downloaded: number
  eta: number
  state: string
  size?: number
  total_size?: number
}

export interface RuntimeSession {
  taskId: string
  infoHash: string
  source: string
  savePath: string
  state: BtSessionState
  totalBytes: number
  downloadedBytes: number
  speedBytes: number
  awaitingRemoteUntil?: number
  lastError?: string
  createdAt: string
  updatedAt: string
}

export type { DownloadTask, DownloadTaskStatus, TaskIdInput }
