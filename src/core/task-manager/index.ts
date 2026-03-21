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

  createTask(input: CreateDownloadTaskInput): DownloadTask {
    const task = createPendingMagnetTask(input)

    this.tasks.set(task.id, task)

    return task
  }

  listTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
  }

  pauseTask(input: TaskIdInput): void {
    const task = this.getTaskOrThrow(input.taskId)
    const nextStatus = task.status === 'completed' ? task.status : 'paused'

    this.tasks.set(task.id, updateTask(task, { status: nextStatus }))
  }

  resumeTask(input: TaskIdInput): void {
    const task = this.getTaskOrThrow(input.taskId)
    const nextStatus = task.status === 'completed' ? task.status : 'pending'

    this.tasks.set(task.id, updateTask(task, { status: nextStatus }))
  }

  deleteTask(input: DeleteTaskInput): void {
    this.getTaskOrThrow(input.taskId)
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
