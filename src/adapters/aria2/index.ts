import type {
  DownloadAdapter,
  DownloadAdapterRuntimeStatus,
  DownloadAdapterSession,
  DownloadTaskSnapshot
} from '../download'
import type { DownloadTask, TaskIdInput } from '../../types'
import type { LogContext } from '../../core'
import type { Aria2ClientConfig, Aria2TellStatusResult } from './types'
import { Aria2RuntimeSessionStore } from './runtime-session-store'
import { filterRelatedTasksBySource } from './source-match'
import { attachUriWithDuplicateCleanup } from './attach-with-cleanup'
import { Aria2StateWaiter } from './state-waiter'
import { Aria2RpcClient } from './rpc-client'
import {
  ARIA2_DIAGNOSTIC_LOG_INTERVAL_MS,
  assertSource,
  buildSnapshot,
  buildAddUriOptions,
  normalizeMagnetSourceForAria2,
  buildSourcePreview,
  getErrorMessage,
  isMissingGidErrorMessage,
  isSettledTaskStatus,
  toIsoNow,
  toRuntimeStatusMessage
} from './utils'

interface AdapterLogger {
  info(message: string, context?: LogContext | string): void
  warning(message: string, context?: LogContext | string): void
  error(message: string, context?: LogContext | string): void
}

const ARIA2_SCAN_LIMIT = 1000

export class Aria2DownloadAdapter implements DownloadAdapter {
  private readonly client: Aria2RpcClient | null
  private readonly sessionStore = new Aria2RuntimeSessionStore()
  private readonly stateWaiter: Aria2StateWaiter
  private readonly lastTaskErrorLog = new Map<string, string>()
  private readonly lastZeroSpeedLogAt = new Map<string, number>()
  private static readonly FOLLOWED_TASK_MAX_DEPTH = 4

  constructor(
    config: Aria2ClientConfig | null,
    private readonly unavailableMessage = '未配置 aria2 RPC。',
    private readonly logger?: AdapterLogger
  ) {
    this.client = config ? new Aria2RpcClient(config) : null
    this.stateWaiter = new Aria2StateWaiter(
      (input) => this.getTaskSnapshot(input),
      logger
    )
  }
  async getRuntimeStatus(): Promise<DownloadAdapterRuntimeStatus> {
    if (!this.client) {
      return {
        ready: false,
        client: 'aria2',
        message: this.unavailableMessage
      }
    }
    try {
      const version = await this.client.getVersion()
      if (!version.enabledFeatures.includes('BitTorrent')) {
        return {
          ready: false,
          client: 'aria2',
          message: `aria2 RPC 已连接，但未启用 BitTorrent 功能。当前无法下载 magnet 任务。`
        }
      }

      return {
        ready: true,
        client: 'aria2',
        message: `aria2 RPC 已连接，版本 ${version.version}，已启用 BitTorrent。`
      }
    } catch (error) {
      return {
        ready: false,
        client: 'aria2',
        message: toRuntimeStatusMessage(error)
      }
    }
  }

  async assertReady(): Promise<void> {
    const status = await this.getRuntimeStatus()

    if (!status.ready) {
      throw new Error(status.message)
    }
  }
  async attachTask(input: {
    taskId: string
    source: string
    savePath: string
    name?: string
  }): Promise<DownloadAdapterSession> {
    assertSource(input.source)
    const client = this.getClientOrThrow()
    const now = toIsoNow()
    const source = input.source.trim()
    const requestSource = normalizeMagnetSourceForAria2(source)
    const savePath = input.savePath.trim()
    const options = buildAddUriOptions(source, savePath)
    this.logger?.info('Submitting task to aria2 RPC', {
      category: 'aria2-adapter',
      details: {
        addedFallbackTrackers: requestSource.addedTrackerCount,
        trackerCount: requestSource.trackerCount,
        savePath,
        sourcePreview: buildSourcePreview(input.source)
      },
      taskId: input.taskId
    })
    const gid = await attachUriWithDuplicateCleanup({
      client,
      source: requestSource.source,
      options,
      taskId: input.taskId,
      logger: this.logger,
      cleanup: async () => this.cleanupRelatedTasksBySource(source)
    })
    const session = this.sessionStore.createSession({
      taskId: input.taskId,
      gid,
      source,
      savePath,
      createdAt: now,
      updatedAt: now
    })
    this.logger?.info('aria2 accepted task and returned remote GID', {
      category: 'aria2-adapter',
      details: {
        gid,
        savePath: session.savePath
      },
      taskId: input.taskId
    })

    const snapshot = await this.getTaskSnapshot({ taskId: input.taskId })
    return {
      id: crypto.randomUUID(),
      taskId: input.taskId,
      remoteId: gid,
      source: session.source,
      savePath: session.savePath,
      status: snapshot.status,
      totalBytes: snapshot.totalBytes,
      downloadedBytes: snapshot.downloadedBytes,
      speedBytes: snapshot.speedBytes,
      trackerCount: requestSource.trackerCount,
      fallbackTrackerCount: requestSource.addedTrackerCount,
      createdAt: now,
      updatedAt: snapshot.updatedAt
    }
  }

