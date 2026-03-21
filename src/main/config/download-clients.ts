import type { Aria2ClientConfig, QbittorrentClientConfig } from '../../adapters'

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

export function readQbittorrentClientConfig(): QbittorrentClientConfig | null {
  const baseUrl = readEnv('QBITTORRENT_BASE_URL')
  const username = readEnv('QBITTORRENT_USERNAME')
  const password = readEnv('QBITTORRENT_PASSWORD')

  if (!baseUrl || !username || !password) {
    return null
  }

  return {
    baseUrl,
    username,
    password
  }
}

export function readAria2ClientConfig(): Aria2ClientConfig | null {
  const rpcUrl = readEnv('ARIA2_RPC_URL')

  if (!rpcUrl) {
    return null
  }

  return {
    rpcUrl,
    secret: readEnv('ARIA2_RPC_SECRET') ?? undefined
  }
}
