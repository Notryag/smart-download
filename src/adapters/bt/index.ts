import type {
  CreateDownloadTaskInput,
  DownloadTask,
  DownloadTaskStatus,
  TaskIdInput
} from '../../types'

export type BtSessionState = 'attached' | 'metadata' | 'downloading' | 'paused' | 'completed'

export interface BtAdapterSession {
  id: string
  taskId: string
  source: string
  savePath: string
  state: BtSessionState
  totalBytes: number
  downloadedBytes: number
  speedBytes: number
  metadataStartedAt?: string
  lastActiveAt?: string
  createdAt: string
  updatedAt: string
}

export interface BtTaskSnapshot {
  taskId: string
  state: BtSessionState
  totalBytes: number
  downloadedBytes: number
  speedBytes: number
  progress: number
  etaSeconds?: number
  updatedAt: string
}

export interface AttachBtTaskInput extends CreateDownloadTaskInput {
  taskId: string
}

export interface BtAdapter {
  attachTask(input: AttachBtTaskInput): Promise<BtAdapterSession>
  hydrateTask(task: DownloadTask): Promise<BtAdapterSession>
  startTask(input: TaskIdInput): Promise<BtTaskSnapshot>
  getTaskSnapshot(input: TaskIdInput): Promise<BtTaskSnapshot>
  pauseTask(input: TaskIdInput): Promise<BtTaskSnapshot>
  resumeTask(input: TaskIdInput): Promise<BtTaskSnapshot>
  deleteTask(input: TaskIdInput): Promise<void>
}

export interface QbittorrentClientConfig {
  baseUrl: string
  username: string
  password: string
}

interface QbittorrentTorrentInfo {
  hash: string
  progress: number
  dlspeed: number
  downloaded: number
  eta: number
  state: string
  size?: number
  total_size?: number
}

interface RuntimeSession {
  taskId: string
  infoHash: string
  source: string
  savePath: string
  state: BtSessionState
  totalBytes: number
  downloadedBytes: number
  speedBytes: number
  awaitingRemoteUntil?: number
  lastError?: string
  createdAt: string
  updatedAt: string
}

const REMOTE_TORRENT_VISIBILITY_GRACE_MS = 12_000

function assertMagnetSource(source: string): void {
  if (!source.trim().startsWith('magnet:?')) {
    throw new Error('BT adapter only supports magnet links')
  }
}

function toIsoNow(): string {
  return new Date().toISOString()
}

function clampProgress(downloadedBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) {
    return 0
  }

  return Math.min(1, downloadedBytes / totalBytes)
}

function base32ToHex(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''

  for (const char of value.toUpperCase()) {
    const index = alphabet.indexOf(char)

    if (index === -1) {
      throw new Error('Unsupported base32 magnet hash')
    }

    bits += index.toString(2).padStart(5, '0')
  }

  let hex = ''

  for (let offset = 0; offset + 4 <= bits.length; offset += 4) {
    hex += Number.parseInt(bits.slice(offset, offset + 4), 2).toString(16)
  }

  return hex
}

function parseMagnetInfoHash(source: string): string {
  const magnet = new URL(source.trim())
  const xt = magnet.searchParams.get('xt')

  if (!xt?.startsWith('urn:btih:')) {
    throw new Error('Magnet link is missing btih info hash')
  }

  const rawHash = xt.slice('urn:btih:'.length)

  if (rawHash.length === 40) {
    return rawHash.toLowerCase()
  }

  if (rawHash.length === 32) {
    return base32ToHex(rawHash)
  }

  throw new Error('Unsupported magnet info hash format')
}

function buildSnapshot(session: RuntimeSession): BtTaskSnapshot {
  const progress = clampProgress(session.downloadedBytes, session.totalBytes)
  const remainingBytes = Math.max(session.totalBytes - session.downloadedBytes, 0)
  const etaSeconds =
    session.state === 'downloading' && session.speedBytes > 0
      ? session.totalBytes > 0
        ? remainingBytes / session.speedBytes
        : undefined
      : undefined

  return {
    taskId: session.taskId,
    state: session.state,
    totalBytes: session.totalBytes,
    downloadedBytes: session.downloadedBytes,
    speedBytes: session.speedBytes,
    progress,
    etaSeconds: typeof etaSeconds === 'number' ? Math.ceil(etaSeconds) : undefined,
    updatedAt: session.updatedAt
  }
}

