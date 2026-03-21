import type { CreateDownloadTaskInput, DownloadTaskStatus, TaskIdInput } from '../../types'

export type BtSessionState = 'attached' | 'metadata' | 'downloading' | 'paused'

export interface BtAdapterSession {
  id: string
  taskId: string
  source: string
  savePath: string
  state: BtSessionState
  createdAt: string
  updatedAt: string
}

export interface AttachBtTaskInput extends CreateDownloadTaskInput {
  taskId: string
}

export interface BtAdapter {
  attachTask(input: AttachBtTaskInput): Promise<BtAdapterSession>
  startTask(input: TaskIdInput): Promise<BtAdapterSession>
  pauseTask(input: TaskIdInput): Promise<BtAdapterSession>
  resumeTask(input: TaskIdInput): Promise<BtAdapterSession>
  deleteTask(input: TaskIdInput): Promise<void>
}

function assertMagnetSource(source: string): void {
  if (!source.trim().startsWith('magnet:?')) {
    throw new Error('BT adapter only supports magnet links')
  }
}

function withSessionState(session: BtAdapterSession, state: BtSessionState): BtAdapterSession {
  return {
    ...session,
    state,
    updatedAt: new Date().toISOString()
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
    case 'attached':
    default:
      return 'pending'
  }
}

export class InMemoryBtAdapter implements BtAdapter {
  private readonly sessions = new Map<string, BtAdapterSession>()

  async attachTask(input: AttachBtTaskInput): Promise<BtAdapterSession> {
    assertMagnetSource(input.source)

    const now = new Date().toISOString()
    const session: BtAdapterSession = {
      id: crypto.randomUUID(),
      taskId: input.taskId,
      source: input.source.trim(),
      savePath: input.savePath.trim(),
      state: 'attached',
      createdAt: now,
      updatedAt: now
    }

    this.sessions.set(input.taskId, session)

    return session
  }

  async startTask(input: TaskIdInput): Promise<BtAdapterSession> {
    const session = this.getSessionOrThrow(input.taskId)
    const nextSession = withSessionState(session, 'metadata')

    this.sessions.set(input.taskId, nextSession)

    return nextSession
  }

  async pauseTask(input: TaskIdInput): Promise<BtAdapterSession> {
    const session = this.getSessionOrThrow(input.taskId)
    const nextSession = withSessionState(session, 'paused')

    this.sessions.set(input.taskId, nextSession)

    return nextSession
  }

  async resumeTask(input: TaskIdInput): Promise<BtAdapterSession> {
    const session = this.getSessionOrThrow(input.taskId)
    const nextSession = withSessionState(session, 'metadata')

    this.sessions.set(input.taskId, nextSession)

    return nextSession
  }

  async deleteTask(input: TaskIdInput): Promise<void> {
    this.getSessionOrThrow(input.taskId)
    this.sessions.delete(input.taskId)
  }

  private getSessionOrThrow(taskId: string): BtAdapterSession {
    const session = this.sessions.get(taskId)

    if (!session) {
      throw new Error(`BT session not found for task: ${taskId}`)
    }

    return session
  }
}
