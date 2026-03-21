import type {
  CreateDownloadTaskInput,
  DownloadTask,
  DownloadTaskStatus,
  TaskIdInput
} from '../../types'

const SIMULATED_TOTAL_BYTES = 512 * 1024 * 1024
const SIMULATED_SPEED_BYTES = 2 * 1024 * 1024
const SIMULATED_METADATA_MS = 1500

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

function assertMagnetSource(source: string): void {
  if (!source.trim().startsWith('magnet:?')) {
    throw new Error('BT adapter only supports magnet links')
  }
}

function toIsoNow(): string {
  return new Date().toISOString()
}

function clampProgress(downloadedBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) {
    return 0
  }

  return Math.min(1, downloadedBytes / totalBytes)
}

function buildSnapshot(session: BtAdapterSession): BtTaskSnapshot {
  const progress = clampProgress(session.downloadedBytes, session.totalBytes)
  const remainingBytes = Math.max(session.totalBytes - session.downloadedBytes, 0)
  const etaSeconds =
    session.state === 'downloading' && session.speedBytes > 0
      ? Math.ceil(remainingBytes / session.speedBytes)
      : undefined

  return {
    taskId: session.taskId,
    state: session.state,
    totalBytes: session.totalBytes,
    downloadedBytes: session.downloadedBytes,
    speedBytes: session.speedBytes,
    progress,
    etaSeconds,
    updatedAt: session.updatedAt
  }
}

export function btSessionStateToTaskStatus(state: BtSessionState): DownloadTaskStatus {
  switch (state) {
    case 'metadata':
      return 'metadata'
    case 'downloading':
      return 'downloading'
    case 'paused':
      return 'paused'
    case 'completed':
      return 'completed'
    case 'attached':
    default:
      return 'pending'
  }
}

export class InMemoryBtAdapter implements BtAdapter {
  private readonly sessions = new Map<string, BtAdapterSession>()

  async attachTask(input: AttachBtTaskInput): Promise<BtAdapterSession> {
    assertMagnetSource(input.source)

    const now = toIsoNow()
    const session: BtAdapterSession = {
      id: crypto.randomUUID(),
      taskId: input.taskId,
      source: input.source.trim(),
      savePath: input.savePath.trim(),
      state: 'attached',
      totalBytes: SIMULATED_TOTAL_BYTES,
      downloadedBytes: 0,
      speedBytes: 0,
      createdAt: now,
      updatedAt: now
    }

    this.sessions.set(input.taskId, session)

    return session
  }

  async hydrateTask(task: DownloadTask): Promise<BtAdapterSession> {
    assertMagnetSource(task.source)

    const now = toIsoNow()
    const totalBytes = task.totalBytes ?? SIMULATED_TOTAL_BYTES
    const downloadedBytes = Math.min(task.downloadedBytes, totalBytes)
    const state = task.status === 'completed' ? 'completed' : 'paused'
    const session: BtAdapterSession = {
      id: crypto.randomUUID(),
      taskId: task.id,
      source: task.source.trim(),
      savePath: task.savePath.trim(),
      state,
      totalBytes,
      downloadedBytes,
      speedBytes: 0,
      createdAt: task.createdAt,
      updatedAt: now
    }

    this.sessions.set(task.id, session)

    return session
  }

  async startTask(input: TaskIdInput): Promise<BtTaskSnapshot> {
    const session = this.getSessionOrThrow(input.taskId)
    const now = toIsoNow()
    const nextSession: BtAdapterSession = {
      ...session,
      state: 'metadata',
      speedBytes: 0,
      metadataStartedAt: now,
      lastActiveAt: now,
      updatedAt: now
    }

    this.sessions.set(input.taskId, nextSession)

    return buildSnapshot(nextSession)
  }

  async getTaskSnapshot(input: TaskIdInput): Promise<BtTaskSnapshot> {
    const session = this.advanceSession(this.getSessionOrThrow(input.taskId))
    this.sessions.set(input.taskId, session)

    return buildSnapshot(session)
  }

  async pauseTask(input: TaskIdInput): Promise<BtTaskSnapshot> {
    const session = this.advanceSession(this.getSessionOrThrow(input.taskId))
    const nextSession: BtAdapterSession = {
      ...session,
      state: session.state === 'completed' ? 'completed' : 'paused',
      speedBytes: 0,
      updatedAt: toIsoNow()
    }

    this.sessions.set(input.taskId, nextSession)

    return buildSnapshot(nextSession)
  }

  async resumeTask(input: TaskIdInput): Promise<BtTaskSnapshot> {
    const session = this.getSessionOrThrow(input.taskId)
    const now = toIsoNow()
    const nextState = session.downloadedBytes >= session.totalBytes ? 'completed' : 'downloading'
    const nextSession: BtAdapterSession = {
      ...session,
      state: nextState,
      speedBytes: nextState === 'completed' ? 0 : SIMULATED_SPEED_BYTES,
      lastActiveAt: now,
      updatedAt: now
    }

    this.sessions.set(input.taskId, nextSession)

    return buildSnapshot(nextSession)
  }

  async deleteTask(input: TaskIdInput): Promise<void> {
    this.getSessionOrThrow(input.taskId)
    this.sessions.delete(input.taskId)
  }

  private advanceSession(session: BtAdapterSession): BtAdapterSession {
    const now = Date.now()

    if (session.state === 'metadata' && session.metadataStartedAt) {
      const metadataElapsedMs = now - new Date(session.metadataStartedAt).getTime()

      if (metadataElapsedMs >= SIMULATED_METADATA_MS) {
        const updatedAt = toIsoNow()

        return {
          ...session,
          state: 'downloading',
          speedBytes: SIMULATED_SPEED_BYTES,
          lastActiveAt: updatedAt,
          updatedAt
        }
      }
    }

    if (session.state !== 'downloading' || !session.lastActiveAt) {
      return session
    }

    const elapsedMs = Math.max(now - new Date(session.lastActiveAt).getTime(), 0)
    const downloadedDelta = Math.floor((SIMULATED_SPEED_BYTES * elapsedMs) / 1000)
    const downloadedBytes = Math.min(session.downloadedBytes + downloadedDelta, session.totalBytes)
    const completed = downloadedBytes >= session.totalBytes
    const updatedAt = toIsoNow()

    return {
      ...session,
      state: completed ? 'completed' : 'downloading',
      downloadedBytes,
      speedBytes: completed ? 0 : SIMULATED_SPEED_BYTES,
      lastActiveAt: updatedAt,
      updatedAt
    }
  }

  private getSessionOrThrow(taskId: string): BtAdapterSession {
    const session = this.sessions.get(taskId)

    if (!session) {
      throw new Error(`BT session not found for task: ${taskId}`)
    }

    return session
  }
}
