import { ipcMain } from 'electron'
import type { InMemoryTaskManager } from '../../core'
import { DOWNLOAD_TASK_IPC_CHANNELS, type DownloadTaskApi } from '../../types'

export function registerDownloadTaskIpc(taskManager: InMemoryTaskManager): void {
  ipcMain.handle(
    DOWNLOAD_TASK_IPC_CHANNELS.createTask,
    async (_event, input: Parameters<DownloadTaskApi['createTask']>[0]) => {
      const task = await taskManager.createTask(input)

      return { taskId: task.id }
    }
  )

  ipcMain.handle(DOWNLOAD_TASK_IPC_CHANNELS.listTasks, async () => {
    return taskManager.listTasks()
  })

  ipcMain.handle(
    DOWNLOAD_TASK_IPC_CHANNELS.pauseTask,
    async (_event, input: Parameters<DownloadTaskApi['pauseTask']>[0]) => {
      await taskManager.pauseTask(input)
    }
  )

  ipcMain.handle(
    DOWNLOAD_TASK_IPC_CHANNELS.resumeTask,
    async (_event, input: Parameters<DownloadTaskApi['resumeTask']>[0]) => {
      await taskManager.resumeTask(input)
    }
  )

  ipcMain.handle(
    DOWNLOAD_TASK_IPC_CHANNELS.deleteTask,
    async (_event, input: Parameters<DownloadTaskApi['deleteTask']>[0]) => {
      await taskManager.deleteTask(input)
    }
  )
}
