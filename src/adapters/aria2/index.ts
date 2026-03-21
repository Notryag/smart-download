import type {
  DownloadAdapter,
  DownloadAdapterRuntimeStatus,
  DownloadAdapterSession,
  DownloadTaskSnapshot
} from '../download'
import type { DownloadTask, DownloadTaskStatus, TaskIdInput } from '../../types'

export interface Aria2ClientConfig {
  rpcUrl: string
  secret?: string
}

interface Aria2RpcResponse<T> {
  result?: T
  error?: {
    code: number
    message: string
  }
}

export interface Aria2TellStatusResult {
  gid: string
  status: string
  totalLength: string
  completedLength: string
  downloadSpeed: string
  errorCode?: string
  errorMessage?: string
  dir?: string
}

interface RuntimeSession {
  taskId: string
  gid: string
  source: string
  savePath: string
  createdAt: string
  updatedAt: string
}

function toIsoNow(): string {
  return new Date().toISOString()
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function assertSource(source: string): void {
  if (source.trim().length === 0) {
    throw new Error('下载地址不能为空。')
  }
}

function parseBytes(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '0', 10)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function parseEtaSeconds(
  totalBytes: number,
  downloadedBytes: number,
  speedBytes: number
): number | undefined {
  if (speedBytes <= 0 || totalBytes <= 0) {
    return undefined
  }

  const remainingBytes = Math.max(totalBytes - downloadedBytes, 0)
  return Math.ceil(remainingBytes / speedBytes)
}

function mapAria2Status(source: string, status: string, totalBytes: number): DownloadTaskStatus {
  switch (status) {
    case 'active':
      return source.startsWith('magnet:?') && totalBytes === 0 ? 'metadata' : 'downloading'
    case 'waiting':
      return 'pending'
    case 'paused':
      return 'paused'
    case 'complete':
      return 'completed'
    case 'removed':
      return 'canceled'
    case 'error':
      return 'failed'
    default:
      return 'pending'
  }
}

function toRuntimeStatusMessage(error: unknown): string {
  const message = getErrorMessage(error, 'aria2 RPC 不可用')

  if (message.includes('fetch failed')) {
    return '无法连接 aria2 RPC。请确认 aria2 已启动，并已启用 RPC。'
  }

  return `aria2 RPC 检查失败：${message}`
}

function buildSnapshot(
  session: RuntimeSession,
  result: Aria2TellStatusResult
): DownloadTaskSnapshot {
  const totalBytes = parseBytes(result.totalLength)
  const downloadedBytes = parseBytes(result.completedLength)
  const speedBytes = parseBytes(result.downloadSpeed)
  const progress = totalBytes > 0 ? Math.min(downloadedBytes / totalBytes, 1) : 0
  const status = mapAria2Status(session.source, result.status, totalBytes)

  return {
    taskId: session.taskId,
    remoteId: session.gid,
    status,
    totalBytes,
    downloadedBytes,
    speedBytes,
    progress,
    etaSeconds: parseEtaSeconds(totalBytes, downloadedBytes, speedBytes),
    errorMessage: result.errorMessage,
    updatedAt: toIsoNow()
  }
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
  private readonly sessions = new Map<string, RuntimeSession>()
  private readonly client: Aria2RpcClient | null

  constructor(config: Aria2ClientConfig | null) {
    this.client = config ? new Aria2RpcClient(config) : null
  }

  async getRuntimeStatus(): Promise<DownloadAdapterRuntimeStatus> {
    if (!this.client) {
      return {
        ready: false,
        client: 'aria2',
        message: '未配置 aria2 RPC。请设置 ARIA2_RPC_URL，必要时补充 ARIA2_RPC_SECRET。'
      }
    }

    try {
      const version = await this.client.getVersion()
      return {
        ready: true,
        client: 'aria2',
        message: `aria2 RPC 已连接，版本 ${version.version}。`
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
    const gid = await client.addUri([input.source.trim()], {
      dir: input.savePath.trim(),
      pause: 'true'
    })

    const session: RuntimeSession = {
      taskId: input.taskId,
      gid,
      source: input.source.trim(),
      savePath: input.savePath.trim(),
      createdAt: now,
      updatedAt: now
    }

    this.sessions.set(input.taskId, session)

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

    if (!task.remoteId) {
      throw new Error('任务缺少 aria2 GID，无法恢复运行时状态。')
    }

    const now = toIsoNow()
    const session: RuntimeSession = {
      taskId: task.id,
      gid: task.remoteId,
      source: task.source.trim(),
      savePath: task.savePath.trim(),
      createdAt: task.createdAt,
      updatedAt: now
    }

    this.sessions.set(task.id, session)

    return {
      id: crypto.randomUUID(),
      taskId: task.id,
      remoteId: task.remoteId,
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
    const session = this.getSessionOrThrow(input.taskId)
    const result = await this.getClientOrThrow().tellStatus(session.gid)
    const snapshot = buildSnapshot(session, result)

    this.sessions.set(input.taskId, {
      ...session,
      updatedAt: snapshot.updatedAt
    })

    return snapshot
  }

  async pauseTask(input: TaskIdInput): Promise<DownloadTaskSnapshot> {
    const session = this.getSessionOrThrow(input.taskId)
    await this.getClientOrThrow().pause(session.gid)
    return this.getTaskSnapshot(input)
  }

  async resumeTask(input: TaskIdInput): Promise<DownloadTaskSnapshot> {
    const session = this.getSessionOrThrow(input.taskId)
    await this.getClientOrThrow().unpause(session.gid)
    return this.getTaskSnapshot(input)
  }

  async deleteTask(input: TaskIdInput): Promise<void> {
    const session = this.getSessionOrThrow(input.taskId)
    const client = this.getClientOrThrow()

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

    this.sessions.delete(input.taskId)
  }

  private getClientOrThrow(): Aria2RpcClient {
    if (!this.client) {
      throw new Error('未配置 aria2 RPC。请设置 ARIA2_RPC_URL，必要时补充 ARIA2_RPC_SECRET。')
    }

    return this.client
  }

  private getSessionOrThrow(taskId: string): RuntimeSession {
    const session = this.sessions.get(taskId)

    if (!session) {
      throw new Error(`Download session not found for task: ${taskId}`)
    }

    return session
  }
}