function updateSession(session: RuntimeSession, patch: Partial<RuntimeSession>): RuntimeSession {
  return {
    ...session,
    ...patch,
    updatedAt: toIsoNow()
  }
}

function isAwaitingRemoteTorrent(session: RuntimeSession): boolean {
  return typeof session.awaitingRemoteUntil === 'number' && session.awaitingRemoteUntil > Date.now()
}

function withRemoteVisibilityGrace(
  session: RuntimeSession,
  patch: Partial<RuntimeSession> = {}
): RuntimeSession {
  return updateSession(session, {
    ...patch,
    awaitingRemoteUntil: Date.now() + REMOTE_TORRENT_VISIBILITY_GRACE_MS
  })
}

function mapQbittorrentState(
  state: string,
  progress: number
): { state: BtSessionState; errorMessage?: string } {
  if (
    progress >= 1 ||
    ['uploading', 'stalledUP', 'queuedUP', 'forcedUP', 'pausedUP'].includes(state)
  ) {
    return { state: 'completed' }
  }

  if (state === 'missingFiles') {
    return {
      state: 'paused',
      errorMessage: 'qBittorrent 检测到下载文件缺失或路径不可用'
    }
  }

  if (state === 'error' || state === 'unknown') {
    return {
      state: 'paused',
      errorMessage: 'qBittorrent 返回异常状态，请检查下载器任务详情'
    }
  }

  if (['metaDL', 'forcedMetaDL', 'checkingResumeData'].includes(state)) {
    return { state: 'metadata' }
  }

  if (['pausedDL'].includes(state)) {
    return { state: 'paused' }
  }

  if (
    [
      'downloading',
      'forcedDL',
      'stalledDL',
      'queuedDL',
      'checkingDL',
      'allocating',
      'moving'
    ].includes(state)
  ) {
    return { state: 'downloading' }
  }

  return { state: 'attached' }
}

function getRefererOrigin(baseUrl: string): string {
  const url = new URL(baseUrl)
  return `${url.protocol}//${url.host}`
}

export function btSessionStateToTaskStatus(state: BtSessionState): DownloadTaskStatus {
  switch (state) {
    case 'metadata':
      return 'metadata'
    case 'downloading':
      return 'downloading'
    case 'paused':
      return 'paused'
    case 'completed':
      return 'completed'
    case 'attached':
    default:
      return 'pending'
  }
}

class QbittorrentWebUiClient {
  private sid: string | null = null

  constructor(private readonly config: QbittorrentClientConfig) {}

  async getVersion(): Promise<string> {
    return this.request<string>('/app/version')
  }

  async addMagnet(source: string, savePath: string, paused: boolean): Promise<void> {
    const body = new FormData()
    body.set('urls', source)
    body.set('savepath', savePath)
    body.set('paused', paused ? 'true' : 'false')

    const responseText = await this.request<string>('/torrents/add', {
      method: 'POST',
      body
    })

    if (responseText.trim().toLowerCase().startsWith('fails')) {
      throw new Error('qBittorrent 未接受 magnet 任务，请检查 magnet 链接、保存目录或下载器权限。')
    }
  }

  async getTorrent(infoHash: string): Promise<QbittorrentTorrentInfo | null> {
    const encodedHash = encodeURIComponent(infoHash)
    const result = await this.request(`/torrents/info?hashes=${encodedHash}`, {}, true)
    return Array.isArray(result) && result.length > 0 ? (result[0] as QbittorrentTorrentInfo) : null
  }

  async pause(infoHash: string): Promise<void> {
    await this.postHashes('/torrents/pause', infoHash)
  }

  async resume(infoHash: string): Promise<void> {
    await this.postHashes('/torrents/resume', infoHash)
  }

