export type DownloadTaskType = 'magnet'

export type DownloadEngine = 'bt'

export type DownloadTaskStatus =
  | 'pending'
  | 'metadata'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled'

export interface DownloadTask {
  id: string
  name: string
  type: DownloadTaskType
  source: string
  engine: DownloadEngine
  status: DownloadTaskStatus
  savePath: string
  progress: number
  speedBytes: number
  downloadedBytes: number
  totalBytes?: number
  etaSeconds?: number
  errorMessage?: string
  createdAt: string
  updatedAt: string
}
