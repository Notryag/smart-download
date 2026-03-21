import { btSessionStateToTaskStatus, type BtAdapter, type BtTaskSnapshot } from '../../adapters'
import type { InMemoryLogger } from '../logger'
import type {
  CreateDownloadTaskInput,
  DeleteTaskInput,
  DownloadTask,
  TaskIdInput
} from '../../types'

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
    engine: 'bt',
    status: 'pending',
    savePath: input.savePath.trim(),
    progress: 0,
    speedBytes: 0,
    downloadedBytes: 0,
    createdAt: now,
    updatedAt: now
  }
}

export class InMemoryTaskManager {
  private readonly tasks = new Map<string, DownloadTask>()

  constructor(
    private readonly btAdapter: BtAdapter,
    private readonly logger: InMemoryLogger
  ) {}

  async createTask(input: CreateDownloadTaskInput): Promise<DownloadTask> {
    const task = createPendingMagnetTask(input)
    this.tasks.set(task.id, task)
    this.logger.info('Created pending magnet task', task.id)

    try {
      await this.btAdapter.attachTask({
        taskId: task.id,
        source: task.source,
        savePath: task.savePath,
        name: task.name
      })

      const startedSnapshot = await this.btAdapter.startTask({ taskId: task.id })
      const startedTask = applySnapshot(task, startedSnapshot)

      this.tasks.set(task.id, startedTask)
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

      throw error
    }
  }

  async listTasks(): Promise<DownloadTask[]> {
    const taskEntries = await Promise.all(
      Array.from(this.tasks.values()).map(async (task) => {
        try {
          const snapshot = await this.btAdapter.getTaskSnapshot({ taskId: task.id })
          const syncedTask = applySnapshot(task, snapshot)
          const statusChanged = syncedTask.status !== task.status
          const progressChanged = syncedTask.progress !== task.progress

          if (statusChanged || progressChanged) {
            this.logger.info(
              `Synced task state: ${syncedTask.status} (${Math.round(syncedTask.progress * 100)}%)`,
              task.id
            )
          }

          return [task.id, syncedTask] as const
        } catch (error) {
          const message = getErrorMessage(error, '同步任务状态失败')
          const failedTask = updateTask(task, {
            status: 'failed',
            errorMessage: message
          })
          this.logger.error(message, task.id)

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

  async pauseTask(input: TaskIdInput): Promise<void> {
    const task = this.getTaskOrThrow(input.taskId)
    try {
      const snapshot = await this.btAdapter.pauseTask(input)
      const pausedTask = applySnapshot(task, snapshot)

      this.tasks.set(task.id, pausedTask)
      this.logger.info('Paused task', task.id)
    } catch (error) {
      const message = getErrorMessage(error, '暂停任务失败')
      this.tasks.set(
        task.id,
        updateTask(task, {
          errorMessage: message
        })
      )
      this.logger.error(message, task.id)
      throw error
    }
  }

  async resumeTask(input: TaskIdInput): Promise<void> {
    const task = this.getTaskOrThrow(input.taskId)
    try {
      const snapshot = await this.btAdapter.resumeTask(input)
      const resumedTask = applySnapshot(task, snapshot)

      this.tasks.set(task.id, resumedTask)
      this.logger.info('Resumed task', task.id)
    } catch (error) {
      const message = getErrorMessage(error, '恢复任务失败')
      this.tasks.set(
        task.id,
        updateTask(task, {
          errorMessage: message
        })
      )
      this.logger.error(message, task.id)
      throw error
    }
  }

  async deleteTask(input: DeleteTaskInput): Promise<void> {
    this.getTaskOrThrow(input.taskId)

    await this.btAdapter.deleteTask(input)
    this.tasks.delete(input.taskId)
    this.logger.info('Deleted task', input.taskId)
  }

  private getTaskOrThrow(taskId: string): DownloadTask {
    const task = this.tasks.get(taskId)

    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    return task
  }
}
