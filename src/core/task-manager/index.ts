import type { DownloadAdapter, DownloadTaskSnapshot } from '../../adapters'
import type { InMemoryLogger } from '../logger'
import type { DownloadTaskStore } from '../../storage'
import {
  isFinishedDownloadTaskStatus,
  type CreateDownloadTaskInput,
  type DeleteTaskInput,
  type DownloadTask,
  type TaskIdInput
} from '../../types'

const RESTART_RECOVERY_MESSAGE = '应用重启后下载已停止，请手动恢复任务'
const CREATE_TASK_ROLLBACK_FAILED_MESSAGE = '创建任务失败，且清理远端下载任务失败'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function buildTaskName(input: CreateDownloadTaskInput): string {
  const trimmedName = input.name?.trim()

  if (trimmedName) {
    return trimmedName
  }

  return 'Download Task'
}

function assertTaskField(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required`)
  }
}

function assertSupportedSource(source: string): void {
  if (!source.trim().startsWith('magnet:?')) {
    throw new Error('当前阶段仅支持 magnet 下载任务。请输入以 magnet:? 开头的链接。')
  }
}

function updateTask(task: DownloadTask, patch: Partial<DownloadTask>): DownloadTask {
  const changed = (Object.keys(patch) as Array<keyof DownloadTask>).some(
    (key) => task[key] !== patch[key]
  )

  if (!changed) {
    return task
  }

  return {
    ...task,
    ...patch,
    updatedAt: new Date().toISOString()
  }
}

function applySnapshot(task: DownloadTask, snapshot: DownloadTaskSnapshot): DownloadTask {
  return updateTask(task, {
    remoteId: snapshot.remoteId ?? task.remoteId,
    status: snapshot.status,
    progress: snapshot.progress,
    downloadedBytes: snapshot.downloadedBytes,
    totalBytes: snapshot.totalBytes,
    speedBytes: snapshot.speedBytes,
    etaSeconds: snapshot.etaSeconds,
    errorMessage: snapshot.errorMessage
  })
}

function resolveTaskType(source: string): DownloadTask['type'] {
  return source.trim().startsWith('magnet:?') ? 'magnet' : 'uri'
}

export function createPendingMagnetTask(input: CreateDownloadTaskInput): DownloadTask {
  assertTaskField(input.source, 'source')
  assertTaskField(input.savePath, 'savePath')
  assertSupportedSource(input.source)

  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    name: buildTaskName(input),
    type: resolveTaskType(input.source),
    source: input.source.trim(),
    engine: 'aria2',
    status: 'pending',
    savePath: input.savePath.trim(),
    progress: 0,
    speedBytes: 0,
    downloadedBytes: 0,
    createdAt: now,
    updatedAt: now
  }
}

function needsRuntimeSession(task: DownloadTask): boolean {
  return task.status === 'paused'
}

function restoreTaskState(task: DownloadTask): DownloadTask {
  const shouldPauseAfterRestart = ['pending', 'metadata', 'downloading'].includes(task.status)

  if (shouldPauseAfterRestart) {
    return updateTask(task, {
      status: 'paused',
      speedBytes: 0,
      etaSeconds: undefined,
      errorMessage: RESTART_RECOVERY_MESSAGE
    })
  }

  if (task.status === 'paused') {
    return updateTask(task, {
      speedBytes: 0,
      etaSeconds: undefined
    })
  }

  if (isFinishedDownloadTaskStatus(task.status)) {
    return updateTask(task, {
      speedBytes: 0,
      etaSeconds: undefined
    })
  }

  return task
}

export class InMemoryTaskManager {
  private readonly tasks = new Map<string, DownloadTask>()

  constructor(
    private readonly downloadAdapter: DownloadAdapter,
    private readonly logger: InMemoryLogger,
    private readonly taskStore: DownloadTaskStore
  ) {}

  async restoreTasks(): Promise<void> {
    const persistedTasks = await this.taskStore.listTasks()

    for (const task of persistedTasks) {
      let restoredTask = restoreTaskState(task)
      this.tasks.set(restoredTask.id, restoredTask)

      if (restoredTask !== task) {
        await this.taskStore.upsertTask(restoredTask)
      }

      if (needsRuntimeSession(restoredTask)) {
        try {
          await this.downloadAdapter.hydrateTask(restoredTask)
        } catch (error) {
          const message = getErrorMessage(error, '恢复 aria2 会话失败')
          restoredTask = updateTask(restoredTask, {
            status: 'failed',
            errorMessage: message
          })
          this.tasks.set(restoredTask.id, restoredTask)
          await this.taskStore.upsertTask(restoredTask)
          this.logger.error(message, restoredTask.id)
        }
      }
    }

    this.logger.info(`Restored ${persistedTasks.length} persisted tasks`)
  }

  async createTask(input: CreateDownloadTaskInput): Promise<DownloadTask> {
    const task = createPendingMagnetTask(input)
    let currentTask = task
    this.tasks.set(task.id, task)
    this.logger.info('Created pending download task', task.id)
    await this.taskStore.upsertTask(task)

    try {
      await this.downloadAdapter.assertReady()

      const attachedSession = await this.downloadAdapter.attachTask({
        taskId: task.id,
        source: task.source,
        savePath: task.savePath,
        name: task.name
      })
      const attachedTask = updateTask(task, {
        remoteId: attachedSession.remoteId,
        errorMessage: undefined
      })
      currentTask = attachedTask
      this.tasks.set(task.id, attachedTask)
      await this.taskStore.upsertTask(attachedTask)

      const startedSnapshot = await this.downloadAdapter.startTask({ taskId: task.id })
      const startedTask = applySnapshot(attachedTask, startedSnapshot)

      this.tasks.set(task.id, startedTask)
      await this.taskStore.upsertTask(startedTask)
      this.logger.info(`Started task in ${startedTask.status} state`, task.id)

      return startedTask
    } catch (error) {
      const message = getErrorMessage(error, '创建下载任务失败')
      let failedTask = updateTask(currentTask, {
        status: 'failed',
        errorMessage: message
      })

      failedTask = await this.rollbackCreatedTask(failedTask)

      this.tasks.set(task.id, failedTask)
      await this.persistTaskFailure(failedTask)

      throw error
    }
  }

  async listTasks(): Promise<DownloadTask[]> {
    const taskEntries = await Promise.all(
      Array.from(this.tasks.values()).map(async (task) => {
        if (isFinishedDownloadTaskStatus(task.status)) {
          return [task.id, task] as const
        }

        try {
          const snapshot = await this.downloadAdapter.getTaskSnapshot({ taskId: task.id })
          const syncedTask = applySnapshot(task, snapshot)
          const statusChanged = syncedTask.status !== task.status
          const progressChanged = syncedTask.progress !== task.progress
          const taskChanged = syncedTask !== task

          if (statusChanged || progressChanged) {
            this.logger.info(
              `Synced task state: ${syncedTask.status} (${Math.round(syncedTask.progress * 100)}%)`,
              task.id
            )
          }

          if (taskChanged) {
            await this.taskStore.upsertTask(syncedTask)
          }

          return [task.id, syncedTask] as const
        } catch (error) {
          const message = getErrorMessage(error, '同步任务状态失败')
          const failedTask = updateTask(task, {
            status: 'failed',
            errorMessage: message
          })
          this.logger.error(message, task.id)
          await this.taskStore.upsertTask(failedTask)

          return [task.id, failedTask] as const
        }
      })
    )

    for (const [taskId, task] of taskEntries) {
      this.tasks.set(taskId, task)
    }

    return Array.from(this.tasks.values()).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
  }

  getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
  }

  async pauseTask(input: TaskIdInput): Promise<void> {
    const task = this.getTaskOrThrow(input.taskId)
    try {
      const snapshot = await this.downloadAdapter.pauseTask(input)
      const pausedTask = applySnapshot(task, snapshot)

      this.tasks.set(task.id, pausedTask)
      await this.taskStore.upsertTask(pausedTask)
      this.logger.info('Paused task', task.id)
    } catch (error) {
      const message = getErrorMessage(error, '暂停任务失败')
      const failedTask = updateTask(task, {
        errorMessage: message
      })

      this.tasks.set(task.id, failedTask)
      await this.taskStore.upsertTask(failedTask)
      this.logger.error(message, task.id)
      throw error
    }
  }

  async resumeTask(input: TaskIdInput): Promise<void> {
    const task = this.getTaskOrThrow(input.taskId)
    try {
      await this.downloadAdapter.assertReady()

      const snapshot = await this.downloadAdapter.resumeTask(input)
      const resumedTask = applySnapshot(task, snapshot)

      this.tasks.set(task.id, resumedTask)
      await this.taskStore.upsertTask(resumedTask)
      this.logger.info('Resumed task', task.id)
    } catch (error) {
      const message = getErrorMessage(error, '恢复任务失败')
      const failedTask = updateTask(task, {
        errorMessage: message
      })

      this.tasks.set(task.id, failedTask)
      await this.taskStore.upsertTask(failedTask)
      this.logger.error(message, task.id)
      throw error
    }
  }

  async deleteTask(input: DeleteTaskInput): Promise<void> {
    const task = this.getTaskOrThrow(input.taskId)

    try {
      await this.downloadAdapter.deleteTask(input)
    } catch (error) {
      if (!isFinishedDownloadTaskStatus(task.status)) {
        throw error
      }
    }

    this.tasks.delete(input.taskId)
    await this.taskStore.deleteTask(input.taskId)
    this.logger.info('Deleted task', input.taskId)
  }

  private getTaskOrThrow(taskId: string): DownloadTask {
    const task = this.tasks.get(taskId)

    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    return task
  }

  private async persistTaskFailure(task: DownloadTask): Promise<void> {
    try {
      await this.taskStore.upsertTask(task)
    } catch (error) {
      const message = getErrorMessage(error, '保存失败任务状态失败')
      this.logger.error(message, task.id)
    }
  }

  private async rollbackCreatedTask(task: DownloadTask): Promise<DownloadTask> {
    if (!task.remoteId) {
      this.logger.error(task.errorMessage ?? '创建下载任务失败', task.id)
      return task
    }

    try {
      await this.downloadAdapter.deleteTask({ taskId: task.id })
      this.logger.info('Rolled back remote download task after create failure', task.id)

      const rolledBackTask = updateTask(task, {
        remoteId: undefined
      })
      this.tasks.set(task.id, rolledBackTask)
      this.logger.error(rolledBackTask.errorMessage ?? '创建下载任务失败', task.id)

      return rolledBackTask
    } catch (rollbackError) {
      const rollbackMessage = getErrorMessage(rollbackError, CREATE_TASK_ROLLBACK_FAILED_MESSAGE)
      const errorMessage = task.errorMessage
        ? `${task.errorMessage}；同时远端任务清理失败：${rollbackMessage}`
        : `${CREATE_TASK_ROLLBACK_FAILED_MESSAGE}：${rollbackMessage}`
      const taskWithRollbackError = updateTask(task, {
        errorMessage
      })

      this.tasks.set(task.id, taskWithRollbackError)
      this.logger.error(errorMessage, task.id)

      return taskWithRollbackError
    }
  }
}
