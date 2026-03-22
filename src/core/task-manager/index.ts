import type { DownloadAdapter } from '../../adapters'
import type { InMemoryLogger } from '../logger'
import type { DownloadTaskStore } from '../../storage'
import {
  type CreateDownloadTaskInput,
  type DeleteTaskInput,
  type DownloadTask,
  type TaskIdInput
} from '../../types'
import {
  applySnapshot,
  buildSourcePreview,
  createPendingMagnetTask,
  getErrorMessage,
  needsRuntimeSession,
  resolveRuntimeTaskMessage,
  restoreTaskState,
  updateTask
} from './task-utils'
import { isFinishedDownloadTaskStatus } from '../../types'

const CREATE_TASK_ROLLBACK_FAILED_MESSAGE = '创建任务失败，且清理远端下载任务失败'
const TASK_STALL_LOG_INTERVAL_MS = 30_000

export class InMemoryTaskManager {
  private readonly tasks = new Map<string, DownloadTask>()
  private readonly lastStallLoggedAt = new Map<string, number>()

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
          this.logger.error(message, {
            category: 'task-manager',
            details: {
              remoteId: restoredTask.remoteId ?? null,
              status: restoredTask.status
            },
            taskId: restoredTask.id
          })
        }
      }
    }

    this.logger.info(`Restored ${persistedTasks.length} persisted tasks`, {
      category: 'task-manager',
      details: {
        count: persistedTasks.length
      }
    })
  }

  async createTask(input: CreateDownloadTaskInput): Promise<DownloadTask> {
    const task = createPendingMagnetTask(input)
    let currentTask = task
    this.tasks.set(task.id, task)
    this.logger.info('Created pending download task', {
      category: 'task-manager',
      details: {
        savePath: task.savePath,
        sourcePreview: buildSourcePreview(task.source),
        type: task.type
      },
      taskId: task.id
    })
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
      this.logger.info('Attached task to remote download engine', {
        category: 'task-manager',
        details: {
          remoteId: attachedTask.remoteId ?? null,
          savePath: attachedTask.savePath
        },
        taskId: task.id
      })

      const startedSnapshot = await this.downloadAdapter.startTask({ taskId: task.id })
      const startedNextTask = applySnapshot(attachedTask, startedSnapshot)
      const startedTask = updateTask(startedNextTask, {
        errorMessage: resolveRuntimeTaskMessage(attachedTask, startedNextTask)
      })

      if (startedTask.status === 'failed' || startedTask.status === 'canceled') {
        throw new Error(startedTask.errorMessage ?? '创建下载任务失败')
      }

      this.tasks.set(task.id, startedTask)
      await this.taskStore.upsertTask(startedTask)
      this.logger.info(`Started task in ${startedTask.status} state`, {
        category: 'task-manager',
        details: {
          downloadedBytes: startedTask.downloadedBytes,
          remoteId: startedTask.remoteId ?? null,
          speedBytes: startedTask.speedBytes,
          totalBytes: startedTask.totalBytes ?? null
        },
        taskId: task.id
      })

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
          const nextTask = applySnapshot(task, snapshot)
          const syncedTask = updateTask(nextTask, {
            errorMessage: resolveRuntimeTaskMessage(task, nextTask)
          })
          const statusChanged = syncedTask.status !== task.status
          const progressChanged = syncedTask.progress !== task.progress
          const taskChanged = syncedTask !== task

          if (statusChanged || progressChanged) {
            this.logger.info(
              `Synced task state: ${syncedTask.status} (${Math.round(syncedTask.progress * 100)}%)`,
              {
                category: 'task-manager',
                details: {
                  downloadedBytes: syncedTask.downloadedBytes,
                  remoteId: syncedTask.remoteId ?? null,
                  speedBytes: syncedTask.speedBytes,
                  totalBytes: syncedTask.totalBytes ?? null
                },
                taskId: task.id
              }
            )
          }

          this.maybeLogStalledTask(task, syncedTask)

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
          this.logger.error(message, {
            category: 'task-manager',
            details: {
              remoteId: task.remoteId ?? null,
              status: task.status
            },
            taskId: task.id
          })
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
      this.logger.info('Paused task', {
        category: 'task-manager',
        details: {
          remoteId: pausedTask.remoteId ?? null,
          status: pausedTask.status
        },
        taskId: task.id
      })
    } catch (error) {
      const message = getErrorMessage(error, '暂停任务失败')
      const failedTask = updateTask(task, {
        errorMessage: message
      })

      this.tasks.set(task.id, failedTask)
      await this.taskStore.upsertTask(failedTask)
      this.logger.error(message, {
        category: 'task-manager',
        details: {
          remoteId: task.remoteId ?? null
        },
        taskId: task.id
      })
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
      this.logger.info('Resumed task', {
        category: 'task-manager',
        details: {
          remoteId: resumedTask.remoteId ?? null,
          status: resumedTask.status
        },
        taskId: task.id
      })
    } catch (error) {
      const message = getErrorMessage(error, '恢复任务失败')
      const failedTask = updateTask(task, {
        errorMessage: message
      })

      this.tasks.set(task.id, failedTask)
      await this.taskStore.upsertTask(failedTask)
      this.logger.error(message, {
        category: 'task-manager',
        details: {
          remoteId: task.remoteId ?? null
        },
        taskId: task.id
      })
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
    this.logger.info('Deleted task', {
      category: 'task-manager',
      details: {
        remoteId: task.remoteId ?? null,
        status: task.status
      },
      taskId: input.taskId
    })
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
      this.logger.error(message, {
        category: 'storage',
        details: {
          remoteId: task.remoteId ?? null,
          status: task.status
        },
        taskId: task.id
      })
    }
  }

  private async rollbackCreatedTask(task: DownloadTask): Promise<DownloadTask> {
    if (!task.remoteId) {
      this.logger.error(task.errorMessage ?? '创建下载任务失败', {
        category: 'task-manager',
        details: {
          remoteId: null,
          stage: 'create'
        },
        taskId: task.id
      })
      return task
    }

    try {
      await this.downloadAdapter.deleteTask({ taskId: task.id })
      this.logger.info('Rolled back remote download task after create failure', {
        category: 'task-manager',
        details: {
          remoteId: task.remoteId,
          stage: 'create'
        },
        taskId: task.id
      })

      const rolledBackTask = updateTask(task, {
        remoteId: undefined
      })
      this.tasks.set(task.id, rolledBackTask)
      this.logger.error(rolledBackTask.errorMessage ?? '创建下载任务失败', {
        category: 'task-manager',
        details: {
          remoteId: null,
          stage: 'create'
        },
        taskId: task.id
      })

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
      this.logger.error(errorMessage, {
        category: 'task-manager',
        details: {
          remoteId: task.remoteId,
          stage: 'rollback'
        },
        taskId: task.id
      })

      return taskWithRollbackError
    }
  }

  private maybeLogStalledTask(previousTask: DownloadTask, nextTask: DownloadTask): void {
    const isPotentiallyStalled =
      ['metadata', 'downloading'].includes(nextTask.status) &&
      nextTask.speedBytes === 0 &&
      nextTask.downloadedBytes === previousTask.downloadedBytes

    if (!isPotentiallyStalled) {
      this.lastStallLoggedAt.delete(nextTask.id)
      return
    }

    const now = Date.now()
    const lastLoggedAt = this.lastStallLoggedAt.get(nextTask.id) ?? 0

    if (now - lastLoggedAt < TASK_STALL_LOG_INTERVAL_MS) {
      return
    }

    this.lastStallLoggedAt.set(nextTask.id, now)
    this.logger.warning('Task has no progress and zero download speed', {
      category: 'task-manager',
      details: {
        downloadedBytes: nextTask.downloadedBytes,
        remoteId: nextTask.remoteId ?? null,
        savePath: nextTask.savePath,
        status: nextTask.status,
        totalBytes: nextTask.totalBytes ?? null
      },
      taskId: nextTask.id
    })
  }
}
