import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type WebContents } from 'electron'
import type { BasicDiagnosticsService, InMemoryTaskManager } from '../../core'
import {
  DOWNLOAD_TASK_IPC_CHANNELS,
  type DownloadTaskApi,
  type DownloadDashboardSnapshot
} from '../../types'
import type { LogEntry } from '../../core'

const DASHBOARD_PUSH_INTERVAL_MS = 1_000

export function registerDownloadTaskIpc(
  taskManager: InMemoryTaskManager,
  diagnosticsService: BasicDiagnosticsService,
  listLogs: () => LogEntry[]
): void {
  let syncInFlight = false

  async function buildDashboardSnapshot(): Promise<DownloadDashboardSnapshot> {
    const tasks = await taskManager.listTasks()
    const diagnostics = await diagnosticsService.getSummary(taskManager.getTasks(), listLogs())

    return {
      tasks,
      diagnostics
    }
  }

  async function pushDashboardSnapshot(target?: WebContents): Promise<void> {
    if (syncInFlight) {
      return
    }

    syncInFlight = true

    try {
      const snapshot = await buildDashboardSnapshot()

      if (target && !target.isDestroyed()) {
        target.send(DOWNLOAD_TASK_IPC_CHANNELS.dashboardUpdated, snapshot)
        return
      }

      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(DOWNLOAD_TASK_IPC_CHANNELS.dashboardUpdated, snapshot)
        }
      }
    } finally {
      syncInFlight = false
    }
  }

  ipcMain.handle(
    DOWNLOAD_TASK_IPC_CHANNELS.createTask,
    async (_event, input: Parameters<DownloadTaskApi['createTask']>[0]) => {
      const task = await taskManager.createTask(input)
      await pushDashboardSnapshot()

      return { taskId: task.id }
    }
  )

  ipcMain.handle(DOWNLOAD_TASK_IPC_CHANNELS.pickDirectory, async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory']
    }
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options)

    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(DOWNLOAD_TASK_IPC_CHANNELS.getDashboard, async () => {
    return buildDashboardSnapshot()
  })

  ipcMain.handle(DOWNLOAD_TASK_IPC_CHANNELS.listTasks, async () => {
    return taskManager.listTasks()
  })

  ipcMain.handle(DOWNLOAD_TASK_IPC_CHANNELS.getDiagnostics, async () => {
    return diagnosticsService.getSummary(taskManager.getTasks(), listLogs())
  })

  ipcMain.handle(
    DOWNLOAD_TASK_IPC_CHANNELS.pauseTask,
    async (_event, input: Parameters<DownloadTaskApi['pauseTask']>[0]) => {
      await taskManager.pauseTask(input)
      await pushDashboardSnapshot()
    }
  )

  ipcMain.handle(
    DOWNLOAD_TASK_IPC_CHANNELS.resumeTask,
    async (_event, input: Parameters<DownloadTaskApi['resumeTask']>[0]) => {
      await taskManager.resumeTask(input)
      await pushDashboardSnapshot()
    }
  )

  ipcMain.handle(
    DOWNLOAD_TASK_IPC_CHANNELS.deleteTask,
    async (_event, input: Parameters<DownloadTaskApi['deleteTask']>[0]) => {
      await taskManager.deleteTask(input)
      await pushDashboardSnapshot()
    }
  )

  const dashboardTimer = setInterval(() => {
    void pushDashboardSnapshot()
  }, DASHBOARD_PUSH_INTERVAL_MS)

  dashboardTimer.unref?.()
}