  async hydrateTask(task: DownloadTask): Promise<DownloadAdapterSession> {
    assertSource(task.source)
    const now = toIsoNow()
    const session = this.sessionStore.hydrateTask(task, now)
    this.logger?.info('Hydrated aria2 runtime session from persisted task', {
      category: 'aria2-adapter',
      details: {
        gid: session.gid,
        status: task.status
      },
      taskId: task.id
    })

    return {
      id: crypto.randomUUID(),
      taskId: task.id,
      remoteId: session.gid,
      source: session.source,
      savePath: session.savePath,
      status: task.status,
      totalBytes: task.totalBytes ?? 0,
      downloadedBytes: task.downloadedBytes,
      speedBytes: task.speedBytes,
      trackerCount: task.facts?.trackerCount ?? task.trackerCount,
      fallbackTrackerCount: task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount,
      createdAt: task.createdAt,
      updatedAt: now
    }
  }

  async startTask(input: TaskIdInput): Promise<DownloadTaskSnapshot> {
    return this.resumeTask(input)
  }

  async getTaskSnapshot(input: TaskIdInput): Promise<DownloadTaskSnapshot> {
    const { result, snapshot } = await this.readSnapshotWithFollowedTasks(input.taskId)
    this.maybeLogSnapshot(result, snapshot)
    this.sessionStore.touchSession(input.taskId, snapshot.updatedAt)
    return snapshot
  }

  async pauseTask(input: TaskIdInput): Promise<DownloadTaskSnapshot> {
    const session = this.sessionStore.getSessionOrThrow(input.taskId)
    this.logger?.info('Sending pause command to aria2', {
      category: 'aria2-adapter',
      details: {
        gid: session.gid
      },
      taskId: input.taskId
    })
    await this.getClientOrThrow().pause(session.gid)
    return this.stateWaiter.waitForSnapshot(
      input,
      (snapshot) => isSettledTaskStatus(snapshot.status)
    )
  }

  async resumeTask(input: TaskIdInput): Promise<DownloadTaskSnapshot> {
    const session = this.sessionStore.getSessionOrThrow(input.taskId)
    this.logger?.info('Sending resume command to aria2', {
      category: 'aria2-adapter',
      details: {
        gid: session.gid
      },
      taskId: input.taskId
    })
    await this.getClientOrThrow().unpause(session.gid)
    return this.stateWaiter.waitForSnapshot(
      input,
      (snapshot) =>
        snapshot.status === 'metadata' ||
        snapshot.status === 'downloading' ||
        isSettledTaskStatus(snapshot.status)
    )
  }

  async deleteTask(input: TaskIdInput): Promise<void> {
    const session = this.sessionStore.getSessionOrThrow(input.taskId)
    const client = this.getClientOrThrow()
    this.logger?.info('Deleting aria2 task', {
      category: 'aria2-adapter',
      details: {
        gid: session.gid
      },
      taskId: input.taskId
    })

    try {
      await client.remove(session.gid)
    } catch (error) {
      const message = getErrorMessage(error, 'aria2 删除任务失败')

      if (!message.includes('Download already completed') && !isMissingGidErrorMessage(message)) {
        throw error
      }
    }

    try {
      await client.removeDownloadResult(session.gid)
    } catch (error) {
      const message = getErrorMessage(error, 'aria2 清理任务结果失败')

      if (!isMissingGidErrorMessage(message)) {
        throw error
      }
    }

    this.sessionStore.deleteSession(input.taskId)
    try {
      await this.cleanupRelatedTasksBySource(session.source, new Set([session.gid]))
    } catch (error) {
      this.logger?.warning('Failed to cleanup related aria2 tasks after deleting primary task', {
        category: 'aria2-adapter',
        details: {
          errorMessage: getErrorMessage(error, 'aria2 清理关联任务失败'),
          gid: session.gid,
          sourcePreview: buildSourcePreview(session.source)
        },
        taskId: input.taskId
      })
    }
  }

