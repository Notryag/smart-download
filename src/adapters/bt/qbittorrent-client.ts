import type { QbittorrentClientConfig, QbittorrentTorrentInfo } from './types'

function getRefererOrigin(baseUrl: string): string {
  const url = new URL(baseUrl)
  return `${url.protocol}//${url.host}`
}

export class QbittorrentWebUiClient {
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