  async delete(infoHash: string): Promise<void> {
    const body = new URLSearchParams()
    body.set('hashes', infoHash)
    body.set('deleteFiles', 'false')
    await this.request('/torrents/delete', {
      method: 'POST',
      body
    })
  }

  private async postHashes(path: string, infoHash: string): Promise<void> {
    const body = new URLSearchParams()
    body.set('hashes', infoHash)
    await this.request(path, {
      method: 'POST',
      body
    })
  }

  private async login(): Promise<void> {
    if (this.sid) {
      return
    }

    const body = new URLSearchParams()
    body.set('username', this.config.username)
    body.set('password', this.config.password)

    const response = await fetch(new URL('/api/v2/auth/login', this.config.baseUrl), {
      method: 'POST',
      headers: {
        Origin: getRefererOrigin(this.config.baseUrl),
        Referer: getRefererOrigin(this.config.baseUrl)
      },
      body
    })

    if (!response.ok) {
      throw new Error(`qBittorrent 登录失败 (${response.status})`)
    }

    const cookie = response.headers.get('set-cookie')
    const sid = cookie?.match(/SID=([^;]+)/)?.[1]

    if (!sid) {
      throw new Error('qBittorrent 登录成功但未返回 SID Cookie')
    }

    this.sid = sid
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
    parseJson = false
  ): Promise<T> {
    await this.login()

    const response = await fetch(new URL(`/api/v2${path}`, this.config.baseUrl), {
      ...init,
      headers: {
        Cookie: `SID=${this.sid}`,
        Origin: getRefererOrigin(this.config.baseUrl),
        Referer: getRefererOrigin(this.config.baseUrl),
        ...(init.headers ?? {})
      }
    })

    if (response.status === 403) {
      this.sid = null
      await this.login()
      return this.request<T>(path, init, parseJson)
    }

    if (!response.ok) {
      throw new Error(`qBittorrent WebUI 请求失败 (${response.status})`)
    }

    return parseJson ? ((await response.json()) as T) : ((await response.text()) as T)
  }
}

export class QbittorrentBtAdapter implements BtAdapter {
  private readonly sessions = new Map<string, RuntimeSession>()
  private readonly client: QbittorrentWebUiClient | null

  constructor(config: QbittorrentClientConfig | null) {
    this.client = config ? new QbittorrentWebUiClient(config) : null
  }

  async attachTask(input: AttachBtTaskInput): Promise<BtAdapterSession> {
    assertMagnetSource(input.source)
    const client = this.getClientOrThrow()
    const infoHash = parseMagnetInfoHash(input.source)
    const now = toIsoNow()
    const session: RuntimeSession = {
      taskId: input.taskId,
      infoHash,
      source: input.source.trim(),
      savePath: input.savePath.trim(),
      state: 'attached',
      totalBytes: 0,
      downloadedBytes: 0,
      speedBytes: 0,
      awaitingRemoteUntil: Date.now() + REMOTE_TORRENT_VISIBILITY_GRACE_MS,
      createdAt: now,
      updatedAt: now
    }

    await client.addMagnet(session.source, session.savePath, true)
    this.sessions.set(input.taskId, session)

    return this.toAdapterSession(session)
  }

  async hydrateTask(task: DownloadTask): Promise<BtAdapterSession> {
    assertMagnetSource(task.source)

    const now = toIsoNow()
    const session: RuntimeSession = {
      taskId: task.id,
      infoHash: parseMagnetInfoHash(task.source),
      source: task.source.trim(),
      savePath: task.savePath.trim(),
      state: task.status === 'completed' ? 'completed' : 'paused',
      totalBytes: task.totalBytes ?? 0,
      downloadedBytes: task.downloadedBytes,
      speedBytes: 0,
      createdAt: task.createdAt,
      updatedAt: now
    }

    this.sessions.set(task.id, session)

    return this.toAdapterSession(session)
  }

