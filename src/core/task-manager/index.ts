import { btSessionStateToTaskStatus, type BtAdapter } from '../../adapters'
import type {
  CreateDownloadTaskInput,
  DeleteTaskInput,
  DownloadTask,
  TaskIdInput
} from '../../types'

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

  constructor(private readonly btAdapter: BtAdapter) {}

  async createTask(input: CreateDownloadTaskInput): Promise<DownloadTask> {
    const task = createPendingMagnetTask(input)

    await this.btAdapter.attachTask({
      taskId: task.id,
      source: task.source,
      savePath: task.savePath,
      name: task.name
    })

    const startedSession = await this.btAdapter.startTask({ taskId: task.id })
    const startedTask = updateTask(task, {
      status: btSessionStateToTaskStatus(startedSession.state)
    })

    this.tasks.set(task.id, startedTask)

    return startedTask
  }

  listTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
  }

  async pauseTask(input: TaskIdInput): Promise<void> {
    const task = this.getTaskOrThrow(input.taskId)
    const session = await this.btAdapter.pauseTask(input)
    const nextStatus =
      task.status === 'completed' ? task.status : btSessionStateToTaskStatus(session.state)

    this.tasks.set(task.id, updateTask(task, { status: nextStatus }))
  }

  async resumeTask(input: TaskIdInput): Promise<void> {
    const task = this.getTaskOrThrow(input.taskId)
    const session = await this.btAdapter.resumeTask(input)
    const nextStatus =
      task.status === 'completed' ? task.status : btSessionStateToTaskStatus(session.state)

    this.tasks.set(task.id, updateTask(task, { status: nextStatus }))
  }

  async deleteTask(input: DeleteTaskInput): Promise<void> {
    this.getTaskOrThrow(input.taskId)

    await this.btAdapter.deleteTask(input)

    this.tasks.delete(input.taskId)
  }

  private getTaskOrThrow(taskId: string): DownloadTask {
    const task = this.tasks.get(taskId)

    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    return task
  }
}
