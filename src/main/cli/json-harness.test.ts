import { describe, expect, it, vi } from 'vitest'

import {
  executeDownloadAutomationCommand,
  parseDownloadAutomationCommand,
  runDownloadAutomationCommand
} from './json-harness'
import type { DownloadRuntime } from '../runtime/download-runtime'
import type { DownloadTask, DiagnosticSummary } from '../../types'

type RuntimeLogger = Pick<DownloadRuntime['logger'], 'listEntries'>
type RuntimeTaskStore = Pick<
  DownloadRuntime['taskStore'],
  'close' | 'upsertTask' | 'listTasks' | 'deleteTask'
>
type RuntimeTaskManager = Pick<
  DownloadRuntime['taskManager'],
  'createTask' | 'listTasks' | 'getTasks' | 'pauseTask' | 'resumeTask' | 'deleteTask'
>
type RuntimeDiagnosticsService = Pick<DownloadRuntime['diagnosticsService'], 'getSummary'>
type RuntimeManagedAria2Service = Pick<DownloadRuntime['managedAria2Service'], 'stop'>

interface RuntimeStubPatch {
  logger?: Partial<RuntimeLogger>
  taskStore?: Partial<RuntimeTaskStore>
  taskManager?: Partial<RuntimeTaskManager>
  diagnosticsService?: Partial<RuntimeDiagnosticsService>
  managedAria2Service?: Partial<RuntimeManagedAria2Service>
}

