import type { DownloadRuntime } from '../runtime/download-runtime'
import { isFinishedDownloadTaskStatus, type DiagnosticSummary, type DownloadTask } from '../../types'

const DEFAULT_WAIT_INTERVAL_MS = 1_000
const DEFAULT_WAIT_TIMEOUT_MS = 30_000

type DownloadAutomationCommandName = 'create' | 'list' | 'wait' | 'diagnostics' | 'delete'

interface CreateCommand {
  name: 'create'
  source: string
  savePath: string
  taskName?: string
}

interface ListCommand {
  name: 'list'
}

interface WaitCommand {
  name: 'wait'
  taskId: string
  timeoutMs: number
  intervalMs: number
}

interface DiagnosticsCommand {
  name: 'diagnostics'
}

interface DeleteCommand {
  name: 'delete'
  taskId: string
}

type DownloadAutomationCommand =
  | CreateCommand
  | ListCommand
  | WaitCommand
  | DiagnosticsCommand
  | DeleteCommand

interface DownloadAutomationIo {
  stdout: { write: (message: string) => void }
  stderr: { write: (message: string) => void }
}

interface DownloadAutomationDependencies {
  createRuntime?: () => Promise<DownloadRuntime>
  delay?: (ms: number) => Promise<void>
  io?: DownloadAutomationIo
}

interface DownloadAutomationSuccessResult {
  ok: true
  command: DownloadAutomationCommandName
  data: unknown
}

interface DownloadAutomationErrorResult {
  ok: false
  command?: DownloadAutomationCommandName
  error: {
    message: string
  }
}

type DownloadAutomationResult = DownloadAutomationSuccessResult | DownloadAutomationErrorResult

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readRequiredValue(argv: string[], index: number, name: string): string {
  const value = argv[index]?.trim()

  if (!value) {
    throw new Error(`缺少参数：${name}`)
  }

  return value
}

