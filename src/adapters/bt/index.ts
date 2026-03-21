import type { CreateDownloadTaskInput, TaskIdInput } from '../../types'

export interface BtAdapterSession {
  id: string
  taskId: string
  source: string
  savePath: string
  state: 'attached' | 'paused'
  createdAt: string
  updatedAt: string
}

export interface AttachBtTaskInput extends CreateDownloadTaskInput {
  taskId: string
}

export interface BtAdapter {
  attachTask(input: AttachBtTaskInput): Promise<BtAdapterSession>
  pauseTask(input: TaskIdInput): Promise<void>
  resumeTask(input: TaskIdInput): Promise<void>
  deleteTask(input: TaskIdInput): Promise<void>
}

function assertMagnetSource(source: string): void {
  if (!source.trim().startsWith('magnet:?')) {
    throw new Error('BT adapter only supports magnet links')
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

  async pauseTask(input: TaskIdInput): Promise<void> {
    const session = this.getSessionOrThrow(input.taskId)

    this.sessions.set(input.taskId, {
      ...session,
      state: 'paused',
      updatedAt: new Date().toISOString()
    })
  }

  async resumeTask(input: TaskIdInput): Promise<void> {
    const session = this.getSessionOrThrow(input.taskId)

    this.sessions.set(input.taskId, {
      ...session,
      state: 'attached',
      updatedAt: new Date().toISOString()
    })
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
