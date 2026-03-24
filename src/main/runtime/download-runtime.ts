import { join } from 'node:path'
import { Aria2DownloadAdapter, type Aria2ClientConfig } from '../../adapters'
import { BasicDiagnosticsService, InMemoryLogger, InMemoryTaskManager } from '../../core'
import { SqliteDownloadTaskStore, type DownloadTaskStore } from '../../storage'
import { readAria2ClientConfig } from '../config/download-clients'
import { ManagedAria2Service, type ManagedAria2Paths } from './managed-aria2'

interface ClosableTaskStore extends DownloadTaskStore {
  close?: () => void
}

export interface DownloadRuntime {
  logger: InMemoryLogger
  taskStore: ClosableTaskStore
  taskManager: InMemoryTaskManager
  diagnosticsService: BasicDiagnosticsService
  managedAria2Service: ManagedAria2Service
  stop: () => void
}

export interface CreateDownloadRuntimeOptions {
  paths: ManagedAria2Paths
  logger?: InMemoryLogger
  taskStore?: ClosableTaskStore
  managedAria2Service?: ManagedAria2Service
  aria2ExternalConfig?: Aria2ClientConfig | null
}

const DEFAULT_ARIA2_UNAVAILABLE_MESSAGE =
  '未能连接内置 aria2。请确认资源目录中的 aria2c 二进制存在且可执行。'

export async function createDownloadRuntime(
  options: CreateDownloadRuntimeOptions
): Promise<DownloadRuntime> {
  const logger = options.logger ?? new InMemoryLogger()
  const taskStore =
    options.taskStore ??
    new SqliteDownloadTaskStore(join(options.paths.userDataPath, 'storage', 'download-tasks.sqlite'))
  const managedAria2Service =
    options.managedAria2Service ?? new ManagedAria2Service(options.paths, logger)
  const startup = await managedAria2Service.start(options.aria2ExternalConfig ?? readAria2ClientConfig())
  const aria2Adapter = new Aria2DownloadAdapter(
    startup.config,
    startup.unavailableMessage ?? DEFAULT_ARIA2_UNAVAILABLE_MESSAGE,
    logger
  )
  const taskManager = new InMemoryTaskManager(aria2Adapter, logger, taskStore)
  const diagnosticsService = new BasicDiagnosticsService(aria2Adapter)

  await taskManager.restoreTasks()

  return {
    logger,
    taskStore,
    taskManager,
    diagnosticsService,
    managedAria2Service,
    stop: () => {
      managedAria2Service.stop()
      taskStore.close?.()
    }
  }
}
