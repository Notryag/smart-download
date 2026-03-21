import { btSessionStateToTaskStatus, type BtAdapter, type BtTaskSnapshot } from '../../adapters'
import type { InMemoryLogger } from '../logger'
import type { NetworkChecker } from '../network'
import type { DownloadTaskStore } from '../../storage'
import {
  isFinishedDownloadTaskStatus,
  type CreateDownloadTaskInput,
  type DeleteTaskInput,
  type DownloadTask,
  type TaskIdInput
} from '../../types'

const RESTART_RECOVERY_MESSAGE = '应用重启后下载已停止，请手动恢复任务'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function buildTaskName(input: CreateDownloadTaskInput): string {
  const trimmedName = input.name?.trim()

  if (trimmedName) {
    return trimmedName
  }

  return 'Magnet Task'
}

function assertTaskField(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required`)
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

function applySnapshot(task: DownloadTask, snapshot: BtTaskSnapshot): DownloadTask {
  return updateTask(task, {
    status: btSessionStateToTaskStatus(snapshot.state),
    progress: snapshot.progress,
    downloadedBytes: snapshot.downloadedBytes,
    totalBytes: snapshot.totalBytes,
    speedBytes: snapshot.speedBytes,
    etaSeconds: snapshot.etaSeconds,
    errorMessage: undefined
  })
}

export function createPendingMagnetTask(input: CreateDownloadTaskInput): DownloadTask {
  assertTaskField(input.source, 'source')
  assertTaskField(input.savePath, 'savePath')

  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    name: buildTaskName(input),
    type: 'magnet',
    source: input.source.trim(),
    engine: 'qbittorrent',
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
    private readonly btAdapter: BtAdapter,
    private readonly logger: InMemoryLogger,
    private readonly taskStore: DownloadTaskStore,
    private readonly networkChecker: NetworkChecker
  ) {}

  async restoreTasks(): Promise<void> {
    const persistedTasks = await this.taskStore.listTasks()

    for (const task of persistedTasks) {
      const restoredTask = restoreTaskState(task)
      this.tasks.set(restoredTask.id, restoredTask)

      if (restoredTask !== task) {
        await this.taskStore.upsertTask(restoredTask)
      }

      if (needsRuntimeSession(restoredTask)) {
        await this.btAdapter.hydrateTask(restoredTask)
      }
    }

    this.logger.info(`Restored ${persistedTasks.length} persisted tasks`)
  }

  async createTask(input: CreateDownloadTaskInput): Promise<DownloadTask> {
    const task = createPendingMagnetTask(input)
    this.tasks.set(task.id, task)
    this.logger.info('Created pending magnet task', task.id)
    await this.taskStore.upsertTask(task)

    try {
      await this.networkChecker.assertBtNetworkReady()

      await this.btAdapter.attachTask({
        taskId: task.id,
        source: task.source,
        savePath: task.savePath,
        name: task.name
      })

      const startedSnapshot = await this.btAdapter.startTask({ taskId: task.id })
      const startedTask = applySnapshot(task, startedSnapshot)

      this.tasks.set(task.id, startedTask)
      await this.taskStore.upsertTask(startedTask)
      this.logger.info(`Started task in ${startedTask.status} state`, task.id)

      return startedTask
    } catch (error) {
      const message = getErrorMessage(error, '创建下载任务失败')
      const failedTask = updateTask(task, {
        status: 'failed',
        errorMessage: message
      })

      this.tasks.set(task.id, failedTask)
      this.logger.error(message, task.id)
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
          const snapshot = await this.btAdapter.getTaskSnapshot({ taskId: task.id })
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
      const snapshot = await this.btAdapter.pauseTask(input)
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
      await this.networkChecker.assertBtNetworkReady()

      const snapshot = await this.btAdapter.resumeTask(input)
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
      await this.btAdapter.deleteTask(input)
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
}
