export interface Aria2ClientConfig {
  rpcUrl: string
  secret?: string
}

export interface Aria2TellStatusResult {
  gid: string
  status: string
  totalLength: string
  completedLength: string
  downloadSpeed: string
  followedBy?: string[]
  belongsTo?: string
  infoHash?: string
  errorCode?: string
  errorMessage?: string
  dir?: string
}

export interface RuntimeSession {
  taskId: string
  gid: string
  source: string
  savePath: string
  createdAt: string
  updatedAt: string
}

export interface Aria2RpcResponse<T> {
  result?: T
  error?: {
    code: number
    message: string
  }
}