function readOptionValue(argv: string[], index: number, name: string): string {
  return readRequiredValue(argv, index + 1, name)
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数`)
  }

  return parsed
}

export function parseDownloadAutomationCommand(argv: string[]): DownloadAutomationCommand {
  const commandName = argv[0]?.trim()

  if (!commandName) {
    throw new Error('缺少命令。可用命令：create, list, wait, diagnostics, delete')
  }

  switch (commandName) {
    case 'create': {
      const source = readRequiredValue(argv, 1, 'source')
      let savePath: string | undefined
      let taskName: string | undefined

      for (let index = 2; index < argv.length; index += 1) {
        const current = argv[index]

        if (current === '--save-path') {
          savePath = readOptionValue(argv, index, '--save-path')
          index += 1
          continue
        }

        if (current === '--name') {
          taskName = readOptionValue(argv, index, '--name')
          index += 1
          continue
        }

        throw new Error(`未知参数：${current}`)
      }

      if (!savePath) {
        throw new Error('create 命令必须提供 --save-path')
      }

      return {
        name: 'create',
        source,
        savePath,
        taskName
      }
    }

    case 'list':
      return { name: 'list' }

    case 'wait': {
      const taskId = readRequiredValue(argv, 1, 'taskId')
      let timeoutMs = DEFAULT_WAIT_TIMEOUT_MS
      let intervalMs = DEFAULT_WAIT_INTERVAL_MS

      for (let index = 2; index < argv.length; index += 1) {
        const current = argv[index]

        if (current === '--timeout-ms') {
          timeoutMs = parsePositiveInteger(
            readOptionValue(argv, index, '--timeout-ms'),
            '--timeout-ms'
          )
          index += 1
          continue
        }

        if (current === '--interval-ms') {
          intervalMs = parsePositiveInteger(
            readOptionValue(argv, index, '--interval-ms'),
            '--interval-ms'
          )
          index += 1
          continue
        }

        throw new Error(`未知参数：${current}`)
      }

      return {
        name: 'wait',
        taskId,
        timeoutMs,
        intervalMs
      }
    }

    case 'diagnostics':
      return { name: 'diagnostics' }

    case 'delete':
      return {
        name: 'delete',
        taskId: readRequiredValue(argv, 1, 'taskId')
      }

    default:
      throw new Error(`未知命令：${commandName}`)
  }
}

async function buildDiagnostics(runtime: DownloadRuntime): Promise<DiagnosticSummary> {
  const tasks = await runtime.taskManager.listTasks()
  return runtime.diagnosticsService.getSummary(tasks, runtime.logger.listEntries())
}

function findTaskById(tasks: DownloadTask[], taskId: string): DownloadTask {
  const task = tasks.find((item) => item.id === taskId)

  if (!task) {
    throw new Error(`任务不存在：${taskId}`)
  }

  return task
}

async function runWaitCommand(
  command: WaitCommand,
  runtime: DownloadRuntime,
  waitDelay: (ms: number) => Promise<void>
): Promise<{
  task: DownloadTask
  timedOut: boolean
  diagnostics: DiagnosticSummary
}> {
  const deadline = Date.now() + command.timeoutMs

  while (true) {
    const tasks = await runtime.taskManager.listTasks()
    const task = findTaskById(tasks, command.taskId)

    if (isFinishedDownloadTaskStatus(task.status)) {
      return {
        task,
        timedOut: false,
        diagnostics: await runtime.diagnosticsService.getSummary(tasks, runtime.logger.listEntries())
      }
    }

    if (Date.now() >= deadline) {
      return {
        task,
        timedOut: true,
        diagnostics: await runtime.diagnosticsService.getSummary(tasks, runtime.logger.listEntries())
      }
    }

    await waitDelay(command.intervalMs)
  }
}

export async function runDownloadAutomationCommand(
  argv: string[],
  dependencies: DownloadAutomationDependencies = {}
): Promise<DownloadAutomationResult> {
  const command = parseDownloadAutomationCommand(argv)
  const createRuntime = dependencies.createRuntime

  if (!createRuntime) {
    throw new Error('未提供 runtime 创建器，当前只能作为内部 harness 被调用。')
  }

  const runtime = await createRuntime()

  try {
    switch (command.name) {
      case 'create': {
        const task = await runtime.taskManager.createTask({
          source: command.source,
          savePath: command.savePath,
          name: command.taskName
        })

        return {
          ok: true,
          command: command.name,
          data: {
            task
          }
        }
      }

      case 'list': {
        const tasks = await runtime.taskManager.listTasks()

        return {
          ok: true,
          command: command.name,
          data: {
            tasks
          }
        }
      }

      case 'wait': {
        const result = await runWaitCommand(command, runtime, dependencies.delay ?? delay)

        return {
          ok: true,
          command: command.name,
          data: result
        }
      }

      case 'diagnostics': {
        const diagnostics = await buildDiagnostics(runtime)

        return {
          ok: true,
          command: command.name,
          data: {
            diagnostics
          }
        }
      }

      case 'delete':
        await runtime.taskManager.deleteTask({ taskId: command.taskId })

        return {
          ok: true,
          command: command.name,
          data: {
            taskId: command.taskId
          }
        }
    }
  } catch (error) {
    return {
      ok: false,
      command: command.name,
      error: {
        message: error instanceof Error ? error.message : '命令执行失败'
      }
    }
  } finally {
    runtime.stop()
  }
}

function writeJson(target: DownloadAutomationIo['stdout'] | DownloadAutomationIo['stderr'], data: unknown): void {
  target.write(`${JSON.stringify(data, null, 2)}\n`)
}

export async function executeDownloadAutomationCommand(
  argv: string[],
  dependencies: DownloadAutomationDependencies = {}
): Promise<number> {
  const io = dependencies.io ?? process

  try {
    const result = await runDownloadAutomationCommand(argv, dependencies)

    if (result.ok) {
      writeJson(io.stdout, result)
      return 0
    }

    writeJson(io.stderr, result)
    return 1
  } catch (error) {
    const result: DownloadAutomationErrorResult = {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : '命令解析失败'
      }
    }

    writeJson(io.stderr, result)
    return 1
  }
}

export type { DownloadAutomationDependencies, DownloadAutomationResult, DownloadAutomationSuccessResult }
