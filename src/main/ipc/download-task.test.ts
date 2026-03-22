import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LogEntry } from '../../core'
import type { DownloadTask, DownloadDashboardSnapshot } from '../../types'
import { DOWNLOAD_TASK_IPC_CHANNELS } from '../../types'
import { registerDownloadTaskIpc } from './download-task'

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const windows: Array<{
    isDestroyed: ReturnType<typeof vi.fn>
    webContents: {
      send: ReturnType<typeof vi.fn>
    }
  }> = []
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler)
    })
  }
  const dialog = {
    showOpenDialog: vi.fn()
  }
  const BrowserWindow = {
    fromWebContents: vi.fn(),
    getAllWindows: vi.fn(() => windows)
  }

  return {
    handlers,
    windows,
    ipcMain,
    dialog,
    BrowserWindow
  }
})

vi.mock('electron', () => ({
  BrowserWindow: electronMocks.BrowserWindow,
  dialog: electronMocks.dialog,
  ipcMain: electronMocks.ipcMain
}))

function createTask(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: 'task-1',
    name: 'Ubuntu ISO',
    type: 'magnet',
    source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
    engine: 'aria2',
    remoteId: 'gid-1',
    status: 'downloading',
    savePath: 'D:\\Downloads',
    progress: 0.25,
    speedBytes: 5,
    downloadedBytes: 25,
    totalBytes: 100,
    createdAt: '2026-03-21T12:00:00.000Z',
    updatedAt: '2026-03-21T12:01:00.000Z',
    ...patch
  }
}

function createDiagnostics(): DownloadDashboardSnapshot['diagnostics'] {
  return {
    checkedAt: '2026-03-21T12:01:00.000Z',
    overview: '当前有 1 个任务正在运行。',
    runtime: {
      ready: true,
      client: 'aria2',
      message: 'ok'
    },
    taskStats: {
      total: 1,
      active: 1,
      paused: 0,
      failed: 0,
      completed: 0
    },
    highlights: [],
    recentLogs: []
  }
}

function createWindow(destroyed = false): (typeof electronMocks.windows)[number] {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      send: vi.fn()
    }
  }
}

