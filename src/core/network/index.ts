import { lookup } from 'node:dns/promises'

const BT_BOOTSTRAP_HOSTS = ['router.bittorrent.com', 'dht.transmissionbt.com']

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export interface NetworkChecker {
  assertBtNetworkReady(): Promise<void>
}

export class DnsNetworkChecker implements NetworkChecker {
  async assertBtNetworkReady(): Promise<void> {
    for (const host of BT_BOOTSTRAP_HOSTS) {
      try {
        await lookup(host)
        return
      } catch {
        continue
      }
    }

    throw new Error('当前网络不可用，无法连接 BT 网络。请检查网络连接或代理设置后重试。')
  }

  formatCheckError(error: unknown): string {
    return getErrorMessage(error, '网络检查失败')
  }
}
