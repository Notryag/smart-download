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

function createTask(patch: Partial<DownloadTask> & Record<string, unknown> = {}): DownloadTask {
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
  } as DownloadTask
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
    taskFacts: [],
    facts: {
      slowTasks: [],
      bottlenecks: {
        metadataStallCount: 0,
        zeroSpeedCount: 0,
        peerSparseCount: 0,
        trackerSparseCount: 0
      },
      resourceHealth: {
        score: 100,
        level: 'healthy',
        reason: '当前没有发现明显的资源侧瓶颈。',
        dominantBottleneckCode: 'none',
        signals: {
          metadataStallCount: 0,
          zeroSpeedCount: 0,
          peerSparseCount: 0,
          trackerSparseCount: 0
        }
      }
    },
    guidance: [],
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

function resetElectronMocks(): void {
  electronMocks.handlers.clear()
  electronMocks.windows.length = 0
  electronMocks.ipcMain.handle.mockClear()
  electronMocks.dialog.showOpenDialog.mockReset()
  electronMocks.BrowserWindow.fromWebContents.mockReset()
  electronMocks.BrowserWindow.getAllWindows.mockClear()
}

function registerHarness(harness: ReturnType<typeof createHarness>): void {
  registerDownloadTaskIpc(
    harness.taskManager as never,
    harness.diagnosticsService as never,
    harness.listLogs
  )
}

function createStructuredDiagnosticsSnapshot(task: DownloadTask): DownloadDashboardSnapshot['diagnostics'] {
  return {
    ...createDiagnostics(),
    facts: {
      slowTasks: [
        {
          taskId: task.id,
          taskName: task.name,
          sourceType: 'magnet',
          status: task.status,
          seedersCount: 0,
          trackerCount: 2,
          resourceHealthScore: 30,
          resourceHealthLevel: 'critical',
          bottleneckCode: 'metadata_stall',
          peerAvailability: 'none',
          trackerHealth: 'normal',
          metadataElapsedMs: 120_000,
          zeroSpeedDurationMs: 120_000
        }
      ],
      bottlenecks: {
        metadataStallCount: 1,
        zeroSpeedCount: 1,
        peerSparseCount: 1,
        trackerSparseCount: 0
      },
      resourceHealth: {
        score: 30,
        level: 'critical',
        reason: '当前资源侧信号偏弱，建议降低速度预期。',
        dominantBottleneckCode: 'metadata_stall',
        signals: {
          metadataStallCount: 1,
          zeroSpeedCount: 1,
          peerSparseCount: 1,
          trackerSparseCount: 0
        }
      }
    },
    guidance: [
      {
        id: `guidance-${task.id}`,
        title: task.name,
        taskId: task.id,
        code: 'magnet_metadata_sparse_peers',
        severity: 'warning',
        shortMessage: '资源较冷，metadata 获取偏慢，当前 peer 不足。'
      }
    ]
  }
}

describe('registerDownloadTaskIpc', () => {
  let intervalCallback: (() => void) | undefined
  let intervalUnref: ReturnType<typeof vi.fn>

  beforeEach(() => {
    intervalCallback = undefined
    intervalUnref = vi.fn()
    resetElectronMocks()

    vi.spyOn(globalThis, 'setInterval').mockImplementation((handler: TimerHandler) => {
      intervalCallback = handler as () => void
      return {
        unref: intervalUnref
      } as unknown as ReturnType<typeof setInterval>
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetElectronMocks()
  })

  it('creates a task and pushes the dashboard snapshot to active windows', async () => {
    const activeWindow = createWindow()
    const destroyedWindow = createWindow(true)
    electronMocks.windows.push(activeWindow, destroyedWindow)
    const harness = createHarness()

    registerHarness(harness)

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

    registerHarness(harness)

    const dashboard = await getHandler(
      DOWNLOAD_TASK_IPC_CHANNELS.getDashboard
    )() as DownloadDashboardSnapshot

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

    registerHarness(harness)

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

    registerHarness(harness)

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

    registerHarness(harness)

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
  it('keeps structured task and diagnostic facts intact in dashboard snapshots', async () => {
    const activeWindow = createWindow()
    electronMocks.windows.push(activeWindow)
    const task = createTask({
      facts: {
        sourceType: 'magnet',
        seedersCount: 0,
        trackerCount: 2,
        resourceHealthScore: 30,
        resourceHealthLevel: 'critical',
        bottleneckCode: 'metadata_stall',
        peerAvailability: 'none',
        trackerHealth: 'normal',
        metadataElapsedMs: 120_000,
        zeroSpeedDurationMs: 120_000
      }
    }) as DownloadTask
    const harness = createHarness([task])
    const diagnostics = createStructuredDiagnosticsSnapshot(task)

    harness.diagnosticsService.getSummary = vi.fn(async () => diagnostics as never)

    registerHarness(harness)

    const dashboard = await getHandler(
      DOWNLOAD_TASK_IPC_CHANNELS.getDashboard
    )() as DownloadDashboardSnapshot

    expect(dashboard.tasks[0]?.facts).toMatchObject({
      sourceType: 'magnet',
      seedersCount: 0,
      trackerCount: 2,
      resourceHealthScore: 30,
      resourceHealthLevel: 'critical',
      bottleneckCode: 'metadata_stall',
      peerAvailability: 'none',
      trackerHealth: 'normal',
      metadataElapsedMs: 120_000,
      zeroSpeedDurationMs: 120_000
    })
    expect(dashboard.diagnostics.facts).toMatchObject({
      slowTasks: [
        {
          taskId: task.id,
          sourceType: 'magnet',
          seedersCount: 0,
          trackerCount: 2,
          resourceHealthScore: 30,
          resourceHealthLevel: 'critical',
          bottleneckCode: 'metadata_stall',
          peerAvailability: 'none',
          trackerHealth: 'normal',
          metadataElapsedMs: 120_000,
          zeroSpeedDurationMs: 120_000
        }
      ],
      resourceHealth: {
        score: 30,
        level: 'critical',
        dominantBottleneckCode: 'metadata_stall'
      }
    })
    expect(dashboard.diagnostics.guidance).toMatchObject([
      {
        taskId: task.id,
        code: 'magnet_metadata_sparse_peers',
        severity: 'warning',
        shortMessage: expect.any(String)
      }
    ])
    expect(activeWindow.webContents.send).not.toHaveBeenCalled()
  })
})