function createHarness(taskList: DownloadTask[] = [createTask()]): {
  taskList: DownloadTask[]
  taskManager: {
    createTask: ReturnType<typeof vi.fn>
    listTasks: ReturnType<typeof vi.fn>
    getTasks: ReturnType<typeof vi.fn>
    pauseTask: ReturnType<typeof vi.fn>
    resumeTask: ReturnType<typeof vi.fn>
    deleteTask: ReturnType<typeof vi.fn>
  }
  diagnosticsService: {
    getSummary: ReturnType<typeof vi.fn>
  }
  listLogs: () => LogEntry[]
} {
  const diagnostics = createDiagnostics()
  const taskManager = {
    createTask: vi.fn(async () => taskList[0]),
    listTasks: vi.fn(async () => taskList),
    getTasks: vi.fn(() => taskList),
    pauseTask: vi.fn(async () => {}),
    resumeTask: vi.fn(async () => {}),
    deleteTask: vi.fn(async () => {})
  }
  const diagnosticsService = {
    getSummary: vi.fn(async () => diagnostics)
  }
  const listLogs = vi.fn((): LogEntry[] => [])

  return {
    taskList,
    taskManager,
    diagnosticsService,
    listLogs
  }
}

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const handler = electronMocks.handlers.get(channel)

  if (!handler) {
    throw new Error(`IPC handler not registered: ${channel}`)
  }

  return handler
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('registerDownloadTaskIpc', () => {
  let intervalCallback: (() => void) | undefined
  let intervalUnref: ReturnType<typeof vi.fn>

  beforeEach(() => {
    intervalCallback = undefined
    intervalUnref = vi.fn()
    electronMocks.handlers.clear()
    electronMocks.windows.length = 0
    electronMocks.ipcMain.handle.mockClear()
    electronMocks.dialog.showOpenDialog.mockReset()
    electronMocks.BrowserWindow.fromWebContents.mockReset()
    electronMocks.BrowserWindow.getAllWindows.mockClear()

    vi.spyOn(globalThis, 'setInterval').mockImplementation((handler: TimerHandler) => {
      intervalCallback = handler as () => void
      return {
        unref: intervalUnref
      } as unknown as ReturnType<typeof setInterval>
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    electronMocks.handlers.clear()
    electronMocks.windows.length = 0
  })

  it('creates a task and pushes the dashboard snapshot to active windows', async () => {
    const activeWindow = createWindow()
    const destroyedWindow = createWindow(true)
    electronMocks.windows.push(activeWindow, destroyedWindow)
    const harness = createHarness()

    registerDownloadTaskIpc(
      harness.taskManager as never,
      harness.diagnosticsService as never,
      harness.listLogs
    )

    const createHandler = getHandler(DOWNLOAD_TASK_IPC_CHANNELS.createTask)
    const result = await createHandler({}, {
      source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
      savePath: 'D:\\Downloads'
    })

    expect(result).toEqual({ taskId: 'task-1' })
    expect(harness.taskManager.createTask).toHaveBeenCalledOnce()
    expect(activeWindow.webContents.send).toHaveBeenCalledWith(
      DOWNLOAD_TASK_IPC_CHANNELS.dashboardUpdated,
      {
        tasks: harness.taskList,
        diagnostics: createDiagnostics()
      }
    )
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled()
    expect(intervalUnref).toHaveBeenCalledOnce()
  })

  it('returns the current dashboard snapshot from the dashboard handler', async () => {
    const harness = createHarness()

    registerDownloadTaskIpc(
      harness.taskManager as never,
      harness.diagnosticsService as never,
      harness.listLogs
    )

    const dashboard = await getHandler(DOWNLOAD_TASK_IPC_CHANNELS.getDashboard)()

    expect(dashboard).toEqual({
      tasks: harness.taskList,
      diagnostics: createDiagnostics()
    })
    expect(harness.taskManager.listTasks).toHaveBeenCalledOnce()
    expect(harness.diagnosticsService.getSummary).toHaveBeenCalledWith(harness.taskList, [])
  })

  it('opens a directory picker and returns the selected path', async () => {
    const harness = createHarness()
    const browserWindow = createWindow()
    electronMocks.BrowserWindow.fromWebContents.mockReturnValue(browserWindow)
    electronMocks.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['D:\\Downloads']
    })

    registerDownloadTaskIpc(
      harness.taskManager as never,
      harness.diagnosticsService as never,
      harness.listLogs
    )

    const pickDirectory = getHandler(DOWNLOAD_TASK_IPC_CHANNELS.pickDirectory)
    const result = await pickDirectory({
      sender: browserWindow.webContents
    })

    expect(result).toBe('D:\\Downloads')
    expect(electronMocks.BrowserWindow.fromWebContents).toHaveBeenCalledWith(browserWindow.webContents)
    expect(electronMocks.dialog.showOpenDialog).toHaveBeenCalledWith(browserWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
  })

  it.each([
    [DOWNLOAD_TASK_IPC_CHANNELS.pauseTask, 'pauseTask'],
    [DOWNLOAD_TASK_IPC_CHANNELS.resumeTask, 'resumeTask'],
    [DOWNLOAD_TASK_IPC_CHANNELS.deleteTask, 'deleteTask']
  ] as const)('pushes dashboard after %s', async (channel, methodName) => {
    const activeWindow = createWindow()
    electronMocks.windows.push(activeWindow)
    const harness = createHarness()

    registerDownloadTaskIpc(
      harness.taskManager as never,
      harness.diagnosticsService as never,
      harness.listLogs
    )

    await getHandler(channel)({}, { taskId: 'task-1' })

    expect(harness.taskManager[methodName]).toHaveBeenCalledWith({ taskId: 'task-1' })
    expect(activeWindow.webContents.send).toHaveBeenCalledWith(
      DOWNLOAD_TASK_IPC_CHANNELS.dashboardUpdated,
      {
        tasks: harness.taskList,
        diagnostics: createDiagnostics()
      }
    )
  })

  it('skips overlapping timer sync while a dashboard push is already in flight', async () => {
    const activeWindow = createWindow()
    electronMocks.windows.push(activeWindow)
    const harness = createHarness()
    let resolveListTasks: ((tasks: DownloadTask[]) => void) | undefined
    harness.taskManager.listTasks = vi.fn(
      () =>
        new Promise<DownloadTask[]>((resolve) => {
          resolveListTasks = resolve
        })
    )

    registerDownloadTaskIpc(
      harness.taskManager as never,
      harness.diagnosticsService as never,
      harness.listLogs
    )

    const createPromise = getHandler(DOWNLOAD_TASK_IPC_CHANNELS.createTask)({}, {
      source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
      savePath: 'D:\\Downloads'
    })
    await flushMicrotasks()
    intervalCallback?.()
    resolveListTasks?.(harness.taskList)

    await createPromise

    expect(harness.taskManager.listTasks).toHaveBeenCalledTimes(1)
    expect(activeWindow.webContents.send).toHaveBeenCalledTimes(1)
  })
})