  async startTask(input: TaskIdInput): Promise<BtTaskSnapshot> {
    const session = this.getSessionOrThrow(input.taskId)
    await this.getClientOrThrow().resume(session.infoHash)

    const nextSession = withRemoteVisibilityGrace(session, {
      state: 'metadata',
      lastError: undefined
    })
    this.sessions.set(input.taskId, nextSession)

    return this.getTaskSnapshot(input)
  }

  async getTaskSnapshot(input: TaskIdInput): Promise<BtTaskSnapshot> {
    const client = this.getClientOrThrow()
    const session = this.getSessionOrThrow(input.taskId)
    const torrent = await client.getTorrent(session.infoHash)

    if (!torrent) {
      if (session.state === 'completed') {
        return buildSnapshot(session)
      }

      if (isAwaitingRemoteTorrent(session)) {
        return buildSnapshot(session)
      }

      if (typeof session.awaitingRemoteUntil === 'number') {
        throw new Error(
          'qBittorrent 未发现该 magnet 任务，请检查 WebUI 配置、保存目录或下载器日志。'
        )
      }

      throw new Error('qBittorrent 中未找到对应 torrent 任务')
    }

    const stateResult = mapQbittorrentState(torrent.state, torrent.progress)
    const totalBytes = torrent.total_size ?? torrent.size ?? session.totalBytes
    const nextSession = updateSession(session, {
      state: stateResult.state,
      totalBytes,
      downloadedBytes: Math.max(torrent.downloaded, 0),
      speedBytes: Math.max(torrent.dlspeed, 0),
      awaitingRemoteUntil: undefined,
      lastError: stateResult.errorMessage
    })

    this.sessions.set(input.taskId, nextSession)

    if (nextSession.lastError) {
      throw new Error(nextSession.lastError)
    }

    const snapshot = buildSnapshot(nextSession)
    return {
      ...snapshot,
      progress: torrent.progress,
      etaSeconds: torrent.eta >= 0 ? torrent.eta : snapshot.etaSeconds
    }
  }

  async pauseTask(input: TaskIdInput): Promise<BtTaskSnapshot> {
    const session = this.getSessionOrThrow(input.taskId)
    await this.getClientOrThrow().pause(session.infoHash)
    const nextSession = updateSession(session, {
      state: 'paused',
      speedBytes: 0
    })
    this.sessions.set(input.taskId, nextSession)

    return this.getTaskSnapshot(input)
  }

  async resumeTask(input: TaskIdInput): Promise<BtTaskSnapshot> {
    const session = this.getSessionOrThrow(input.taskId)
    await this.getClientOrThrow().resume(session.infoHash)
    const nextSession = withRemoteVisibilityGrace(session, {
      state: 'metadata',
      lastError: undefined
    })
    this.sessions.set(input.taskId, nextSession)

    return this.getTaskSnapshot(input)
  }

  async deleteTask(input: TaskIdInput): Promise<void> {
    const session = this.getSessionOrThrow(input.taskId)
    await this.getClientOrThrow().delete(session.infoHash)
    this.sessions.delete(input.taskId)
  }

  async getClientVersion(): Promise<string> {
    return this.getClientOrThrow().getVersion()
  }

  private toAdapterSession(session: RuntimeSession): BtAdapterSession {
    return {
      id: crypto.randomUUID(),
      taskId: session.taskId,
      source: session.source,
      savePath: session.savePath,
      state: session.state,
      totalBytes: session.totalBytes,
      downloadedBytes: session.downloadedBytes,
      speedBytes: session.speedBytes,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }
  }

  private getClientOrThrow(): QbittorrentWebUiClient {
    if (!this.client) {
      throw new Error(
        '未配置 qBittorrent WebUI。请设置 QBITTORRENT_BASE_URL、QBITTORRENT_USERNAME、QBITTORRENT_PASSWORD。'
      )
    }

    return this.client
  }

  private getSessionOrThrow(taskId: string): RuntimeSession {
    const session = this.sessions.get(taskId)

    if (!session) {
      throw new Error(`BT session not found for task: ${taskId}`)
    }

    return session
  }
}
