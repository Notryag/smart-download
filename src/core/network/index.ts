import { lookup } from 'node:dns/promises'

const BT_BOOTSTRAP_HOSTS = ['router.bittorrent.com', 'dht.transmissionbt.com']

export interface NetworkChecker {
  assertBtNetworkReady(): Promise<void>
  getBtNetworkStatus(): Promise<{
    ready: boolean
    message: string
  }>
}

export class DnsNetworkChecker implements NetworkChecker {
  async assertBtNetworkReady(): Promise<void> {
    const status = await this.getBtNetworkStatus()

    if (!status.ready) {
      throw new Error(status.message)
    }
  }

  async getBtNetworkStatus(): Promise<{ ready: boolean; message: string }> {
    for (const host of BT_BOOTSTRAP_HOSTS) {
      try {
        await lookup(host)

        return {
          ready: true,
          message: `已通过 ${host} 完成基础网络检查。`
        }
      } catch {
        continue
      }
    }

    return {
      ready: false,
      message: '当前网络不可用，无法连接 BT 网络。请检查网络连接或代理设置后重试。'
    }
  }
}