function createTask(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: 'task-1',
    name: 'Ubuntu ISO',
    type: 'magnet',
    source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
    engine: 'aria2',
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

function createDiagnostics(total = 0): DiagnosticSummary {
  return {
    checkedAt: '2026-03-21T12:01:00.000Z',
    overview: 'ok',
    runtime: {
      ready: true,
      client: 'aria2',
      message: 'ok'
    },
    taskStats: {
      total,
      active: total,
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
        reason: 'ok',
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

function createRuntimeStub(patch: RuntimeStubPatch = {}): DownloadRuntime {
  const stop = vi.fn()
  const logger: RuntimeLogger = {
    listEntries: vi.fn(() => [])
  }
  Object.assign(logger, patch.logger)
  const taskStore: RuntimeTaskStore =
    {
      close: vi.fn(),
      upsertTask: vi.fn(async () => {}),
      listTasks: vi.fn(async () => []),
      deleteTask: vi.fn(async () => {})
    }
  Object.assign(taskStore, patch.taskStore)
  const taskManager: RuntimeTaskManager =
    {
      createTask: vi.fn(),
      listTasks: vi.fn(async () => []),
      getTasks: vi.fn(() => []),
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      deleteTask: vi.fn()
    }
  Object.assign(taskManager, patch.taskManager)
  const diagnosticsService: RuntimeDiagnosticsService =
    {
      getSummary: vi.fn(async () => createDiagnostics())
    }
  Object.assign(diagnosticsService, patch.diagnosticsService)
  const managedAria2Service: RuntimeManagedAria2Service =
    {
      stop
    }
  Object.assign(managedAria2Service, patch.managedAria2Service)

  return {
    logger: logger as DownloadRuntime['logger'],
    taskStore: taskStore as DownloadRuntime['taskStore'],
    taskManager: taskManager as DownloadRuntime['taskManager'],
    diagnosticsService: diagnosticsService as DownloadRuntime['diagnosticsService'],
    managedAria2Service: managedAria2Service as DownloadRuntime['managedAria2Service'],
    stop
  }
}

describe('json harness', () => {
  it('parses the supported commands and validates required arguments', () => {
    expect(parseDownloadAutomationCommand(['create', 'magnet:?xt=urn:btih:1', '--save-path', 'D:\\Downloads'])).toMatchObject({
      name: 'create',
      source: 'magnet:?xt=urn:btih:1',
      savePath: 'D:\\Downloads'
    })
    expect(parseDownloadAutomationCommand(['list'])).toEqual({ name: 'list' })
    expect(parseDownloadAutomationCommand(['wait', 'task-1', '--timeout-ms', '100', '--interval-ms', '10'])).toMatchObject({
      name: 'wait',
      taskId: 'task-1',
      timeoutMs: 100,
      intervalMs: 10
    })
    expect(parseDownloadAutomationCommand(['diagnostics'])).toEqual({ name: 'diagnostics' })
    expect(parseDownloadAutomationCommand(['delete', 'task-1'])).toEqual({
      name: 'delete',
      taskId: 'task-1'
    })
    expect(() => parseDownloadAutomationCommand([])).toThrow('缺少命令')
    expect(() => parseDownloadAutomationCommand(['create'])).toThrow('缺少参数：source')
    expect(() => parseDownloadAutomationCommand(['wait'])).toThrow('缺少参数：taskId')
    expect(() => parseDownloadAutomationCommand(['create', 'magnet:?xt=urn:btih:1', '--save-path'])).toThrow(
      '缺少参数：--save-path'
    )
  })

  it('runs commands against an injected runtime and returns structured results', async () => {
    const snapshots = [createTask({ status: 'metadata' }), createTask({ status: 'completed' })]
    const runtime = createRuntimeStub({
      taskManager: {
        createTask: vi.fn(async (input) => createTask({ source: input.source, savePath: input.savePath })),
        listTasks: vi.fn(async () => [snapshots.shift() ?? createTask({ status: 'completed' })]),
        getTasks: vi.fn(() => [createTask()]),
        deleteTask: vi.fn(async () => {})
      },
      diagnosticsService: {
        getSummary: vi.fn(async () => createDiagnostics(1))
      }
    })

    await expect(
      runDownloadAutomationCommand(['create', 'magnet:?xt=urn:btih:1', '--save-path', 'D:\\Downloads'], {
        createRuntime: async () => runtime
      })
    ).resolves.toMatchObject({
      ok: true,
      command: 'create',
      data: {
        task: expect.objectContaining({
          id: 'task-1'
        })
      }
    })

    await expect(
      runDownloadAutomationCommand(['list'], {
        createRuntime: async () => runtime
      })
    ).resolves.toMatchObject({
      ok: true,
      command: 'list',
      data: {
        tasks: [expect.objectContaining({ id: 'task-1' })]
      }
    })

    await expect(
      runDownloadAutomationCommand(['wait', 'task-1', '--timeout-ms', '100', '--interval-ms', '10'], {
        createRuntime: async () => runtime,
        delay: vi.fn(async () => {})
      })
    ).resolves.toMatchObject({
      ok: true,
      command: 'wait',
      data: {
        task: expect.objectContaining({
          id: 'task-1',
          status: 'completed'
        }),
        timedOut: false
      }
    })

    await expect(
      runDownloadAutomationCommand(['diagnostics'], {
        createRuntime: async () => runtime
      })
    ).resolves.toMatchObject({
      ok: true,
      command: 'diagnostics',
      data: {
        diagnostics: expect.objectContaining({
          taskStats: expect.objectContaining({
            total: 1
          })
        })
      }
    })

    await expect(
      runDownloadAutomationCommand(['delete', 'task-1'], {
        createRuntime: async () => runtime
      })
    ).resolves.toMatchObject({
      ok: true,
      command: 'delete',
      data: {
        taskId: 'task-1'
      }
    })
  })

  it('writes JSON success and error payloads through the CLI entry point', async () => {
    const stdoutWrites: string[] = []
    const stderrWrites: string[] = []
    const runtime = createRuntimeStub({
      taskManager: {
        listTasks: vi.fn(async () => [])
      }
    })

    const exitCode = await executeDownloadAutomationCommand(['list'], {
      createRuntime: async () => runtime,
      io: {
        stdout: { write: (message: string) => stdoutWrites.push(message) },
        stderr: { write: (message: string) => stderrWrites.push(message) }
      }
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdoutWrites[0] ?? '{}')).toMatchObject({
      ok: true,
      command: 'list'
    })
    expect(stderrWrites).toHaveLength(0)

    const errorStdoutWrites: string[] = []
    const errorStderrWrites: string[] = []
    const errorExitCode = await executeDownloadAutomationCommand(['delete'], {
      createRuntime: async () => runtime,
      io: {
        stdout: { write: (message: string) => errorStdoutWrites.push(message) },
        stderr: { write: (message: string) => errorStderrWrites.push(message) }
      }
    })

    expect(errorExitCode).toBe(1)
    expect(errorStdoutWrites).toHaveLength(0)
    expect(JSON.parse(errorStderrWrites[0] ?? '{}')).toMatchObject({
      ok: false,
      error: {
        message: '缺少参数：taskId'
      }
    })
  })

  it('rejects direct execution without an injected runtime factory', async () => {
    await expect(runDownloadAutomationCommand(['list'])).rejects.toThrow(
      '未提供 runtime 创建器，当前只能作为内部 harness 被调用。'
    )
  })
})
