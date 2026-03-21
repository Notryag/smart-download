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
  errorMessage?: string
  dir?: string
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