  private getClientOrThrow(): Aria2RpcClient {
    if (!this.client) {
      throw new Error(this.unavailableMessage)
    }

    return this.client
  }

  private async readSnapshotWithFollowedTasks(taskId: string): Promise<{
    result: Aria2TellStatusResult
    snapshot: DownloadTaskSnapshot
  }> {
    const client = this.getClientOrThrow()
    let session = this.sessionStore.getSessionOrThrow(taskId)
    let depth = 0

    while (depth < Aria2DownloadAdapter.FOLLOWED_TASK_MAX_DEPTH) {
      const result = await client.tellStatus(session.gid)
      const followedGid = result.followedBy?.[0]
      if (!followedGid || followedGid === session.gid) {
        return {
          result,
          snapshot: buildSnapshot(session, result)
        }
      }

      const switchedAt = toIsoNow()
      this.logger?.info('Switching aria2 task session to followed download GID', {
        category: 'aria2-adapter',
        details: {
          fromGid: session.gid,
          toGid: followedGid
        },
        taskId
      })
      session = this.sessionStore.replaceSessionGid(taskId, followedGid, switchedAt)
      depth += 1
    }

    throw new Error('aria2 followed download chain is deeper than expected')
  }

  private async cleanupRelatedTasksBySource(
    source: string,
    ignoredGids: Set<string> = new Set()
  ): Promise<void> {
    const client = this.getClientOrThrow()
    const [active, waiting, stopped] = await Promise.all([
      client.tellActive(),
      client.tellWaiting(0, ARIA2_SCAN_LIMIT),
      client.tellStopped(0, ARIA2_SCAN_LIMIT)
    ])

    const relatedTasks = await filterRelatedTasksBySource({
      source,
      tasks: [...active, ...waiting, ...stopped],
      ignoredGids,
      readUris: async (gid) => {
        try {
          return await client.getUris(gid)
        } catch (error) {
          const message = getErrorMessage(error, 'aria2 读取任务 URI 失败')

          if (isMissingGidErrorMessage(message)) {
            return []
          }

          throw error
        }
      }
    })

    for (const task of relatedTasks) {
      if (['active', 'waiting', 'paused'].includes(task.status)) {
        try {
          await client.remove(task.gid)
        } catch (error) {
          const message = getErrorMessage(error, 'aria2 删除关联任务失败')

          if (
            !message.includes('Download already completed') &&
            !isMissingGidErrorMessage(message)
          ) {
            throw error
          }
        }
      }

      try {
        await client.removeDownloadResult(task.gid)
      } catch (error) {
        const message = getErrorMessage(error, 'aria2 清理关联任务结果失败')

        if (!isMissingGidErrorMessage(message)) {
          throw error
        }
      }
    }
  }

  private maybeLogSnapshot(result: Aria2TellStatusResult, snapshot: DownloadTaskSnapshot): void {
    if (result.errorCode || result.errorMessage || snapshot.status === 'failed') {
      const errorSignature = `${result.status}:${result.errorCode ?? ''}:${result.errorMessage ?? ''}`

      if (this.lastTaskErrorLog.get(snapshot.taskId) !== errorSignature) {
        this.lastTaskErrorLog.set(snapshot.taskId, errorSignature)
        this.logger?.error('aria2 reported task error state', {
          category: 'aria2-adapter',
          details: {
            aria2Status: result.status,
            errorCode: result.errorCode ?? null,
            errorMessage: result.errorMessage ?? null,
            gid: result.gid
          },
          taskId: snapshot.taskId
        })
      }

      return
    }

    this.lastTaskErrorLog.delete(snapshot.taskId)

    if (
      (snapshot.status === 'metadata' || snapshot.status === 'downloading') &&
      snapshot.speedBytes === 0
    ) {
      const now = Date.now()
      const lastLoggedAt = this.lastZeroSpeedLogAt.get(snapshot.taskId) ?? 0

      if (now - lastLoggedAt >= ARIA2_DIAGNOSTIC_LOG_INTERVAL_MS) {
        this.lastZeroSpeedLogAt.set(snapshot.taskId, now)
        this.logger?.warning('aria2 task is active but currently has zero download speed', {
          category: 'aria2-adapter',
          details: {
            aria2Status: result.status,
            downloadedBytes: snapshot.downloadedBytes,
            gid: result.gid,
            totalBytes: snapshot.totalBytes
          },
          taskId: snapshot.taskId
        })
      }

      return
    }

    this.lastZeroSpeedLogAt.delete(snapshot.taskId)
  }
}

export { Aria2RpcClient } from './rpc-client'
export type { Aria2ClientConfig, Aria2TellStatusResult } from './types'
