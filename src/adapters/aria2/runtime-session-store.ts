import type { DownloadTask } from '../../types'
import type { RuntimeSession } from './types'

interface CreateRuntimeSessionInput {
  taskId: string
  gid: string
  source: string
  savePath: string
  createdAt: string
  updatedAt: string
}

export class Aria2RuntimeSessionStore {
  private readonly sessions = new Map<string, RuntimeSession>()

  createSession(input: CreateRuntimeSessionInput): RuntimeSession {
    const session: RuntimeSession = {
      taskId: input.taskId,
      gid: input.gid,
      source: input.source.trim(),
      savePath: input.savePath.trim(),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    }

    this.sessions.set(input.taskId, session)
    return session
  }

  hydrateTask(task: DownloadTask, updatedAt: string): RuntimeSession {
    if (!task.remoteId) {
      throw new Error('任务缺少 aria2 GID，无法恢复运行时状态。')
    }

    const session: RuntimeSession = {
      taskId: task.id,
      gid: task.remoteId,
      source: task.source.trim(),
      savePath: task.savePath.trim(),
      createdAt: task.createdAt,
      updatedAt
    }

    this.sessions.set(task.id, session)
    return session
  }

  getSessionOrThrow(taskId: string): RuntimeSession {
    const session = this.sessions.get(taskId)

    if (!session) {
      throw new Error(`Download session not found for task: ${taskId}`)
    }

    return session
  }

  touchSession(taskId: string, updatedAt: string): RuntimeSession {
    const session = this.getSessionOrThrow(taskId)
    const nextSession = {
      ...session,
      updatedAt
    }

    this.sessions.set(taskId, nextSession)
    return nextSession
  }

  deleteSession(taskId: string): void {
    this.sessions.delete(taskId)
  }
}
