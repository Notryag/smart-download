import type {
  DownloadAdapter,
  DownloadAdapterRuntimeStatus,
  DownloadAdapterSession,
  DownloadTaskSnapshot
} from '../download'
import type { DownloadTask, TaskIdInput } from '../../types'
import type { LogContext } from '../../core'
import type { Aria2ClientConfig, Aria2RpcResponse, Aria2TellStatusResult } from './types'
import { Aria2RuntimeSessionStore } from './runtime-session-store'
import {
  ARIA2_DIAGNOSTIC_LOG_INTERVAL_MS,
  ARIA2_STATE_SETTLE_INTERVAL_MS,
  ARIA2_STATE_SETTLE_TIMEOUT_MS,
  assertSource,
  buildSnapshot,
  buildSourcePreview,
  delay,
  getErrorMessage,
  isSettledTaskStatus,
  toIsoNow,
  toRuntimeStatusMessage
} from './utils'

interface AdapterLogger {
  info(message: string, context?: LogContext | string): void
  warning(message: string, context?: LogContext | string): void
  error(message: string, context?: LogContext | string): void
}

export class Aria2RpcClient {
  constructor(private readonly config: Aria2ClientConfig) {}

  async getVersion(): Promise<{ version: string; enabledFeatures: string[] }> {
    return this.request('aria2.getVersion', [])
  }

  async addUri(uris: string[], options: Record<string, string> = {}): Promise<string> {
    return this.request('aria2.addUri', [uris, options])
  }

  async tellStatus(gid: string): Promise<Aria2TellStatusResult> {
    return this.request('aria2.tellStatus', [gid])
  }

  async pause(gid: string): Promise<string> {
    return this.request('aria2.forcePause', [gid])
  }

  async unpause(gid: string): Promise<string> {
    return this.request('aria2.unpause', [gid])
  }

  async remove(gid: string): Promise<string> {
    return this.request('aria2.forceRemove', [gid])
  }

  async removeDownloadResult(gid: string): Promise<string> {
    return this.request('aria2.removeDownloadResult', [gid])
  }

  private async request<T>(method: string, params: unknown[]): Promise<T> {
    const payload = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params: this.config.secret ? [`token:${this.config.secret}`, ...params] : params
    }

    const response = await fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`aria2 RPC 请求失败 (${response.status})`)
    }

    const json = (await response.json()) as Aria2RpcResponse<T>

    if (json.error) {
      throw new Error(`aria2 RPC 错误 (${json.error.code}): ${json.error.message}`)
    }

    if (json.result === undefined) {
      throw new Error('aria2 RPC 未返回 result')
    }

    return json.result
  }
}

export class Aria2DownloadAdapter implements DownloadAdapter {
  private readonly client: Aria2RpcClient | null
  private readonly sessionStore = new Aria2RuntimeSessionStore()
  private readonly lastTaskErrorLog = new Map<string, string>()
  private readonly lastZeroSpeedLogAt = new Map<string, number>()

  constructor(
    config: Aria2ClientConfig | null,
    private readonly unavailableMessage = '未配置 aria2 RPC。',
    private readonly logger?: AdapterLogger
  ) {
    this.client = config ? new Aria2RpcClient(config) : null
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
    this.logger?.info('Submitting task to aria2 RPC', {
      category: 'aria2-adapter',
      details: {
        savePath: input.savePath.trim(),
        sourcePreview: buildSourcePreview(input.source)
      },
      taskId: input.taskId
    })
    const gid = await client.addUri([input.source.trim()], {
      dir: input.savePath.trim(),
      pause: 'true'
    })

    const session = this.sessionStore.createSession({
      taskId: input.taskId,
      gid,
      source: input.source.trim(),
      savePath: input.savePath.trim(),
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
      createdAt: task.createdAt,
      updatedAt: now
    }
  }

  async startTask(input: TaskIdInput): Promise<DownloadTaskSnapshot> {
    return this.resumeTask(input)
  }

  async getTaskSnapshot(input: TaskIdInput): Promise<DownloadTaskSnapshot> {
    const session = this.sessionStore.getSessionOrThrow(input.taskId)
    const result = await this.getClientOrThrow().tellStatus(session.gid)
    const snapshot = buildSnapshot(session, result)
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
    return this.waitForSnapshot(input, (snapshot) => isSettledTaskStatus(snapshot.status))
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
    return this.waitForSnapshot(
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

      if (!message.includes('Download already completed')) {
        throw error
      }
    }

    try {
      await client.removeDownloadResult(session.gid)
    } catch (error) {
      const message = getErrorMessage(error, 'aria2 清理任务结果失败')

      if (!message.includes('Invalid GID')) {
        throw error
      }
    }

    this.sessionStore.deleteSession(input.taskId)
  }

  private getClientOrThrow(): Aria2RpcClient {
    if (!this.client) {
      throw new Error(this.unavailableMessage)
    }

    return this.client
  }

  private async waitForSnapshot(
    input: TaskIdInput,
    predicate: (snapshot: DownloadTaskSnapshot) => boolean
  ): Promise<DownloadTaskSnapshot> {
    const deadline = Date.now() + ARIA2_STATE_SETTLE_TIMEOUT_MS

    while (Date.now() < deadline) {
      const snapshot = await this.getTaskSnapshot(input)

      if (predicate(snapshot)) {
        return snapshot
      }

      await delay(ARIA2_STATE_SETTLE_INTERVAL_MS)
    }

    this.logger?.warning('aria2 task did not reach expected state before timeout', {
      category: 'aria2-adapter',
      details: {
        timeoutMs: ARIA2_STATE_SETTLE_TIMEOUT_MS
      },
      taskId: input.taskId
    })
    return this.getTaskSnapshot(input)
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

export type { Aria2ClientConfig, Aria2TellStatusResult } from './types'
