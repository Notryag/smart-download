import type {
  Aria2ClientConfig,
  Aria2RpcResponse,
  Aria2TellStatusResult,
  Aria2UriResult
} from './types'

const ARIA2_STATUS_QUERY_KEYS = ['gid', 'status', 'infoHash'] as const

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

  async getUris(gid: string): Promise<Aria2UriResult[]> {
    return this.request('aria2.getUris', [gid])
  }

  async tellActive(keys: readonly string[] = ARIA2_STATUS_QUERY_KEYS): Promise<Aria2TellStatusResult[]> {
    return this.request('aria2.tellActive', [keys])
  }

  async tellWaiting(
    offset: number,
    num: number,
    keys: readonly string[] = ARIA2_STATUS_QUERY_KEYS
  ): Promise<Aria2TellStatusResult[]> {
    return this.request('aria2.tellWaiting', [offset, num, keys])
  }

  async tellStopped(
    offset: number,
    num: number,
    keys: readonly string[] = ARIA2_STATUS_QUERY_KEYS
  ): Promise<Aria2TellStatusResult[]> {
    return this.request('aria2.tellStopped', [offset, num, keys])
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
    const json = (await response.json()) as Aria2RpcResponse<T>

    if (json.error) {
      throw new Error(`aria2 RPC 错误 (${json.error.code}): ${json.error.message}`)
    }

    if (!response.ok) {
      throw new Error(`aria2 RPC 请求失败 (${response.status})`)
    }

    if (json.result === undefined) {
      throw new Error('aria2 RPC 未返回 result')
    }

    return json.result
  }
}
